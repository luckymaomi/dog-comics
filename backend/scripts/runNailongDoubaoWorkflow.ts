/**
 * PearAPI doubao-seedream-5-0-260128：在已有《奶龙后室》Demo 上重跑三资产(4:3)+分镜(1:1)。
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
const MODEL_ID = "doubao-seedream-5-0-260128";
const REF_DIR = String.raw`C:\Users\Administrator\Desktop\参考图`;
const NAILONG_REFS = [
  path.join(REF_DIR, "奶龙参考1.png"),
  path.join(REF_DIR, "奶龙参考2-converted.png"),
];
const BACKROOMS_REFS = [
  path.join(REF_DIR, "后室参考1-converted.png"),
  path.join(REF_DIR, "后室参考2.jpg"),
];
const MAX_OUTER = 30;
const POLL_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function retryable(message: string): boolean {
  return /429|rate.?limit|限流|暂时|timeout|ETIMEDOUT|ECONNRESET|网络|too many|繁忙|overload/iu.test(
    message,
  );
}

async function waitTask(
  get: () =>
    | { status: string; error: string | null }
    | undefined,
): Promise<{ status: string; error: string | null }> {
  for (let i = 0; i < 1800; i += 1) {
    const task = get();
    if (!task) throw new Error("任务不存在");
    if (["completed", "failed", "cancelled"].includes(task.status)) return task;
    await sleep(POLL_MS);
  }
  throw new Error("任务轮询超时");
}

async function generateUntilDone(
  label: string,
  create: () => { id: number; task_id: string | null },
  getTask: (id: string) => { status: string; error: string | null } | undefined,
  getGen: (id: number) =>
    | {
        status: string;
        image_url: string | null;
        error_msg?: string | null;
      }
    | undefined,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_OUTER; attempt += 1) {
    try {
      const row = create();
      if (!row.task_id) throw new Error(`${label}: 无 task_id`);
      console.log(`[${label}] generation=${row.id} task=${row.task_id} attempt=${attempt}`);
      const task = await waitTask(() => getTask(row.task_id as string));
      for (let i = 0; i < 60 && getGen(row.id)?.status === "remote"; i += 1) {
        await sleep(1500);
      }
      const gen = getGen(row.id);
      if (
        task.status === "completed" &&
        gen?.image_url &&
        (gen.status === "completed" || gen.status === "remote")
      ) {
        console.log(`[${label}] 完成 ${gen.status} ${gen.image_url}`);
        return;
      }
      const msg = task.error || gen?.error_msg || "未完成";
      if (!retryable(msg) && attempt >= 5) throw new Error(msg);
      console.warn(`[${label}] 失败可重试: ${msg}`);
      await sleep(Math.min(60_000, 3000 * attempt));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!retryable(msg) && attempt >= 8) throw error;
      console.warn(`[${label}] 异常可重试: ${msg}`);
      await sleep(Math.min(60_000, 3000 * attempt));
    }
  }
  throw new Error(`${label}: 超过重试上限`);
}

function stageRef(storageRoot: string, source: string): string {
  if (!fs.existsSync(source)) throw new Error(`参考图不存在：${source}`);
  const uploads = path.join(storageRoot, "uploads");
  fs.mkdirSync(uploads, { recursive: true });
  const ext = path.extname(source) || ".png";
  const filename = `${randomUUID()}${ext}`;
  fs.copyFileSync(source, path.join(uploads, filename));
  return `/static/uploads/${filename}`;
}

async function main(): Promise<void> {
  const config = loadConfig();
  configureAuditLog(process.env.DOG_COMICS_AUDIT_LOG_PATH?.trim() || undefined);
  const db = getDb(config.database);
  try {
    initializeDatabase(db);
    const services = createServices(db, config, providerRegistry, logger);
    services.images.startArchiveRetryLoop();
    const storageRoot = path.resolve(config.storage?.local_path ?? "./data/storage");

    const stuck = db
      .prepare(
        `SELECT id, task_id FROM image_generations WHERE status IN ('pending','processing')`,
      )
      .all() as Array<{ id: number; task_id: string | null }>;
    for (const row of stuck) {
      if (row.task_id) {
        services.images.settleByTaskId(row.task_id, "cancelled", "豆包重跑前取消卡住任务");
      }
    }
    services.tasks.failInterrupted();

    console.log("刷新 PearAPI 模型目录…");
    await services.aiConfigs.refresh("pearapi", "image");
    const models = services.aiConfigs.models("pearapi", "image");
    const preferred =
      models.find((m) => m.id === MODEL_ID) ||
      models.find((m) => /doubao-seedream-5-0/iu.test(m.id)) ||
      models.find((m) => /doubao-seedream/iu.test(m.id));
    if (!preferred) {
      throw new Error(
        `目录无豆包 Seedream；当前：${models.map((m) => m.id).join(", ") || "(空)"}`,
      );
    }
    services.aiConfigs.savePresets({
      image: { provider: "pearapi", model: preferred.id },
      video: null,
    });
    console.log(`图片预设: pearapi / ${preferred.id}`);

    const project = initializeNailongBackroomsDemo(db, services, logger);
    const nailongUrls = NAILONG_REFS.map((src) => stageRef(storageRoot, src));
    const backroomUrls = BACKROOMS_REFS.map((src) => stageRef(storageRoot, src));
    const landscapeNote =
      "画幅要求：整张输出为横版 4:3 参考表（landscape），禁止竖版 9:16 / 9:21。";

    for (const asset of services.assets.listProjectAssets(project.id)) {
      if (asset.kind === "character" && asset.name === "奶龙") {
        const outputType = "character-layout-c" as const;
        const prompt = [
          assembleAssetOutputPrompt({
            kind: asset.kind,
            name: asset.name,
            text_profile: asset.text_profile,
            output_type: outputType,
            reference_lock: "face",
            ban_image_text: "ban",
            input_reference_images: nailongUrls,
          }),
          landscapeNote,
          "横版分格补充：同一张 4:3 图内至少包含正面全身、90度侧面全身、平淡/中性表情头像、恶搞狂笑捧腹表情头像；各格同一角色身份与配色一致。",
        ].join("\n");
        services.assets.updateProjectAsset(asset.id, {
          name: asset.name,
          text_profile: asset.text_profile,
          output_type: outputType,
          output_prompt: prompt,
          input_reference_images: nailongUrls,
        });
      } else if (asset.kind === "scene" && asset.name === "后室") {
        const prompt = [
          assembleAssetOutputPrompt({
            kind: asset.kind,
            name: asset.name,
            text_profile: asset.text_profile,
            output_type: asset.output_type,
            reference_lock: "scene",
            ban_image_text: "ban",
            input_reference_images: backroomUrls,
          }),
          landscapeNote,
        ].join("\n");
        services.assets.updateProjectAsset(asset.id, {
          name: asset.name,
          text_profile: asset.text_profile,
          output_type: asset.output_type,
          output_prompt: prompt,
          input_reference_images: backroomUrls,
        });
      } else {
        const prompt = [
          assembleAssetOutputPrompt({
            kind: asset.kind,
            name: asset.name,
            text_profile: asset.text_profile,
            output_type: asset.output_type,
            reference_lock: "prop",
            ban_image_text: "ban",
          }),
          landscapeNote,
          "横版多角度：同一张 4:3 图内给出正面、侧面与局部特写。",
        ].join("\n");
        services.assets.updateProjectAsset(asset.id, {
          name: asset.name,
          text_profile: asset.text_profile,
          output_type: asset.output_type,
          output_prompt: prompt,
          input_reference_images: [],
        });
      }
    }

    const assets = services.assets.listProjectAssets(project.id);
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
      );
    }

    const fresh = services.assets.listProjectAssets(project.id);
    const episode = project.episodes?.[0];
    if (!episode) throw new Error("无话");
    for (const panel of services.assets.listPanels(episode.id)) {
      const recipe = assemblePanelRecipe({ shot: panel, assets: fresh });
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
      );
    }
    console.log("豆包 Seedream 5.0 奶龙后室全流程完成");
  } finally {
    closeDb();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
