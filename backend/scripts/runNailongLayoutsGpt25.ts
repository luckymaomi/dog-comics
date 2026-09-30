/**
 * 角色卡-奶龙-01～05（布局 A–E）用 PearAPI 当前脚本选定模型各生成一张标准图。
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
import { initializeNailongBackroomsDemo } from "./nailongBackroomsDemoRuntime";

const ROOT = path.resolve(__dirname, "../..");
const MODEL_ID = "grok-imagine-image-2.0";
const MODEL_FALLBACK = /grok-imagine-image/iu;
const NAILONG_REFS = [1, 2, 3, 4].map((n) => path.join(ROOT, "nailong", `${n}.png`));
const MAX_OUTER = 20;
const POLL_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryable(message: string): boolean {
  return /429|rate.?limit|限流|暂时|timeout|ETIMEDOUT|ECONNRESET|网络|too many|繁忙|overload|服务重启/iu.test(
    message,
  );
}

function stageRef(storageRoot: string, source: string): string {
  if (!fs.existsSync(source)) throw new Error(`参考图不存在：${source}`);
  const uploads = path.join(storageRoot, "uploads");
  fs.mkdirSync(uploads, { recursive: true });
  const filename = `nailong-ref-${randomUUID()}.png`;
  fs.copyFileSync(source, path.join(uploads, filename));
  return `/static/uploads/${filename}`;
}

async function waitTask(
  get: () => { status: string; error: string | null } | undefined,
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
    | { status: string; image_url: string | null; error_msg?: string | null }
    | undefined,
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_OUTER; attempt += 1) {
    try {
      const row = create();
      if (!row.task_id) throw new Error(`${label}: 无 task_id`);
      console.log(`[${label}] generation=${row.id} task=${row.task_id} attempt=${attempt}`);
      const task = await waitTask(() => getTask(row.task_id as string));
      for (let i = 0; i < 90 && getGen(row.id)?.status === "remote"; i += 1) {
        await sleep(1500);
      }
      const gen = getGen(row.id);
      if (
        task.status === "completed" &&
        gen?.image_url &&
        (gen.status === "completed" || gen.status === "remote")
      ) {
        console.log(`[${label}] 完成 ${gen.status} ${gen.image_url}`);
        return gen.image_url;
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

async function main(): Promise<void> {
  const config = loadConfig();
  configureAuditLog(process.env.DOG_COMICS_AUDIT_LOG_PATH?.trim() || undefined);
  const db = getDb(config.database);
  try {
    initializeDatabase(db);
    const services = createServices(db, config, providerRegistry, logger);
    const storageRoot = path.resolve(config.storage?.local_path || "./data/storage");

    console.log("刷新 PearAPI 模型目录…");
    await services.aiConfigs.refresh("pearapi", "image");
    const models = services.aiConfigs.models("pearapi", "image");
    const preferred =
      models.find((model) => model.id === MODEL_ID) ||
      models.find((model) => /grok-imagine-image-2(?:\.0)?-2k$/iu.test(model.id)) ||
      models.find((model) => /grok-imagine-image-2(?:\.0)?$/iu.test(model.id)) ||
      models.find((model) => MODEL_FALLBACK.test(model.id));
    if (!preferred) {
      throw new Error(
        `目录无 Grok 生图模型；当前：${models.map((model) => model.id).join(", ") || "(空)"}`,
      );
    }
    services.aiConfigs.savePresets({
      image: { provider: "pearapi", model: preferred.id },
      video: null,
    });
    console.log(`图片预设: pearapi / ${preferred.id}`);

    const project = initializeNailongBackroomsDemo(db, services, logger);
    const missing = NAILONG_REFS.filter((file) => !fs.existsSync(file));
    if (missing.length) throw new Error(`缺少参考图：${missing.join("、")}`);
    // 1–2：狂笑参考；3–4：正常身材与正常表情参考。四张都挂上，提示词里写清分工。
    const refs = NAILONG_REFS.map((file) => stageRef(storageRoot, file));

    const layoutNote = "画幅要求：整张输出为横版 4:3，禁止竖版。";
    const identityNote = [
      "参考图分工（必须遵守）：",
      "第1、2张参考图 = 仅用于「捧腹大笑」夸张表情与狂笑姿态参考（大张嘴露两排圆白牙、双眼紧眯成缝、双手捧腹）。",
      "第3、4张参考图 = 正常身材比例与正常表情锚点（大圆绿眼睁开可见瞳孔、嘴为细细一道横线或极淡微笑、站姿平静）。",
      "体型锁定：亮饱和黄梨形胖身，胸腹巨大奶油色椭圆肚皮，短粗四肢、手脚末端灰褐，光滑 3D 卡通；体量偏夸张圆胖，但默认正视/三视图必须用第3、4张的正常神态，禁止把狂笑脸套到正面主视图上。",
      "默认正视图、侧面、背面、左脸特写、中性/微笑等格子：一律正常表情（睁眼绿瞳 + 细嘴线），不要眯眼大张嘴。",
      "只有明确标注「捧腹大笑」的那一格，才允许且必须用第1、2张的狂笑强度。",
    ].join("\n");
    const laughOnlyNote =
      "「捧腹大笑」格专用：严格按第1、2张参考——嘴张到最大露两排圆白牙、双眼眯成缝不见瞳孔、双手死死捧住鼓肚，可略前倾或后仰；这一格必须一眼是狂笑。其它所有格子（含正面全身、正面头像、中性、微笑）禁止狂笑脸。";
    const characters = services.assets
      .listProjectAssets(project.id)
      .filter((asset) => asset.kind === "character")
      .sort((left, right) => left.name.localeCompare(right.name, "zh"));

    for (const asset of characters) {
      const needsLaughCell =
        asset.output_type === "character-layout-d" || asset.output_type === "character-layout-c";
      const prompt = [
        assembleAssetOutputPrompt({
          kind: asset.kind,
          name: asset.name,
          text_profile: asset.text_profile,
          output_type: asset.output_type,
          reference_lock: "face",
          ban_image_text: "ban",
          input_reference_images: refs,
        }),
        identityNote,
        needsLaughCell ? laughOnlyNote : "本卡不含捧腹大笑格：整张图所有视角一律正常表情，不要狂笑脸。",
        layoutNote,
      ]
        .filter((part) => part.trim().length > 0)
        .join("\n");
      services.assets.updateProjectAsset(asset.id, {
        name: asset.name,
        text_profile: {},
        output_type: asset.output_type,
        output_prompt: prompt,
        input_reference_images: refs,
      });
      console.log(`已组装 ${asset.name} / ${asset.output_type}`);
    }

    const results: Array<{ name: string; layout: string; url: string }> = [];
    const readyAssets = services.assets
      .listProjectAssets(project.id)
      .filter((item) => item.kind === "character")
      .sort((left, right) => left.name.localeCompare(right.name, "zh"));
    for (const asset of readyAssets) {
      if (!asset.output_prompt.trim()) throw new Error(`${asset.name} 尚未组装提示词`);
      const url = await generateUntilDone(
        `${asset.name}:${asset.output_type}`,
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
        (id) => services.images.get(id),
      );
      results.push({ name: asset.name, layout: asset.output_type, url });
    }

    console.log("全部完成：");
    for (const item of results) {
      console.log(`- ${item.name} (${item.layout}) → ${item.url}`);
    }
  } finally {
    closeDb();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
