/**
 * PearAPI GPT Image 2 全流程：女王注入本地参考图 + 左脸右身布局组装 → 生标准图 → 分镜底板。
 * 遇限流外层重试至全部完成；写出证据 JSON。
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../src/config";
import { closeDb, getDb } from "../src/db";
import { initializeDatabase } from "../src/db/schema";
import logger, { configureAuditLog } from "../src/logger";
import { providerRegistry } from "../src/providers";
import { createServices } from "../src/services/container";
import { assembleAssetOutputPrompt } from "../src/services/assetOutputPromptAssembler";
import { assemblePanelRecipe } from "../src/services/storyboardPromptAssembler";
import { initializeQueenAccessionDemo } from "./queenAccessionDemoRuntime";

const ROOT = path.resolve(__dirname, "../..");
const EVIDENCE_PATH = path.join(ROOT, "workflow-run-evidence.json");
const QUEEN_REF_SOURCE = String.raw`C:\Users\Administrator\Desktop\AI短剧\性感.png`;
const MAX_OUTER_ATTEMPTS = 40;
const POLL_MS = 2000;

type Evidence = {
  startedAt: string;
  finishedAt?: string;
  projectId?: number;
  provider?: string;
  model?: string;
  queenReference?: Record<string, string>;
  assetAssembleDemo: unknown[];
  panelAssembleDemo?: unknown;
  generations: Array<Record<string, unknown>>;
  errors: string[];
  summary?: Record<string, unknown>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFailure(message: string): boolean {
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

async function generateUntilDone(
  label: string,
  create: () => { id: number; task_id: string | null },
  getTask: (taskId: string) =>
    | { status: string; error: string | null; result?: unknown }
    | undefined,
  getGeneration: (id: number) =>
    | {
        status: string;
        image_url: string | null;
        local_path: string | null;
        available?: boolean;
        archive_attempts?: number;
        error_msg?: string | null;
        prompt: string;
        reference_images?: string[];
      }
    | undefined,
  evidence: Evidence,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_OUTER_ATTEMPTS; attempt += 1) {
    try {
      const row = create();
      if (!row.task_id) throw new Error(`${label}: 未返回 task_id`);
      console.log(
        `[${label}] 提交 generation=${row.id} task=${row.task_id} attempt=${attempt}`,
      );
      const task = await waitTask(() => getTask(row.task_id as string));
      const gen = getGeneration(row.id);
      const record: Record<string, unknown> = {
        label,
        attempt,
        generationId: row.id,
        taskId: row.task_id,
        taskStatus: task.status,
        taskError: task.error,
        generationStatus: gen?.status,
        imageUrl: gen?.image_url,
        localPath: gen?.local_path,
        available: gen?.available,
        archiveAttempts: gen?.archive_attempts,
        promptFull: gen?.prompt ?? "",
        referenceImages: gen?.reference_images ?? [],
      };
      evidence.generations.push(record);
      if (
        task.status === "completed" &&
        gen &&
        (gen.status === "completed" || gen.status === "remote") &&
        gen.image_url
      ) {
        for (
          let i = 0;
          i < 45 && getGeneration(row.id)?.status === "remote";
          i += 1
        ) {
          await sleep(2000);
        }
        const finalGen = getGeneration(row.id);
        Object.assign(record, {
          generationStatus: finalGen?.status,
          imageUrl: finalGen?.image_url,
          localPath: finalGen?.local_path,
          available: finalGen?.available,
          archiveAttempts: finalGen?.archive_attempts,
          promptFull: finalGen?.prompt ?? record.promptFull,
          referenceImages: finalGen?.reference_images ?? record.referenceImages,
          absoluteLocalPath: finalGen?.local_path
            ? path.join(ROOT, "backend", "data", "storage", finalGen.local_path)
            : undefined,
        });
        console.log(
          `[${label}] 完成 status=${finalGen?.status} available=${finalGen?.available}`,
        );
        return;
      }
      const message = task.error || gen?.error_msg || `${label} 未完成`;
      if (!isRetryableFailure(message) && attempt >= 5) throw new Error(message);
      console.warn(`[${label}] 失败可重试: ${message}`);
      await sleep(Math.min(90_000, 4000 * attempt));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      evidence.errors.push(`${label}#${attempt}: ${message}`);
      if (!isRetryableFailure(message) && attempt >= 8) throw error;
      console.warn(`[${label}] 异常可重试: ${message}`);
      await sleep(Math.min(90_000, 4000 * attempt));
    }
  }
  throw new Error(`${label}: 超过外层重试上限仍未完成`);
}

function stageQueenReference(storageRoot: string): {
  sourceAbsolute: string;
  stagedAbsolute: string;
  publicUrl: string;
  relativePath: string;
} {
  if (!fs.existsSync(QUEEN_REF_SOURCE)) {
    throw new Error(`参考图不存在：${QUEEN_REF_SOURCE}`);
  }
  const uploadsDir = path.join(storageRoot, "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const filename = `${randomUUID()}.png`;
  const stagedAbsolute = path.join(uploadsDir, filename);
  fs.copyFileSync(QUEEN_REF_SOURCE, stagedAbsolute);
  const relativePath = path.posix.join("uploads", filename);
  return {
    sourceAbsolute: QUEEN_REF_SOURCE,
    stagedAbsolute,
    publicUrl: `/static/${relativePath}`,
    relativePath,
  };
}

async function main(): Promise<void> {
  const evidence: Evidence = {
    startedAt: new Date().toISOString(),
    assetAssembleDemo: [],
    generations: [],
    errors: [],
  };
  const config = loadConfig();
  configureAuditLog(process.env.POTATO_AUDIT_LOG_PATH?.trim() || undefined);
  const db = getDb(config.database);
  try {
    initializeDatabase(db);
    const services = createServices(db, config, providerRegistry, logger);
    services.images.startArchiveRetryLoop();
    const storageRoot = path.resolve(config.storage?.local_path ?? "./data/storage");

    console.log("刷新 PearAPI 模型目录…");
    await services.aiConfigs.refresh("pearapi", "image");
    const models = services.aiConfigs.models("pearapi", "image");
    const preferred =
      models.find((m) => /^gpt-image-2$/iu.test(m.id)) ||
      models.find((m) => /^gpt-image-2(?:-|$)/iu.test(m.id)) ||
      models.find((m) => /gpt-image-2/iu.test(m.id));
    if (!preferred) {
      throw new Error(
        `PearAPI 目录无 gpt-image-2；当前图片模型：${models.map((m) => m.id).join(", ") || "(空)"}`,
      );
    }
    services.aiConfigs.savePresets({
      image: { provider: "pearapi", model: preferred.id },
      video: null,
    });
    evidence.provider = "pearapi";
    evidence.model = preferred.id;
    console.log(`图片预设: pearapi / ${preferred.id}`);

    const project = initializeQueenAccessionDemo(db, services, logger);
    evidence.projectId = project.id;

    const ref = stageQueenReference(storageRoot);
    evidence.queenReference = {
      ownerSourceAbsolute: ref.sourceAbsolute,
      stagedAbsolute: ref.stagedAbsolute,
      publicUrl: ref.publicUrl,
      relativeUnderStorage: ref.relativePath,
      note: "owner 源文件复制进 backend/data/storage/uploads，再写入女王卡 input_reference_images",
    };
    console.log(`女王参考图已暂存：${ref.publicUrl} ← ${ref.sourceAbsolute}`);

    // 女王：左脸右身 + 锁脸 + 禁字，注入参考图；场景/道具：重新组装中文模板（保留 brief）
    const assetsBefore = services.assets.listProjectAssets(project.id);
    for (const asset of assetsBefore) {
      if (asset.kind === "character" && asset.name === "女王") {
        const outputType = "character-layout-b" as const;
        const assembled = assembleAssetOutputPrompt({
          kind: asset.kind,
          name: asset.name,
          text_profile: asset.text_profile,
          output_type: outputType,
          reference_lock: "face",
          ban_image_text: "ban",
        });
        const updated = services.assets.updateProjectAsset(asset.id, {
          name: asset.name,
          text_profile: asset.text_profile,
          output_type: outputType,
          output_prompt: assembled,
          input_reference_images: [ref.publicUrl],
        });
        evidence.assetAssembleDemo.push({
          assetId: updated.id,
          kind: updated.kind,
          name: updated.name,
          outputType: updated.output_type,
          brief: updated.text_profile.brief,
          referenceLock: "face",
          banImageText: "ban",
          inputReferenceImages: updated.input_reference_images,
          assembledOutputPromptFull: assembled,
          savedOutputPromptFull: updated.output_prompt,
        });
      } else {
        const assembled = assembleAssetOutputPrompt({
          kind: asset.kind,
          name: asset.name,
          text_profile: asset.text_profile,
          output_type: asset.output_type,
          ban_image_text: "ban",
        });
        const updated = services.assets.updateProjectAsset(asset.id, {
          name: asset.name,
          text_profile: asset.text_profile,
          output_type: asset.output_type,
          output_prompt: assembled,
          input_reference_images: [],
        });
        evidence.assetAssembleDemo.push({
          assetId: updated.id,
          kind: updated.kind,
          name: updated.name,
          outputType: updated.output_type,
          brief: updated.text_profile.brief,
          referenceLock: null,
          banImageText: "ban",
          inputReferenceImages: [],
          assembledOutputPromptFull: assembled,
          savedOutputPromptFull: updated.output_prompt,
        });
      }
    }

    const assets = services.assets.listProjectAssets(project.id);
    const episode = project.episodes?.[0];
    if (!episode) throw new Error("无话");
    const panels = services.assets.listPanels(episode.id);

    for (const asset of assets) {
      await generateUntilDone(
        `asset:${asset.name}`,
        () => {
          const current = services.assets.getProjectAsset(asset.id)!;
          return services.images.create({
            dramaId: project.id,
            projectAssetId: asset.id,
            prompt: current.output_prompt,
            provider: "pearapi",
            model: preferred.id,
            aspectRatio: "9:16",
            referenceImages: current.input_reference_images,
          });
        },
        (id) => services.tasks.get(id),
        (id) => services.images.get(id),
        evidence,
      );
    }

    for (const panel of panels) {
      const freshAssets = services.assets.listProjectAssets(project.id);
      const recipe = assemblePanelRecipe({ shot: panel, assets: freshAssets });
      evidence.panelAssembleDemo = {
        panelId: panel.id,
        title: panel.title,
        actionFull: panel.action,
        projectAssetIds: panel.project_asset_ids,
        assembledPromptFull: recipe.panelRecipe.prompt,
        assembledReferences: recipe.panelRecipe.references,
        assetStandardUrls: freshAssets
          .filter((a) => panel.project_asset_ids.includes(a.id))
          .map((a) => ({
            id: a.id,
            name: a.name,
            image_url: a.image_url,
            absoluteLocalPath: a.local_path
              ? path.join(ROOT, "backend", "data", "storage", a.local_path)
              : null,
          })),
      };
      services.assets.updatePanel(panel.id, {
        image_recipe_prompt: recipe.panelRecipe.prompt,
        image_recipe_references: recipe.panelRecipe.references,
        recipe_reassembled: true,
      });

      await generateUntilDone(
        `panel:${panel.title || panel.id}`,
        () => {
          const latest = services.assets.getPanel(panel.id)!;
          return services.images.create({
            dramaId: project.id,
            panelId: panel.id,
            prompt: latest.image_recipe_prompt,
            provider: "pearapi",
            model: preferred.id,
            aspectRatio: "1:1",
            referenceImages: latest.image_recipe_references,
          });
        },
        (id) => services.tasks.get(id),
        (id) => services.images.get(id),
        evidence,
      );
    }

    const finalAssets = services.assets.listProjectAssets(project.id);
    const finalPanels = services.assets.listPanels(episode.id);
    evidence.summary = {
      repoRoot: ROOT,
      storageRoot,
      assets: finalAssets.map((a) => ({
        id: a.id,
        kind: a.kind,
        name: a.name,
        output_type: a.output_type,
        output_prompt_full: a.output_prompt,
        input_reference_images: a.input_reference_images,
        hasImage: Boolean(a.image_url),
        image_url: a.image_url,
        local_path: a.local_path,
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
        hasImage: Boolean(p.image_url),
        image_url: p.image_url,
        absoluteLocalPath: p.image_url?.startsWith("/static/")
          ? path.join(storageRoot, p.image_url.replace(/^\/static\//u, ""))
          : null,
        generationId: p.current_image_generation_id,
      })),
      allAssetsReady: finalAssets.every((a) => Boolean(a.image_url)),
      allPanelsReady: finalPanels.every((p) => Boolean(p.image_url)),
    };
    evidence.finishedAt = new Date().toISOString();
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), "utf8");
    console.log(`证据已写：${EVIDENCE_PATH}`);
    console.log(
      JSON.stringify(
        {
          allAssetsReady: evidence.summary.allAssetsReady,
          allPanelsReady: evidence.summary.allPanelsReady,
          model: evidence.model,
        },
        null,
        2,
      ),
    );
    if (!evidence.summary.allAssetsReady || !evidence.summary.allPanelsReady) {
      process.exitCode = 1;
    }
  } finally {
    closeDb();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
