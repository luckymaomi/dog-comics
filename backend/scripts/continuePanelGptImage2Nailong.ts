/**
 * 续跑：三资产已由 nano-banana-pro-4k 完成；分镜底板改用 PearAPI gpt-image-2、画幅 1:1。
 */
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/config";
import { closeDb, getDb } from "../src/db";
import { initializeDatabase } from "../src/db/schema";
import logger, { configureAuditLog } from "../src/logger";
import { providerRegistry } from "../src/providers";
import { createServices } from "../src/services/container";
import { assemblePanelRecipe } from "../src/services/storyboardPromptAssembler";

const ROOT = path.resolve(__dirname, "../..");
const EVIDENCE_PATH = path.join(ROOT, "workflow-run-evidence.json");
const MODEL_ID = "gpt-image-2";
const POLL_MS = 2000;
const MAX_OUTER = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(message: string): boolean {
  return /429|rate.?limit|限流|暂时|timeout|ETIMEDOUT|ECONNRESET|网络|too many|繁忙|overload/iu.test(
    message,
  );
}

async function waitTask(
  get: () =>
    | { status: string; error: string | null; result?: unknown }
    | undefined,
): Promise<{ status: string; error: string | null; result?: unknown }> {
  for (let i = 0; i < 1800; i += 1) {
    const task = get();
    if (!task) throw new Error("任务不存在");
    if (
      task.status === "completed" ||
      task.status === "failed" ||
      task.status === "cancelled"
    ) {
      return task;
    }
    await sleep(POLL_MS);
  }
  throw new Error("任务轮询超时");
}

async function main(): Promise<void> {
  const config = loadConfig();
  configureAuditLog(process.env.POTATO_AUDIT_LOG_PATH?.trim() || undefined);
  const db = getDb(config.database);
  try {
    initializeDatabase(db);
    const services = createServices(db, config, providerRegistry, logger);
    services.images.startArchiveRetryLoop();
    const storageRoot = path.resolve(config.storage?.local_path ?? "./data/storage");

    // 清掉卡住的分镜 pending/processing，避免「已有进行中任务」
    const stuck = db
      .prepare(
        `SELECT id, task_id, status FROM image_generations
         WHERE panel_id IS NOT NULL AND status IN ('pending','processing','remote')`,
      )
      .all() as Array<{ id: number; task_id: string | null; status: string }>;
    for (const row of stuck) {
      if (row.task_id) {
        services.images.settleByTaskId(
          row.task_id,
          "cancelled",
          "改用 gpt-image-2 续跑分镜，取消卡住的 nano-banana 任务",
        );
      } else {
        db.prepare(
          `UPDATE image_generations SET status = 'cancelled', error_msg = ?, updated_at = ? WHERE id = ?`,
        ).run("改用 gpt-image-2 续跑分镜", new Date().toISOString(), row.id);
      }
      console.log(`已取消卡住 generation=${row.id} statusWas=${row.status}`);
    }
    const interrupted = services.tasks.failInterrupted();
    if (interrupted) console.log(`failInterrupted 回收 ${interrupted} 个任务`);

    console.log("刷新 PearAPI 模型目录…");
    await services.aiConfigs.refresh("pearapi", "image");
    const models = services.aiConfigs.models("pearapi", "image");
    const preferred =
      models.find((m) => /^gpt-image-2$/iu.test(m.id)) ||
      models.find((m) => /gpt-image-2/iu.test(m.id));
    if (!preferred) {
      throw new Error(
        `目录无 ${MODEL_ID}；当前：${models.map((m) => m.id).join(", ") || "(空)"}`,
      );
    }
    services.aiConfigs.savePresets({
      image: { provider: "pearapi", model: preferred.id },
      video: null,
    });
    console.log(`图片预设: pearapi / ${preferred.id}`);

    const projects = services.projects.list({ page: 1, pageSize: 20 }).items;
    const project = projects.find((item) => item.metadata?.demo === true) ?? projects[0];
    if (!project) throw new Error("无项目");
    const episode = project.episodes?.[0];
    if (!episode) throw new Error("无话");
    const panels = services.assets.listPanels(episode.id);
    const panel = panels[0];
    if (!panel) throw new Error("无分镜");
    const assets = services.assets.listProjectAssets(project.id);
    for (const asset of assets) {
      if (!asset.image_url) throw new Error(`资产「${asset.name}」尚无标准图`);
      console.log(`资产就绪 ${asset.name} → ${asset.image_url}`);
    }

    const recipe = assemblePanelRecipe({ shot: panel, assets });
    const latest = services.assets.updatePanel(panel.id, {
      action: panel.action,
      image_recipe_prompt: recipe.panelRecipe.prompt,
      image_recipe_references: recipe.panelRecipe.references,
      project_asset_ids: panel.project_asset_ids,
      extra_reference_images: panel.extra_reference_images,
      recipe_needs_reassembly: false,
    });
    console.log(`配方已组装 refs=${recipe.panelRecipe.references.length}`);
    console.log(recipe.panelRecipe.prompt.slice(0, 200) + "…");

    const generations: Array<Record<string, unknown>> = [];
    let done = false;
    for (let attempt = 1; attempt <= MAX_OUTER && !done; attempt += 1) {
      try {
        const row = services.images.create({
          dramaId: project.id,
          panelId: latest.id,
          provider: "pearapi",
          model: preferred.id,
          prompt: latest.image_recipe_prompt,
          aspectRatio: "1:1",
          referenceImages: latest.image_recipe_references,
        });
        if (!row.task_id) throw new Error("无 task_id");
        console.log(
          `[panel] generation=${row.id} task=${row.task_id} model=${preferred.id} attempt=${attempt}`,
        );
        const task = await waitTask(() => services.tasks.get(row.task_id as string));
        for (
          let i = 0;
          i < 45 && services.images.get(row.id)?.status === "remote";
          i += 1
        ) {
          await sleep(2000);
        }
        const gen = services.images.get(row.id)!;
        generations.push({
          label: `panel:${latest.title}`,
          attempt,
          model: preferred.id,
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
        if (!isRetryable(msg) && attempt >= 5) throw new Error(msg);
        await sleep(Math.min(90_000, 5000 * attempt));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[panel] 异常: ${msg}`);
        if (!isRetryable(msg) && attempt >= 8) throw error;
        await sleep(Math.min(90_000, 5000 * attempt));
      }
    }
    if (!done) throw new Error("分镜底板未完成");

    const evidence = {
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      projectId: project.id,
      provider: "pearapi",
      model: preferred.id,
      note: "三资产沿用已完成的 nano-banana-pro-4k(4:3)；分镜改 gpt-image-2(1:1)",
      panelAssembleDemo: {
        panelId: latest.id,
        title: latest.title,
        aspectRatio: "1:1",
        assembledPromptFull: recipe.panelRecipe.prompt,
        assembledReferences: recipe.panelRecipe.references,
      },
      generations,
      summary: {
        assets: assets.map((a) => ({
          id: a.id,
          name: a.name,
          image_url: a.image_url,
          local_path: a.local_path,
        })),
        panels: services.assets.listPanels(episode.id).map((p) => ({
          id: p.id,
          title: p.title,
          image_url: p.image_url,
          image_recipe_prompt_full: p.image_recipe_prompt,
          image_recipe_references: p.image_recipe_references,
        })),
      },
    };
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), "utf8");
    console.log(`证据已写入 ${EVIDENCE_PATH}`);
  } finally {
    closeDb();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
