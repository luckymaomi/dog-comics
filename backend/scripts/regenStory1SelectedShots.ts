/**
 * 局部重跑／加镜：着魔2 若干镜 + 地狱吞没与回归之间的「佛光救度」2 镜。
 * 不删 generation 历史；只换当前指针。9:16 / gpt-image-2.5-2k
 * 用法：cd backend && npx tsx scripts/regenStory1SelectedShots.ts
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

const ASSETS = {
  buddha: 1,
  hope: 3,
  fear: 4,
  nailong: 5,
  hellFar: 6,
  hellNear: 7,
  dharma: 8,
} as const;

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

async function generateOne(
  services: ReturnType<typeof createServices>,
  db: ReturnType<typeof getDb>,
  modelId: string,
  panelId: number,
  report: Array<Record<string, unknown>>,
): Promise<void> {
  const stuck = db
    .prepare(
      `SELECT id, task_id FROM image_generations
       WHERE panel_id = ? AND status IN ('pending','processing')`,
    )
    .all(panelId) as Array<{ id: number; task_id: string | null }>;
  for (const row of stuck) {
    if (row.task_id) {
      services.images.settleByTaskId(
        row.task_id,
        "cancelled",
        "局部重跑：取消卡住任务",
      );
    } else {
      db.prepare(
        `UPDATE image_generations SET status = 'cancelled', error_msg = ?, updated_at = ? WHERE id = ?`,
      ).run("局部重跑", new Date().toISOString(), row.id);
    }
  }

  const fresh = services.assets.getPanel(panelId);
  if (!fresh) throw new Error(`分镜 ${panelId} 不存在`);
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
    `\n=== 镜${ready.panel_number} ${ready.title} refs=${recipe.panelRecipe.references.length} ===`,
  );

  let done = false;
  let lastError = "";
  for (let attempt = 1; attempt <= 4 && !done; attempt += 1) {
    try {
      const row = services.images.create({
        dramaId: PROJECT_ID,
        panelId: ready.id,
        provider: "pearapi",
        model: modelId,
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
        generationId: gen.id,
        taskStatus: task.status,
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
    throw new Error(`镜${ready.panel_number} 失败：${lastError}`);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  configureAuditLog(process.env.POTATO_AUDIT_LOG_PATH?.trim() || undefined);
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

  const byTitle = (title: string) => {
    const row = services.assets
      .listPanels(episode.id)
      .find((p) => p.title === title);
    if (!row) throw new Error(`找不到「${title}」`);
    return row;
  };

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

  const masters = services.assets.listPanels(episode.id).filter((p) => p.panel_number <= 5);
  const masterFear = masters.find((p) => p.panel_number === 3)!;
  const masterReturn = masters.find((p) => p.panel_number === 5)!;
  if (!masterFear || !masterReturn) throw new Error("缺少总镜 3 或 5");

  // —— 更新着魔2 规格 ——
  const updates: Array<{ title: string; action: string; assets: number[] }> = [
    {
      title: "着魔2·魔现",
      action: [
        "单镜头，9:16，同一水墨体系，冷墨压抑。",
        "畏惧魔压迫登场：三头并立忿怒奶龙脸必须同时清楚可读，多臂对称展开，胸前璎珞与眼纹圆光，粗壮利爪张开放大前景；极低机位仰拍，普通奶龙仅作画面下方渺小剪影。",
        "墨烟与炭黑为主。不要九宫格，不要出字。",
      ].join("\n"),
      assets: [ASSETS.fear, ASSETS.nailong],
    },
    {
      title: "着魔2·缩",
      action: [
        "单镜头，9:16，同一水墨体系，情绪更满一层。",
        "普通奶龙畏惧层层加深：先泪眼合十贴胸，再哭喊（一爪近嘴、泪痕清楚），最后蜷缩成防御圆球贴着岩穴／墨烟角落；背景冷墨烟涌动，可隐约有畏惧魔爪影或三头虚影压在上方，但不抢主体。",
        "竖构图吃满压迫感。不要九宫格，不要出字。",
      ].join("\n"),
      assets: [ASSETS.nailong, ASSETS.fear],
    },
    {
      title: "着魔2·交撕",
      action: [
        "单镜头，9:16，同一水墨体系，左右撕扯。",
        "期盼与畏惧同时交逼：左侧／上方期盼魔（单头魔王姿、红绳、粗壮利爪）往「再要一点」方向拽；右侧／上方畏惧魔（三头清楚、多臂）冷墨压来；普通奶龙在中间被两边拽得离地，表情又贪又怕。",
        "两魔外形不可混。不要九宫格，不要出字。",
      ].join("\n"),
      assets: [ASSETS.hope, ASSETS.fear, ASSETS.nailong],
    },
    {
      title: "着魔2·入狱",
      action: [
        "单镜头，9:16，同一水墨体系，向下向里。",
        "普通奶龙被魔爪／红绳拖入地狱狱门或裂谷深渊：身体翻转下坠，下方烟桥、狱门山城、熔岩橙光涌起；方向必须往下拖进地狱，不是升天。",
        "可带畏惧魔三头或利爪在上方。不要九宫格，不要出字。",
      ].join("\n"),
      assets: [ASSETS.fear, ASSETS.nailong, ASSETS.hellFar],
    },
  ];

  for (const spec of updates) {
    const panel = byTitle(spec.title);
    services.assets.updatePanel(panel.id, {
      action: spec.action,
      project_asset_ids: spec.assets,
      reference_panel_id: masterFear.id,
    });
    console.log(`已更新规格：${spec.title}`);
  }

  // —— 在「地狱·吞没」与「回归·清光」之间插入 2 镜救度 ——
  const swallow = byTitle("地狱·吞没");
  const existingRescue = services.assets
    .listPanels(episode.id)
    .filter((p) => (p.title ?? "").startsWith("救度·"));

  if (existingRescue.length >= 2) {
    console.log("救度镜已存在，跳过插入");
  } else {
    const insertAt = swallow.panel_number + 1; // 27
    const returnPanels = services.assets
      .listPanels(episode.id)
      .filter((p) => (p.title ?? "").startsWith("回归·"))
      .sort((a, b) => b.panel_number - a.panel_number);
    const now = new Date().toISOString();
    // 若回归还在 27–30，先整体 +2；若已是 29–32（上次半成功），则不动
    const needShift = returnPanels.some((p) => p.panel_number < insertAt + 2);
    if (needShift) {
      for (const p of returnPanels) {
        db.prepare(
          `UPDATE panels SET panel_number = ?, updated_at = ? WHERE id = ?`,
        ).run(p.panel_number + 2, now, p.id);
      }
      console.log(`已后移回归镜 ${returnPanels.length} 条`);
    } else {
      console.log("回归镜已在后方，直接填入 27–28 空洞");
    }

    const maxNum = (
      db
        .prepare(
          `SELECT COALESCE(MAX(panel_number), 0) AS n FROM panels WHERE episode_id = ?`,
        )
        .get(episode.id) as { n: number }
    ).n;

    const rescueSpecs = [
      {
        tempNumber: maxNum + 1,
        panel_number: insertAt,
        title: "救度·破暗",
        action: [
          "单镜头，9:16，同一水墨体系，从极暗转向光。",
          "地狱最繁复、最暗处：纹样与狱火正要吞没普通奶龙时，一道清净佛光自上劈开墨暗与繁纹；佛陀奶龙圆光在光柱中显现，狱纹退去、双魔影淡化。",
          "奶龙仍在下方火渊边缘。不要九宫格，不要出字。",
        ].join("\n"),
        project_asset_ids: [
          ASSETS.buddha,
          ASSETS.nailong,
          ASSETS.hellNear,
          ASSETS.hellFar,
        ],
        reference_panel_id: masterReturn.id,
      },
      {
        tempNumber: maxNum + 2,
        panel_number: insertAt + 1,
        title: "救度·接引",
        action: [
          "单镜头，9:16，同一水墨体系，向上接引。",
          "佛陀奶龙（袈裟、水墨圆光）伸手或光掌托起／接住普通奶龙，把她从火渊与锁链中向上引离；身下仍可见地狱残火与烟，上方已是清光与法会夜色的过渡。",
          "师徒两张奶龙脸都按资产标准图。不要九宫格，不要出字。",
        ].join("\n"),
        project_asset_ids: [
          ASSETS.buddha,
          ASSETS.nailong,
          ASSETS.dharma,
          ASSETS.hellNear,
        ],
        reference_panel_id: masterReturn.id,
      },
    ];

    for (const spec of rescueSpecs) {
      const created = services.assets.createPanel({
        episode_id: episode.id,
        panel_number: spec.tempNumber,
        title: spec.title,
        action: spec.action,
        project_asset_ids: spec.project_asset_ids,
        reference_panel_id: spec.reference_panel_id,
        image_recipe_prompt: "",
        image_recipe_references: [],
        extra_reference_images: [],
      });
      db.prepare(
        `UPDATE panels SET panel_number = ?, updated_at = ? WHERE id = ?`,
      ).run(spec.panel_number, new Date().toISOString(), created.id);
      console.log(
        `已插入 ${spec.title} → 镜${spec.panel_number} id=${created.id}`,
      );
    }
  }

  // 规范化：确保 panel_number 连续
  const all = services.assets
    .listPanels(episode.id)
    .sort((a, b) => a.panel_number - b.panel_number || a.id - b.id);
  // listPanels orders by panel_number; after our edits re-fetch
  const refreshed = db
    .prepare(
      `SELECT id, panel_number, title FROM panels WHERE episode_id = ? ORDER BY panel_number, id`,
    )
    .all(episode.id) as Array<{ id: number; panel_number: number; title: string | null }>;
  console.log(
    "当前序列：",
    refreshed.map((p) => `${p.panel_number}:${p.title}`).join(" | "),
  );

  const report: Array<Record<string, unknown>> = [];
  const toGenTitles = [
    "着魔2·魔现",
    "着魔2·缩",
    "着魔2·交撕",
    "着魔2·入狱",
    "救度·破暗",
    "救度·接引",
  ];
  for (const title of toGenTitles) {
    const panel = byTitle(title);
    await generateOne(services, db, model.id, panel.id, report);
  }

  const out = path.resolve(
    "data",
    "exports",
    "story1-selected-regen-report.json",
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
  const ok = report.filter((r) => r.ok).length;
  console.log(`\n完成：成功 ${ok}/${report.length} → ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
