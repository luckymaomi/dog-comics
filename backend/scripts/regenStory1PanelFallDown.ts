/**
 * 单镜重跑：着魔1·下坠 —— 魔在下往地狱拽，奶龙在上被拖。
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
const TITLE = "着魔1·下坠";

const ACTION = [
  "单镜头，9:16，同一水墨体系，收暗、向下拽。",
  "构图必须清楚：普通奶龙在画面上方，双脚离地、身体被红绳吊着往下坠；期盼魔在画面下方／下半部（粗壮利爪、魔王姿），抓住红绳把奶龙往地狱里拽。",
  "画面底部是地狱：烟桥、狱门、熔岩橙光或暗渊，方向是魔把奶龙拖向下方地狱，不是升天、不是往光柱飞。",
  "利爪夸张可见。不要九宫格，不要出字。",
].join("\n");

const ASSETS = { hope: 3, nailong: 5, hellFar: 6 } as const;

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
  // 优先：标题含「下坠」；其次：单镜头文案「向下拖入地狱」（排除九宫格总镜）
  const panels = services.assets.listPanels(episode.id);
  const panel =
    panels.find((p) => (p.title ?? "").includes("下坠")) ||
    panels.find(
      (p) =>
        (p.action ?? "").includes("向下拖入地狱") &&
        (p.action ?? "").includes("单镜头"),
    ) ||
    panels.find((p) => p.id === 35);
  if (!panel) throw new Error(`找不到 ${TITLE}`);
  console.log(`目标：镜${panel.panel_number} id=${panel.id} title=${JSON.stringify(panel.title)}`);

  const master2 = panels.find((p) => p.panel_number === 2);
  if (!master2) throw new Error("找不到总镜2");
  if (panel.id === master2.id) {
    throw new Error("匹配到了总镜着魔1，已中止；请检查单镜头标题");
  }

  await services.aiConfigs.refresh("pearapi", "image");
  const models = services.aiConfigs.models("pearapi", "image");
  const model =
    models.find((m) => m.id === MODEL_ID) ||
    models.find((m) => /gpt-image-2\.5-2k/iu.test(m.id));
  if (!model) throw new Error(`无 ${MODEL_ID}`);

  const updated = services.assets.updatePanel(panel.id, {
    title: TITLE,
    action: ACTION,
    project_asset_ids: [ASSETS.nailong, ASSETS.hope, ASSETS.hellFar],
    reference_panel_id: master2.id,
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

  console.log(`镜${ready.panel_number} ${ready.title} refs=${recipe.panelRecipe.references.length}`);
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
