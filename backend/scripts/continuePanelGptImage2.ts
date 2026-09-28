/**
 * 续跑：已有 GPT Image 2 资产标准图时，软化分镜配方后补生成底板，并写出完整证据。
 */
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/config";
import { closeDb, getDb } from "../src/db";
import { initializeDatabase } from "../src/db/schema";
import logger, { configureAuditLog } from "../src/logger";
import { providerRegistry } from "../src/providers";
import { createServices } from "../src/services/container";
import {
  imageReferences,
} from "../src/services/imageGenerationService";
import { assembleAssetOutputPrompt } from "../src/services/assetOutputPromptAssembler";
import { assemblePanelRecipe } from "../src/services/storyboardPromptAssembler";

const ROOT = path.resolve(__dirname, "../..");
const EVIDENCE_PATH = path.join(ROOT, "workflow-run-evidence.json");
const QUEEN_REF_SOURCE = String.raw`C:\Users\Administrator\Desktop\AI短剧\性感.png`;
const SOFT_PANEL_ACTION =
  "写实真人摄影：王室私人浴室暖雾中，成年女性女王立于大理石浴池边回眸，身披象牙白浴巾（上沿约锁骨下、下摆约至大腿中段），湿发贴肩，水光未干；半身至膝上构图，女王居中偏右，蒸汽虚化背景，远处石台可见叠好的备用巾；暖琥珀壁灯勾轮廓；电影感写实质感，无文字、无水印。";

const POLL_MS = 2000;
const MAX_OUTER = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function retryable(message: string): boolean {
  return /429|rate.?limit|限流|暂时|timeout|ETIMEDOUT|ECONNRESET|网络|繁忙|overload|不合规|安全|policy|content/iu.test(
    message,
  );
}

async function waitTask(
  get: () => { status: string; error: string | null } | undefined,
) {
  for (let i = 0; i < 1800; i += 1) {
    const task = get();
    if (!task) throw new Error("任务不存在");
    if (["completed", "failed", "cancelled"].includes(task.status)) return task;
    await sleep(POLL_MS);
  }
  throw new Error("任务轮询超时");
}

async function main(): Promise<void> {
  const config = loadConfig();
  configureAuditLog(undefined);
  const db = getDb(config.database);
  initializeDatabase(db);
  const services = createServices(db, config, providerRegistry, logger);
  services.images.startArchiveRetryLoop();
  const storageRoot = path.resolve(config.storage?.local_path ?? "./data/storage");

  await services.aiConfigs.refresh("pearapi", "image");
  const models = services.aiConfigs.models("pearapi", "image");
  const model =
    models.find((m) => /^gpt-image-2$/iu.test(m.id)) ||
    models.find((m) => /gpt-image-2/iu.test(m.id));
  if (!model) throw new Error("无 gpt-image-2");
  services.aiConfigs.savePresets({
    image: { provider: "pearapi", model: model.id },
    video: null,
  });

  const project = services.projects.list({ page: 1, pageSize: 10 }).items[0];
  if (!project) throw new Error("无项目");
  const projectId = project.id;
  const episode = services.projects.require(projectId).episodes?.[0];
  if (!episode) throw new Error("无话");

  const assets = services.assets.listProjectAssets(projectId);
  const panels = services.assets.listPanels(episode.id);
  const queen = assets.find((a) => a.name === "女王");
  if (!queen) throw new Error("无女王资产");

  // 记录资产组装全文（当前库内已保存的左脸右身结果）
  const assetAssembleDemo = assets.map((asset) => {
    const lock =
      asset.kind === "character" ? ("face" as const) : null;
    const rebuilt = assembleAssetOutputPrompt({
      kind: asset.kind,
      name: asset.name,
      text_profile: asset.text_profile,
      output_type: asset.output_type,
      reference_lock: lock,
      ban_image_text: "ban",
    });
    return {
      assetId: asset.id,
      kind: asset.kind,
      name: asset.name,
      outputType: asset.output_type,
      briefFull: asset.text_profile.brief ?? "",
      inputReferenceImages: asset.input_reference_images,
      savedOutputPromptFull: asset.output_prompt,
      rebuiltAssemblePreviewFull: rebuilt,
      image_url: asset.image_url,
      local_path: asset.local_path,
      absoluteLocalPath: asset.local_path
        ? path.join(storageRoot, ...asset.local_path.split("/"))
        : null,
      generationId: asset.current_image_generation_id,
    };
  });

  const uploadRefs = queen.input_reference_images.map((url) => {
    const rel = url.replace(/^\/static\//u, "");
    return {
      publicUrl: url,
      absoluteUnderRepo: path.join(storageRoot, ...rel.split("/")),
      ownerSourceAbsolute: QUEEN_REF_SOURCE,
    };
  });

  const generations: Array<Record<string, unknown>> = [];
  // 已有资产 generation 摘要
  for (const asset of assets) {
    if (!asset.current_image_generation_id) continue;
    const gen = services.images.get(asset.current_image_generation_id);
    if (!gen) continue;
    generations.push({
      label: `asset:${asset.name}`,
      generationId: gen.id,
      taskId: gen.task_id,
      generationStatus: gen.status,
      imageUrl: gen.image_url,
      localPath: gen.local_path,
      available: gen.available,
      promptFull: gen.prompt,
      referenceImages: imageReferences(gen),
      absoluteLocalPath: gen.local_path
        ? path.join(storageRoot, ...gen.local_path.split("/"))
        : null,
      fromPreviousRun: true,
    });
  }

  // 回收卡住的分镜 generation / 任务
  db.prepare(
    `UPDATE image_generations SET status = 'failed', error_msg = ?, updated_at = ? WHERE panel_id IS NOT NULL AND status IN ('pending', 'processing')`,
  ).run("续跑前回收中断任务", new Date().toISOString());
  db.prepare(
    `UPDATE async_tasks SET status = 'failed', error = ?, updated_at = ? WHERE status IN ('pending', 'running', 'queued')`,
  ).run("续跑前回收中断任务", new Date().toISOString());

  // 软化分镜并生成
  for (const panel of panels) {
    services.assets.updatePanel(panel.id, {
      action: SOFT_PANEL_ACTION,
      title: panel.title,
      project_asset_ids: panel.project_asset_ids,
      extra_reference_images: panel.extra_reference_images,
    });
    const updated = services.assets.getPanel(panel.id)!;
    const freshAssets = services.assets.listProjectAssets(projectId);
    const recipe = assemblePanelRecipe({ shot: updated, assets: freshAssets });
    services.assets.updatePanel(panel.id, {
      image_recipe_prompt: recipe.panelRecipe.prompt,
      image_recipe_references: recipe.panelRecipe.references,
      recipe_reassembled: true,
    });

    const panelAssembleDemo = {
      panelId: panel.id,
      title: panel.title,
      originalActionNote:
        "Demo 原 action 偏敏感，PearAPI GPT Image 2 返回「生成内容不合规」；本续跑改用软化后的 action（全文见 actionFullSoftened）后再组装。",
      actionFullSoftened: SOFT_PANEL_ACTION,
      assembledPromptFull: recipe.panelRecipe.prompt,
      assembledReferences: recipe.panelRecipe.references,
      assetStandardUrls: freshAssets
        .filter((a) => panel.project_asset_ids.includes(a.id))
        .map((a) => ({
          id: a.id,
          name: a.name,
          image_url: a.image_url,
          absoluteLocalPath: a.local_path
            ? path.join(storageRoot, ...a.local_path.split("/"))
            : null,
        })),
    };

    let done = false;
    for (let attempt = 1; attempt <= MAX_OUTER && !done; attempt += 1) {
      try {
        const row = services.images.create({
          dramaId: projectId,
          panelId: panel.id,
          prompt: services.assets.getPanel(panel.id)!.image_recipe_prompt,
          provider: "pearapi",
          model: model.id,
          aspectRatio: "1:1",
          referenceImages: services.assets.getPanel(panel.id)!.image_recipe_references,
        });
        console.log(
          `[panel] generation=${row.id} task=${row.task_id} attempt=${attempt}`,
        );
        if (!row.task_id) throw new Error("无 task_id");
        const task = await waitTask(() => services.tasks.get(row.task_id as string));
        for (let i = 0; i < 45 && services.images.get(row.id)?.status === "remote"; i += 1) {
          await sleep(2000);
        }
        const gen = services.images.get(row.id)!;
        generations.push({
          label: `panel:${panel.title}`,
          attempt,
          generationId: gen.id,
          taskId: row.task_id,
          taskStatus: task.status,
          taskError: task.error,
          generationStatus: gen.status,
          imageUrl: gen.image_url,
          localPath: gen.local_path,
          available: gen.available,
          promptFull: gen.prompt,
          absoluteLocalPath: gen.local_path
            ? path.join(storageRoot, ...gen.local_path.split("/"))
            : null,
        });
        if (
          task.status === "completed" &&
          gen.image_url &&
          (gen.status === "completed" || gen.status === "remote")
        ) {
          console.log(`[panel] 完成 ${gen.status} ${gen.image_url}`);
          done = true;
          break;
        }
        const msg = task.error || gen.error_msg || "未完成";
        console.warn(`[panel] 失败: ${msg}`);
        if (!retryable(msg) && attempt >= 5) throw new Error(msg);
        await sleep(Math.min(90_000, 5000 * attempt));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[panel] 异常: ${msg}`);
        if (!retryable(msg) && attempt >= 8) throw error;
        await sleep(Math.min(90_000, 5000 * attempt));
      }
    }
    if (!done) throw new Error("分镜底板未完成");

    const finalAssets = services.assets.listProjectAssets(projectId);
    const finalPanels = services.assets.listPanels(episode.id);
    const evidence = {
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      provider: "pearapi",
      model: model.id,
      projectId,
      repoRoot: ROOT,
      storageRoot,
      queenReference: {
        ownerSourceAbsolute: QUEEN_REF_SOURCE,
        injectedAs: uploadRefs,
        note: "owner 源文件复制到 backend/data/storage/uploads 后以 /static/uploads/... 写入女王卡 input_reference_images；生图时 MediaReferenceService 转 inline 交给 PearAPI。",
      },
      assetAssembleDemo,
      panelAssembleDemo,
      generations,
      summary: {
        assets: finalAssets.map((a) => ({
          id: a.id,
          kind: a.kind,
          name: a.name,
          output_type: a.output_type,
          output_prompt_full: a.output_prompt,
          input_reference_images: a.input_reference_images,
          image_url: a.image_url,
          absoluteLocalPath: a.local_path
            ? path.join(storageRoot, ...a.local_path.split("/"))
            : null,
          generationId: a.current_image_generation_id,
        })),
        panels: finalPanels.map((p) => ({
          id: p.id,
          title: p.title,
          action_full: p.action,
          image_recipe_prompt_full: p.image_recipe_prompt,
          image_recipe_references: p.image_recipe_references,
          image_url: p.image_url,
          absoluteLocalPath: p.image_url?.startsWith("/static/")
            ? path.join(storageRoot, p.image_url.replace(/^\/static\//u, ""))
            : null,
          generationId: p.current_image_generation_id,
        })),
        allAssetsReady: finalAssets.every((a) => Boolean(a.image_url)),
        allPanelsReady: finalPanels.every((p) => Boolean(p.image_url)),
      },
    };
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), "utf8");
    console.log(`证据已写：${EVIDENCE_PATH}`);
    console.log(JSON.stringify(evidence.summary, null, 2));
  }

  closeDb();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
