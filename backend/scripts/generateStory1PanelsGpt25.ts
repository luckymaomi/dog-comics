/**
 * 故事1 五镜重跑：gpt-image-2.5-2k、1:1；强制不用上一镜；强化期盼魔爪子／畏惧魔三头。
 * 用法：cd backend && npx tsx scripts/generateStory1PanelsGpt25.ts
 */
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/config";
import { getDb } from "../src/db";
import { initializeDatabase } from "../src/db/schema";
import logger, { configureAuditLog } from "../src/logger";
import { providerRegistry } from "../src/providers";
import { createServices } from "../src/services/container";
import { assemblePanelRecipe } from "../src/services/storyboardPromptAssembler";

const MODEL_ID = "gpt-image-2.5-2k";
const ASPECT = "1:1";
const POLL_MS = 2500;
const PROJECT_ID = 1;
const EPISODE_ID = 1;

const ASSETS = {
  buddha: 1,
  hope: 3,
  fear: 4,
  nailong: 5,
  hellFar: 6,
  hellNear: 7,
  dharma: 8,
} as const;

/** 强制重写五镜规格：不用上一镜；魔相外形写死。 */
const PANEL_SPECS = [
  {
    title: "镜1·说法",
    action: [
      "产出横版 3×3 九宫格（格间细白边），同一水墨体系，疏、静，画幅正方形九宫格。",
      "上排：法会月夜远景；佛陀奶龙正面静立；圆光／莲台特写。",
      "中排：说法举手；慈悲半身；远处众生潮虚影。",
      "下排：侧面说法；合十／安定；夜空新月收束。",
      "出场资产：角色「佛陀奶龙」；场景「法会」。本镜不要出现期盼魔、畏惧魔、普通奶龙特写。",
      "旁白（整镜）：人类心中两个最大的罪恶制造者：一个是期盼，一个是畏惧。……有其因必有其果。……必堕三恶道。",
    ].join("\n"),
    project_asset_ids: [ASSETS.buddha, ASSETS.dharma],
  },
  {
    title: "镜2·期盼着魔",
    action: [
      "产出横版 3×3 九宫格，由甜入魔，正方形九宫格。",
      "上排：小院日常普通奶龙望天；期待小愿；期待小愿。",
      "中排：期待更多；修行名相跪拜幻光；期盼魔初现递手。",
      "下排：期盼魔牵红绳，普通奶龙跟随；脚下发暗、狱气上涌；普通奶龙脚离地，被绳向下拖入地狱暗渊（末格必须往下、往地狱里拽，可露地狱远景烟桥／狱门一角；不要升天金光、不要往光柱里飞）。",
      "期盼魔外形必须一眼可辨（参考其标准图）：奶龙身份，但魔王姿——头顶草束／高耸束发，绳辫与锯齿纸垂，脑后水墨圆光，胸肩繁复纹样，下方露出粗壮利爪／利爪手脚（爪要夸张可见，勿画成普通奶龙圆手），目光摄人。",
      "出场资产：角色「普通奶龙」「期盼魔」；场景「地狱远景」（仅下排末格入狱方向）。不要使用上一镜底板。不要画成三头多臂。",
      "旁白：期盼排比……再要一点……脚却已经离地了。——末格向下拖进地狱。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.hope, ASSETS.hellFar],
  },
  {
    title: "镜3·畏惧着魔",
    action: [
      "产出横版 3×3 九宫格，由冷入狱，正方形九宫格。",
      "上排：畏惧魔冷墨现身；畏惧情绪；畏惧情绪。",
      "中排：普通奶龙蜷缩抓紧；不满／埋怨；硬理由。",
      "下排：畏惧魔逼近、期盼魔可虚影；狱气上涌；普通奶龙被拖入「地狱远景」狱门。",
      "畏惧魔外形必须一眼可辨（参考其标准图）：奶龙身份，但是三头并立（三张奶龙忿怒脸）、多臂对称展开，胸前璎珞与眼纹，下身可盘尾，气势威猛；三头要清楚画出，勿画成单头。",
      "期盼魔若出现仅为虚影，仍保持利爪魔王姿，勿与畏惧魔外形混淆。",
      "出场资产：角色「普通奶龙」「畏惧魔」「期盼魔」；场景「地狱远景」。不要使用上一镜底板。",
      "旁白：畏惧排比……果，怎么会跑呢？",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.fear, ASSETS.hope, ASSETS.hellFar],
  },
  {
    title: "镜4·地狱尽头",
    action: [
      "产出横版 3×3 九宫格，极繁、最暗、最满，正方形九宫格。",
      "上排：用地狱远景——烟云押魂；普通奶龙坠入；狱卒剪影纵深。",
      "中排：用地狱近景——火窟；锁链滑轮空间；普通奶龙在火光中。",
      "下排：极繁纹样；最底层压迫；一点普通奶龙几乎被吞没。",
      "出场资产：角色「普通奶龙」；场景「地狱远景」「地狱近景」。本镜可不画双魔，或仅融进狱纹剪影。不要使用上一镜底板。",
      "旁白：无量无边恶业里，人被拖到地狱尽头。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.hellFar, ASSETS.hellNear],
  },
  {
    title: "镜5·忽然回归",
    action: [
      "产出横版 3×3 九宫格，骤疏、亮、亲，正方形九宫格。",
      "上排：暗气将散一道清光；佛陀奶龙近景出现；光吞暗。",
      "中排：普通奶龙合十／放手；一发心静帧；佛与普通奶龙相对。",
      "下排：回到法会月夜；二人并立；新月留白收束。",
      "出场资产：角色「佛陀奶龙」「普通奶龙」；场景「法会」。不要出现双魔，不要使用上一镜底板。",
      "旁白：忽然——菩萨一发心已成等正觉。何以故？缘起清净真实故。",
    ].join("\n"),
    project_asset_ids: [ASSETS.buddha, ASSETS.nailong, ASSETS.dharma],
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitTask(
  get: () =>
    | { status: string; error: string | null; result?: unknown }
    | undefined,
): Promise<{ status: string; error: string | null; result?: unknown }> {
  for (let i = 0; i < 2400; i += 1) {
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
  configureAuditLog(process.env.DOG_COMICS_AUDIT_LOG_PATH?.trim() || undefined);
  const db = getDb(config.database);
  initializeDatabase(db);
  const services = createServices(db, config, providerRegistry, logger);
  services.images.startArchiveRetryLoop();

  const stuck = db
    .prepare(
      `SELECT id, task_id, status FROM image_generations
       WHERE panel_id IS NOT NULL AND drama_id = ? AND status IN ('pending','processing')`,
    )
    .all(PROJECT_ID) as Array<{ id: number; task_id: string | null; status: string }>;
  for (const row of stuck) {
    if (row.task_id) {
      services.images.settleByTaskId(
        row.task_id,
        "cancelled",
        "故事1五镜全部重跑（无上一镜），取消卡住任务",
      );
    } else {
      db.prepare(
        `UPDATE image_generations SET status = 'cancelled', error_msg = ?, updated_at = ? WHERE id = ?`,
      ).run("故事1五镜全部重跑", new Date().toISOString(), row.id);
    }
    console.log(`取消卡住 generation=${row.id}`);
  }
  services.tasks.failInterrupted();

  console.log(`刷新目录并锁定预设 ${MODEL_ID}…`);
  await services.aiConfigs.refresh("pearapi", "image");
  const models = services.aiConfigs.models("pearapi", "image");
  const model =
    models.find((m) => m.id === MODEL_ID) ||
    models.find((m) => /gpt-image-2\.5-2k/iu.test(m.id));
  if (!model) throw new Error(`目录无 ${MODEL_ID}`);
  services.aiConfigs.savePresets({
    image: { provider: "pearapi", model: model.id },
    video: null,
  });
  console.log(`使用 pearapi / ${model.id} @ ${ASPECT}；强制 use_previous=false`);

  // 整话同步五镜规格
  const synced = services.assets.syncPanels(
    EPISODE_ID,
    PANEL_SPECS.map((spec) => ({
      ...spec,
      reference_panel_id: null,
      image_recipe_prompt: "",
      image_recipe_references: [],
      extra_reference_images: [],
    })),
  );
  console.log(
    `已同步 ${synced.length} 镜：`,
    synced.map((p) => `${p.panel_number}:${p.title}:ref=${p.reference_panel_id ?? "-"}`).join(" | "),
  );

  const report: Array<Record<string, unknown>> = [];
  for (const panel of synced) {
    const assets = services.assets.listProjectAssets(PROJECT_ID);
    const recipe = assemblePanelRecipe({
      shot: { ...panel, reference_panel_id: null },
      assets,
      referencePanelImageUrl: null,
    });
    const updated = services.assets.updatePanel(panel.id, {
      reference_panel_id: null,
      image_recipe_prompt: recipe.panelRecipe.prompt,
      image_recipe_references: recipe.panelRecipe.references,
      recipe_reassembled: true,
    });
    console.log(
      `\n=== 镜${updated.panel_number} ${updated.title} refs=${recipe.panelRecipe.references.length} ===`,
    );
    console.log(recipe.panelRecipe.prompt.slice(0, 180).replace(/\n/g, " / ") + "…");

    let done = false;
    let lastError = "";
    for (let attempt = 1; attempt <= 4 && !done; attempt += 1) {
      try {
        const row = services.images.create({
          dramaId: PROJECT_ID,
          panelId: updated.id,
          provider: "pearapi",
          model: model.id,
          prompt: updated.image_recipe_prompt,
          aspectRatio: ASPECT,
          referenceImages: updated.image_recipe_references,
        });
        if (!row.task_id) throw new Error("无 task_id");
        console.log(`提交 generation=${row.id} task=${row.task_id} attempt=${attempt}`);
        const task = await waitTask(() => services.tasks.get(row.task_id as string));
        for (
          let i = 0;
          i < 60 && services.images.get(row.id)?.status === "remote";
          i += 1
        ) {
          await sleep(2000);
        }
        const gen = services.images.get(row.id)!;
        const panelAfter = services.assets.getPanel(updated.id)!;
        report.push({
          panelNumber: updated.panel_number,
          title: updated.title,
          attempt,
          model: model.id,
          aspectRatio: ASPECT,
          usePrevious: false,
          generationId: gen.id,
          taskStatus: task.status,
          taskError: task.error,
          generationStatus: gen.status,
          imageUrl: gen.image_url ?? panelAfter.image_url,
          refs: updated.image_recipe_references,
        });
        if (
          task.status === "completed" &&
          (gen.image_url || panelAfter.image_url) &&
          (gen.status === "completed" || gen.status === "remote")
        ) {
          console.log(`完成 ${gen.status} → ${gen.image_url ?? panelAfter.image_url}`);
          done = true;
          break;
        }
        lastError = task.error || gen.error_msg || "未完成";
        console.warn(`未完成：${lastError}`);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.warn(`尝试 ${attempt} 失败：${lastError}`);
        await sleep(3000 * attempt);
      }
    }
    if (!done) throw new Error(`镜${panel.panel_number} 失败：${lastError}`);
  }

  const out = path.resolve("data", "exports", "story1-panels-gpt25-noref-report.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ model: MODEL_ID, aspect: ASPECT, usePrevious: false, report }, null, 2), "utf8");
  console.log(`\n报告已写 ${out}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
