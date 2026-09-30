/**
 * 故事1：从镜6起逐镜生成 9:16 竖屏单镜头底板。
 * 模型 gpt-image-2.5-2k；组装时带 reference_panel_id 总镜底板。
 * 默认跳过已有 image_url；设 FORCE_REGEN=1 则清空镜6起底板后全量重跑。
 * 用法：cd backend && npx tsx scripts/generateStory1SingleShotsGpt25.ts
 * 竖屏重跑：FORCE_REGEN=1 npx tsx scripts/generateStory1SingleShotsGpt25.ts
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
const ASPECT = "9:16";
const POLL_MS = 2500;
const PROJECT_ID = 1;
const START_PANEL_NUMBER = 6;
const FORCE_REGEN = process.env.FORCE_REGEN === "1";

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

  const episode = db
    .prepare(
      `SELECT id FROM episodes WHERE drama_id = ? ORDER BY episode_number LIMIT 1`,
    )
    .get(PROJECT_ID) as { id: number } | undefined;
  if (!episode) throw new Error("无话");

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
  console.log(`使用 pearapi / ${model.id} @ ${ASPECT}${FORCE_REGEN ? " FORCE_REGEN" : ""}`);

  if (FORCE_REGEN) {
    const targets = db
      .prepare(
        `SELECT id FROM panels WHERE episode_id = ? AND panel_number >= ?`,
      )
      .all(episode.id, START_PANEL_NUMBER) as Array<{ id: number }>;
    const now = new Date().toISOString();
    for (const row of targets) {
      db.prepare(
        `UPDATE panels SET image_url = NULL, current_image_generation_id = NULL, updated_at = ? WHERE id = ?`,
      ).run(now, row.id);
      // 规格文案里的画幅也改成竖屏
      db.prepare(
        `UPDATE panels SET action = replace(action, '单镜头，1:1', '单镜头，9:16'), updated_at = ? WHERE id = ? AND action LIKE '%单镜头，1:1%'`,
      ).run(now, row.id);
    }
    console.log(`已清空镜${START_PANEL_NUMBER}+ 底板 ${targets.length} 条，准备竖屏重跑`);
  }

  const panels = services.assets
    .listPanels(episode.id)
    .filter((p) => p.panel_number >= START_PANEL_NUMBER);
  const pending = panels.filter((p) => !p.image_url?.trim());
  console.log(
    `单镜头 ${panels.length} 条，待生成 ${pending.length} 条（跳过已有底板）`,
  );

  const report: Array<Record<string, unknown>> = [];
  for (const panel of pending) {
    // 取消该镜卡住任务
    const stuck = db
      .prepare(
        `SELECT id, task_id FROM image_generations
         WHERE panel_id = ? AND status IN ('pending','processing')`,
      )
      .all(panel.id) as Array<{ id: number; task_id: string | null }>;
    for (const row of stuck) {
      if (row.task_id) {
        services.images.settleByTaskId(
          row.task_id,
          "cancelled",
          "单镜头批量生成：取消卡住任务",
        );
      } else {
        db.prepare(
          `UPDATE image_generations SET status = 'cancelled', error_msg = ?, updated_at = ? WHERE id = ?`,
        ).run("单镜头批量生成", new Date().toISOString(), row.id);
      }
    }

    const fresh = services.assets.getPanel(panel.id)!;
    const assets = services.assets.listProjectAssets(PROJECT_ID);
    const referenced = fresh.reference_panel_id
      ? services.assets.getPanel(fresh.reference_panel_id)
      : undefined;
    const recipe = assemblePanelRecipe({
      shot: fresh,
      assets,
      referencePanelImageUrl: referenced?.image_url ?? null,
    });
    const ready = services.assets.updatePanel(fresh.id, {
      image_recipe_prompt: recipe.panelRecipe.prompt,
      image_recipe_references: recipe.panelRecipe.references,
      recipe_reassembled: true,
    });

    console.log(
      `\n=== 镜${ready.panel_number} ${ready.title} refs=${recipe.panelRecipe.references.length} refPanel=${ready.reference_panel_id ?? "-"} ===`,
    );

    let done = false;
    let lastError = "";
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
        const entry = {
          panelNumber: ready.panel_number,
          title: ready.title,
          attempt,
          model: model.id,
          generationId: gen.id,
          taskStatus: task.status,
          taskError: task.error,
          generationStatus: gen.status,
          imageUrl: gen.image_url ?? panelAfter.image_url,
        };
        if (
          task.status === "completed" &&
          (gen.image_url || panelAfter.image_url) &&
          (gen.status === "completed" || gen.status === "remote")
        ) {
          console.log(`完成 ${gen.status} → ${entry.imageUrl}`);
          report.push({ ...entry, ok: true });
          done = true;
          break;
        }
        lastError = task.error || gen.error_msg || "未完成";
        console.warn(`未完成：${lastError}`);
        report.push({ ...entry, ok: false, lastError });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.warn(`尝试 ${attempt} 失败：${lastError}`);
        await sleep(3000 * attempt);
      }
    }
    if (!done) {
      report.push({
        panelNumber: ready.panel_number,
        title: ready.title,
        ok: false,
        lastError,
      });
      console.error(`镜${ready.panel_number} 失败，继续下一镜：${lastError}`);
    }

    const out = path.resolve(
      "data",
      "exports",
      "story1-single-shots-gpt25-report.json",
    );
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      JSON.stringify(
        { model: MODEL_ID, aspect: ASPECT, updatedAt: new Date().toISOString(), report },
        null,
        2,
      ),
      "utf8",
    );
  }

  const ok = report.filter((r) => r.ok).length;
  const fail = report.filter((r) => r.ok === false).length;
  console.log(`\n全部跑完：成功 ${ok}，失败 ${fail}，合计尝试条目 ${report.length}`);
  console.log(
    path.resolve("data", "exports", "story1-single-shots-gpt25-report.json"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
