/**
 * 只重跑故事1「着魔1／镜2」：末格改为向下拖入地狱，不用上一镜。
 * gpt-image-2.5-2k @ 1:1
 * 用法：cd backend && npx tsx scripts/regenStory1Panel2HellPull.ts
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
const PANEL_NUMBER = 2;

const ASSETS = {
  hope: 3,
  nailong: 5,
  hellFar: 6,
} as const;

const ACTION = [
  "产出横版 3×3 九宫格，同一水墨体系，由甜入魔，画幅正方形九宫格。",
  "上排：小院日常普通奶龙望天；期待小愿合十；期待浅笑。",
  "中排：期待更深／兴奋；修行名相跪拜；期盼魔初现（利爪清楚可见）。",
  "下排：期盼魔牵红绳，普通奶龙跟随；脚下发暗、狱气上涌；普通奶龙脚离地，被绳向下拖入地狱暗渊（末格必须是往下、往地狱里拽，可露出地狱远景烟桥／狱门一角，不要画成升天金光、不要往光柱里飞）。",
  "期盼魔外形必须一眼可辨（参考其标准图）：奶龙身份，但魔王姿——头顶草束／高耸束发，绳辫与锯齿纸垂，脑后水墨圆光，胸肩繁复纹样，下方露出粗壮利爪／利爪手脚（爪要夸张可见，勿画成普通奶龙圆手），目光摄人。",
  "出场资产：角色「普通奶龙」「期盼魔」；场景「地狱远景」（仅下排末格入狱方向）。不要使用上一镜底板。不要画成三头多臂。",
  "旁白：期盼排比……再要一点……脚却已经离地了。——末格是被向下拖进地狱。",
].join("\n");

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
  configureAuditLog(process.env.POTATO_AUDIT_LOG_PATH?.trim() || undefined);
  const db = getDb(config.database);
  initializeDatabase(db);
  const services = createServices(db, config, providerRegistry, logger);
  services.images.startArchiveRetryLoop();

  const panelRow = db
    .prepare(
      `SELECT id, title FROM panels WHERE episode_id = (
         SELECT id FROM episodes WHERE drama_id = ? ORDER BY episode_number LIMIT 1
       ) AND panel_number = ?`,
    )
    .get(PROJECT_ID, PANEL_NUMBER) as { id: number; title: string | null } | undefined;
  if (!panelRow) throw new Error(`找不到镜 ${PANEL_NUMBER}`);

  const stuck = db
    .prepare(
      `SELECT id, task_id FROM image_generations
       WHERE panel_id = ? AND status IN ('pending','processing')`,
    )
    .all(panelRow.id) as Array<{ id: number; task_id: string | null }>;
  for (const row of stuck) {
    if (row.task_id) {
      services.images.settleByTaskId(row.task_id, "cancelled", "着魔1重跑：取消卡住任务");
    } else {
      db.prepare(
        `UPDATE image_generations SET status = 'cancelled', error_msg = ?, updated_at = ? WHERE id = ?`,
      ).run("着魔1重跑", new Date().toISOString(), row.id);
    }
  }

  console.log(`刷新目录并锁定 ${MODEL_ID}…`);
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

  const updated = services.assets.updatePanel(panelRow.id, {
    title: "着魔1",
    action: ACTION,
    project_asset_ids: [ASSETS.nailong, ASSETS.hope, ASSETS.hellFar],
    reference_panel_id: null,
    image_recipe_prompt: "",
    image_recipe_references: [],
    extra_reference_images: [],
  });

  const assets = services.assets.listProjectAssets(PROJECT_ID);
  const recipe = assemblePanelRecipe({
    shot: { ...updated, reference_panel_id: null },
    assets,
    referencePanelImageUrl: null,
  });
  const ready = services.assets.updatePanel(updated.id, {
    reference_panel_id: null,
    image_recipe_prompt: recipe.panelRecipe.prompt,
    image_recipe_references: recipe.panelRecipe.references,
    recipe_reassembled: true,
  });

  console.log(
    `镜${ready.panel_number} ${ready.title} refs=${recipe.panelRecipe.references.length}`,
  );
  console.log(recipe.panelRecipe.prompt.slice(0, 280).replace(/\n/g, " / "));

  let done = false;
  let lastError = "";
  let report: Record<string, unknown> = {};
  for (let attempt = 1; attempt <= 4 && !done; attempt += 1) {
    try {
      const row = services.images.create({
        dramaId: PROJECT_ID,
        panelId: ready.id,
        provider: "pearapi",
        model: model.id,
        prompt: ready.image_recipe_prompt,
        aspectRatio: ASPECT,
        referenceImages: ready.image_recipe_references,
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
      const panelAfter = services.assets.getPanel(ready.id)!;
      report = {
        panelNumber: ready.panel_number,
        title: ready.title,
        attempt,
        model: model.id,
        generationId: gen.id,
        taskStatus: task.status,
        taskError: task.error,
        generationStatus: gen.status,
        imageUrl: gen.image_url ?? panelAfter.image_url,
        localPath: gen.local_path,
      };
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
  if (!done) throw new Error(`着魔1失败：${lastError}`);

  // 同步改主脚本里的镜2规格，避免下次五镜重跑又写回金光
  const out = path.resolve("data", "exports", "story1-panel2-hell-pull-report.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(`报告 ${out}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
