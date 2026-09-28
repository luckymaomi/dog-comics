/**
 * PearAPI gpt-image-2：《奶龙后室》注入桌面参考图 → 组装 → 生标准图(4:3) → 分镜底板(1:1)。
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
import { initializeNailongBackroomsDemo } from "./nailongBackroomsDemoRuntime";

const ROOT = path.resolve(__dirname, "../..");
const EVIDENCE_PATH = path.join(ROOT, "workflow-run-evidence.json");
const REF_DIR = String.raw`C:\Users\Administrator\Desktop\参考图`;
const NAILONG_REFS = [
  path.join(REF_DIR, "奶龙参考1.png"),
  path.join(REF_DIR, "奶龙参考2-converted.png"),
];
const BACKROOMS_REFS = [
  path.join(REF_DIR, "后室参考1-converted.png"),
  path.join(REF_DIR, "后室参考2.jpg"),
];
const MODEL_ID = "gpt-image-2";
const ASSET_MODEL_FALLBACK = ["gpt-image-2"];
const MAX_OUTER_ATTEMPTS = 40;
const POLL_MS = 2000;

type Evidence = {
  startedAt: string;
  finishedAt?: string;
  projectId?: number;
  provider?: string;
  model?: string;
  stagedReferences?: unknown[];
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
        reference_images?: string | string[];
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

function stageReference(
  storageRoot: string,
  sourceAbsolute: string,
): { sourceAbsolute: string; stagedAbsolute: string; publicUrl: string } {
  if (!fs.existsSync(sourceAbsolute)) {
    throw new Error(`参考图不存在：${sourceAbsolute}`);
  }
  const uploadsDir = path.join(storageRoot, "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const ext = path.extname(sourceAbsolute).toLowerCase() || ".png";
  const filename = `${randomUUID()}${ext}`;
  const stagedAbsolute = path.join(uploadsDir, filename);
  fs.copyFileSync(sourceAbsolute, stagedAbsolute);
  return {
    sourceAbsolute,
    stagedAbsolute,
    publicUrl: `/static/uploads/${filename}`,
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
      models.find((m) => m.id.toLowerCase() === MODEL_ID) ||
      models.find((m) => /^gpt-image-2$/iu.test(m.id)) ||
      models.find((m) => /gpt-image-2/iu.test(m.id));
    if (!preferred) {
      throw new Error(
        `PearAPI 目录无 ${MODEL_ID}；当前图片模型：${models.map((m) => m.id).join(", ") || "(空)"}`,
      );
    }
    services.aiConfigs.savePresets({
      image: { provider: "pearapi", model: preferred.id },
      video: null,
    });
    evidence.provider = "pearapi";
    evidence.model = preferred.id;
    console.log(`图片预设: pearapi / ${preferred.id}`);

    const project = initializeNailongBackroomsDemo(db, services, logger);
    evidence.projectId = project.id;

    const stagedNailong = NAILONG_REFS.map((src) => stageReference(storageRoot, src));
    const stagedBackrooms = BACKROOMS_REFS.map((src) => stageReference(storageRoot, src));
    evidence.stagedReferences = [
      ...stagedNailong.map((item) => ({ role: "character:奶龙", ...item })),
      ...stagedBackrooms.map((item) => ({ role: "scene:后室", ...item })),
    ];
    console.log(
      `参考图已暂存：奶龙 ${stagedNailong.length} 张，后室 ${stagedBackrooms.length} 张`,
    );

    const assetsBefore = services.assets.listProjectAssets(project.id);
    const landscapeSheetNote =
      "画幅要求：整张输出为横版 4:3 参考表（landscape），禁止竖版 9:16 / 9:21。";
    for (const asset of assetsBefore) {
      if (asset.kind === "character" && asset.name === "奶龙") {
        const outputType = "character-layout-c" as const;
        const inputRefs = stagedNailong.map((item) => item.publicUrl);
        const assembled = [
          assembleAssetOutputPrompt({
            kind: asset.kind,
            name: asset.name,
            text_profile: asset.text_profile,
            output_type: outputType,
            reference_lock: "face",
            ban_image_text: "ban",
            input_reference_images: inputRefs,
          }),
          landscapeSheetNote,
          "横版分格补充：同一张 4:3 图内至少包含正面全身、90度侧面全身、平淡/中性表情头像、恶搞狂笑捧腹表情头像（眯眼大张嘴露牙）；各格同一角色身份与配色一致。",
        ].join("\n");
        const updated = services.assets.updateProjectAsset(asset.id, {
          name: asset.name,
          text_profile: asset.text_profile,
          output_type: outputType,
          output_prompt: assembled,
          input_reference_images: inputRefs,
        });
        evidence.assetAssembleDemo.push({
          assetId: updated.id,
          kind: updated.kind,
          name: updated.name,
          outputType: updated.output_type,
          aspectRatio: "4:3",
          referenceLock: "face",
          banImageText: "ban",
          inputReferenceImages: updated.input_reference_images,
          assembledOutputPromptFull: assembled,
        });
      } else if (asset.kind === "scene" && asset.name === "后室") {
        const inputRefs = stagedBackrooms.map((item) => item.publicUrl);
        const assembled = [
          assembleAssetOutputPrompt({
            kind: asset.kind,
            name: asset.name,
            text_profile: asset.text_profile,
            output_type: asset.output_type,
            reference_lock: "scene",
            ban_image_text: "ban",
            input_reference_images: inputRefs,
          }),
          landscapeSheetNote,
        ].join("\n");
        const updated = services.assets.updateProjectAsset(asset.id, {
          name: asset.name,
          text_profile: asset.text_profile,
          output_type: asset.output_type,
          output_prompt: assembled,
          input_reference_images: inputRefs,
        });
        evidence.assetAssembleDemo.push({
          assetId: updated.id,
          kind: updated.kind,
          name: updated.name,
          outputType: updated.output_type,
          aspectRatio: "4:3",
          referenceLock: "scene",
          banImageText: "ban",
          inputReferenceImages: updated.input_reference_images,
          assembledOutputPromptFull: assembled,
        });
      } else {
        const assembled = [
          assembleAssetOutputPrompt({
            kind: asset.kind,
            name: asset.name,
            text_profile: asset.text_profile,
            output_type: asset.output_type,
            reference_lock: "prop",
            ban_image_text: "ban",
          }),
          landscapeSheetNote,
          "横版多角度：同一张 4:3 图内给出正面、侧面与局部特写。",
        ].join("\n");
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
          aspectRatio: "4:3",
          referenceLock: "prop",
          banImageText: "ban",
          inputReferenceImages: [],
          assembledOutputPromptFull: assembled,
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
        () =>
          services.images.create({
            dramaId: project.id,
            projectAssetId: asset.id,
            provider: "pearapi",
            model: preferred.id,
            prompt: asset.output_prompt,
            aspectRatio: "4:3",
            referenceImages: asset.input_reference_images,
          }),
        (taskId) => services.tasks.get(taskId),
        (id) => services.images.get(id) ?? undefined,
        evidence,
      );
    }

    const freshAssets = services.assets.listProjectAssets(project.id);
    for (const panel of panels) {
      const recipe = assemblePanelRecipe({ shot: panel, assets: freshAssets });
      evidence.panelAssembleDemo = {
        panelId: panel.id,
        title: panel.title,
        aspectRatio: "1:1",
        assembledPromptFull: recipe.panelRecipe.prompt,
        assembledReferences: recipe.panelRecipe.references,
      };
      const latest = services.assets.updatePanel(panel.id, {
        action: panel.action,
        image_recipe_prompt: recipe.panelRecipe.prompt,
        image_recipe_references: recipe.panelRecipe.references,
        project_asset_ids: panel.project_asset_ids,
        extra_reference_images: panel.extra_reference_images,
        recipe_needs_reassembly: false,
      });
      await generateUntilDone(
        `panel:${latest.title}`,
        () =>
          services.images.create({
            dramaId: project.id,
            panelId: latest.id,
            provider: "pearapi",
            model: preferred.id,
            prompt: latest.image_recipe_prompt,
            aspectRatio: "1:1",
            referenceImages: latest.image_recipe_references,
          }),
        (taskId) => services.tasks.get(taskId),
        (id) => services.images.get(id) ?? undefined,
        evidence,
      );
    }

    evidence.finishedAt = new Date().toISOString();
    evidence.summary = {
      assets: freshAssets.map((a) => ({
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
