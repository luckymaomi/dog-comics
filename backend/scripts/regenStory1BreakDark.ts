/**
 * 单镜重跑：救度·破暗 —— 一道光照亮地狱与劳苦众生（接引之前）。
 * 不删历史。9:16 / gpt-image-2.5-2k
 */
import { loadConfig } from "../src/config";
import { getDb } from "../src/db";
import { initializeDatabase } from "../src/db/schema";
import logger, { configureAuditLog } from "../src/logger";
import { providerRegistry } from "../src/providers";
import { createServices } from "../src/services/container";
import { assemblePanelRecipe } from "../src/services/storyboardPromptAssembler";

const MODEL_ID = "gpt-image-2.5-2k";
const ASPECT = "9:16";
const PROJECT_ID = 1;
const TITLE = "救度·破暗";

const ACTION = [
  "单镜头，9:16，同一水墨体系，从极暗被一道光照亮。",
  "上一镜是吞没：此刻地狱仍极繁、极暗，普通奶龙与无数劳苦众生剪影挤在烟桥／火渊／狱门之间，像被业力压着的众生潮。",
  "关键：一道清净佛光自上而下劈开墨暗与繁纹，把地狱照亮——光柱中隐约可见佛陀奶龙的圆光／金黄身影（可稍远、不要抢成接引握手特写）。",
  "重点是「光照亮地狱与劳苦众生」，不是伸手托人；托人留给下一镜「接引」。",
  "普通奶龙可在光里惊惶／含泪抬头，不要笑。不要九宫格，不要出字。",
].join("\n");

const ASSETS = {
  buddha: 1,
  nailong: 5,
  hellFar: 6,
  hellNear: 7,
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitTask(
  get: () =>
    | { status: string; error: string | null; result?: unknown }
    | undefined,
) {
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
    await sleep(2500);
  }
  throw new Error("超时");
}

async function main() {
  const config = loadConfig();
  configureAuditLog(process.env.DOG_COMICS_AUDIT_LOG_PATH?.trim() || undefined);
  const db = getDb(config.database);
  initializeDatabase(db);
  const services = createServices(db, config, providerRegistry, logger);
  services.images.startArchiveRetryLoop();

  const episode = db
    .prepare(
      `SELECT id FROM episodes WHERE drama_id = ? ORDER BY episode_number LIMIT 1`,
    )
    .get(PROJECT_ID) as { id: number };
  const panels = services.assets.listPanels(episode.id);
  const panel = panels.find((p) => p.title === TITLE);
  if (!panel) throw new Error(`找不到 ${TITLE}`);
  const master5 = panels.find((p) => p.panel_number === 5);
  const swallow = panels.find((p) => p.title === "地狱·吞没");
  console.log(`目标：镜${panel.panel_number} id=${panel.id}`);

  await services.aiConfigs.refresh("pearapi", "image");
  const models = services.aiConfigs.models("pearapi", "image");
  const model =
    models.find((m) => m.id === MODEL_ID) ||
    models.find((m) => /gpt-image-2\.5-2k/iu.test(m.id));
  if (!model) throw new Error(`无 ${MODEL_ID}`);

  const updated = services.assets.updatePanel(panel.id, {
    action: ACTION,
    project_asset_ids: [
      ASSETS.buddha,
      ASSETS.nailong,
      ASSETS.hellNear,
      ASSETS.hellFar,
    ],
    reference_panel_id: swallow?.id ?? master5?.id ?? panel.reference_panel_id,
  });

  const assets = services.assets.listProjectAssets(PROJECT_ID);
  const referenced = updated.reference_panel_id
    ? services.assets.getPanel(updated.reference_panel_id)
    : undefined;
  const recipe = assemblePanelRecipe({
    shot: updated,
    assets,
    referencePanelImageUrl: referenced?.image_url ?? null,
  });
  const ready = services.assets.updatePanel(updated.id, {
    image_recipe_prompt: recipe.panelRecipe.prompt,
    image_recipe_references: recipe.panelRecipe.references,
    recipe_reassembled: true,
  });

  console.log(`refs=${recipe.panelRecipe.references.length}`);
  console.log(ACTION);

  let lastError = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
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
      const after = services.assets.getPanel(ready.id)!;
      if (
        task.status === "completed" &&
        (gen.image_url || after.image_url) &&
        (gen.status === "completed" || gen.status === "remote")
      ) {
        console.log(`完成 ${gen.status} → ${gen.image_url ?? after.image_url}`);
        return;
      }
      lastError = task.error || gen.error_msg || "未完成";
      console.warn(lastError);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn(`尝试 ${attempt}：${lastError}`);
      await sleep(3000 * attempt);
    }
  }
  throw new Error(lastError);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
