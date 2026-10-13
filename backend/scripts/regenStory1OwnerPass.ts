/**
 * Owner 审片后补镜 + 局部重跑（9:16 / gpt-image-2.5-2k）。
 * - 说法：远景(佛在远处) → 近场(无佛脸突变) → 静夜 → 盼
 * - 念：盼为参考，头不要占满框，脑内幻象
 * - 牵绳／下引：魔在前牵着往下走
 * - 缩：只允许一只普通奶龙
 * - 接引／泪握：普通奶龙哭／委屈，不要笑
 * 不删 generation 历史。
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

type Spec = {
  title: string;
  action: string;
  project_asset_ids: number[];
  masterPanelNumber: number;
  /** 优先引用同话内某单镜标题，否则用总镜 */
  referenceTitle?: string;
  regen: boolean;
};

const ORDER: Spec[] = [
  {
    title: "说法·远景",
    action: [
      "单镜头，9:16，同一水墨体系，疏、静、夜色。",
      "法会月夜大远景：层叠墨山、雾气、山寺灯火与众生剪影潮。",
      "佛陀奶龙只在远处坛上／殿内成极小一点金黄圆光剪影，看不清脸与五官；重点是夜色景色建立全场。",
      "不要佛陀近景大脸，不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.dharma, ASSETS.buddha],
    masterPanelNumber: 1,
    regen: true,
  },
  {
    title: "说法·近场",
    action: [
      "单镜头，9:16，同一水墨体系，夜色。",
      "比远景更近一档：阶前众生剪影与灯火更清楚，看向山寺殿门；殿内只剩暖光／圆光虚影，仍看不清佛陀脸。",
      "严禁突然出现佛陀奶龙中近景或正面大脸。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.dharma],
    masterPanelNumber: 1,
    referenceTitle: "说法·远景",
    regen: true,
  },
  {
    title: "说法·静夜",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "收束空镜：深蓝夜空细月、远山淡墨、松影；人物与佛陀都退场或极远不可辨。",
      "静、留白，作为切到日常「盼」之前的一口气。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.dharma],
    masterPanelNumber: 1,
    referenceTitle: "说法·远景",
    regen: true,
  },
  {
    title: "着魔1·盼",
    action: [
      "单镜头，9:16，同一水墨体系，日常偏暖。",
      "小院中普通奶龙翘首以盼：望天或合十，表情认真期待。全身或半身，不要头占满画框。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong],
    masterPanelNumber: 2,
    regen: false,
  },
  {
    title: "着魔1·念",
    action: [
      "单镜头，9:16，同一水墨体系。必须延续「着魔1·盼」同一小院与同一只普通奶龙，不要换造型。",
      "构图：普通奶龙只占画面下半约三分之一到一半（头不要巨大贴镜头）；上方／周围是脑内幻象小窗或光泡：日常小愿、念佛名相、感应等碎片，像一件件愿望浮现。",
      "表情期待加重，可闭目或星光眼，但全身比例正常。严禁大头特写占满框。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong],
    masterPanelNumber: 2,
    referenceTitle: "着魔1·盼",
    regen: true,
  },
  {
    title: "着魔1·魔现",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "期盼魔现身：奶龙身份魔王姿，草束／束发、绳辫、水墨圆光、繁复纹样，粗壮利爪必须清楚夸张。体量远大于普通奶龙。",
      "不要三头，不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.hope, ASSETS.nailong],
    masterPanelNumber: 2,
    regen: false,
  },
  {
    title: "着魔1·牵绳",
    action: [
      "单镜头，9:16，同一水墨体系，开始发暗。",
      "构图必须：期盼魔走在前面／画面偏前，背对或侧对镜头，用红绳往前下方牵；普通奶龙在后面被牵着跟走，绳子从魔手连到奶龙。",
      "方向是往下坡／往暗处走，不是魔站在奶龙身后推。利爪可见。不要升天金光，不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.hope, ASSETS.nailong],
    masterPanelNumber: 2,
    referenceTitle: "着魔1·魔现",
    regen: true,
  },
  {
    title: "着魔1·下引",
    action: [
      "单镜头，9:16，同一水墨体系，更暗。",
      "山道／墨石下坡：期盼魔仍在前方拉红绳，普通奶龙踉跄跟下；脚下发暗、狱气开始上涌，远处隐约狱门或烟桥一点。",
      "魔在前、奶龙在后、整体往画面下方移动。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.hope, ASSETS.nailong, ASSETS.hellFar],
    masterPanelNumber: 2,
    referenceTitle: "着魔1·牵绳",
    regen: true,
  },
  {
    title: "着魔1·下坠",
    action: [
      "单镜头，9:16，同一水墨体系，收暗、向下拽。",
      "构图必须清楚：普通奶龙在画面上方，双脚离地、身体被红绳吊着往下坠；期盼魔在画面下方／下半部（粗壮利爪、魔王姿），抓住红绳把奶龙往地狱里拽。",
      "画面底部是地狱：烟桥、狱门、熔岩橙光或暗渊。利爪夸张可见。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.hope, ASSETS.hellFar],
    masterPanelNumber: 2,
    regen: false,
  },
  {
    title: "着魔2·魔现",
    action: [
      "单镜头，9:16，同一水墨体系，冷墨压抑。",
      "畏惧魔压迫登场：三头并立忿怒奶龙脸必须同时清楚可读，多臂对称展开，粗壮利爪张开放大前景；普通奶龙仅作下方渺小剪影。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.fear, ASSETS.nailong],
    masterPanelNumber: 3,
    regen: false,
  },
  {
    title: "着魔2·缩",
    action: [
      "单镜头，9:16，同一水墨体系，冷墨压迫。",
      "画面里只允许出现一只普通奶龙：她在岩穴／墨烟角落蜷缩成防御圆球，泪痕清楚，双手抱头或抱膝；上方可有畏惧魔三头虚影或利爪阴影压迫，但不要画第二、第三只普通奶龙。",
      "严禁三联分镜、严禁同一只奶龙出现三次。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.fear],
    masterPanelNumber: 3,
    regen: true,
  },
  {
    title: "着魔2·交撕",
    action: [
      "单镜头，9:16，同一水墨体系，左右撕扯。",
      "期盼与畏惧同时交逼：左侧期盼魔（单头、红绳）往「再要一点」拽；右侧畏惧魔（三头清楚）冷墨压来；中间只有一只普通奶龙被两边拽得离地。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.hope, ASSETS.fear, ASSETS.nailong],
    masterPanelNumber: 3,
    regen: false,
  },
  {
    title: "着魔2·入狱",
    action: [
      "单镜头，9:16，同一水墨体系，向下向里。",
      "普通奶龙被魔爪／红绳拖入地狱狱门：身体翻转下坠，下方烟桥、狱门山城、熔岩橙光；是魔带着她往里拖的感觉。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.fear, ASSETS.nailong, ASSETS.hellFar],
    masterPanelNumber: 3,
    regen: false,
  },
  {
    title: "地狱·桥押",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "石桥上押魂队列拥挤前行，狱卒持矛剪影；普通奶龙夹在队中或被绳牵着走过深渊上方。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.hellFar],
    masterPanelNumber: 4,
    regen: false,
  },
  {
    title: "地狱·坠入",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "普通奶龙坠入／半没入烟灰，泪眼伸爪；尺度渺小。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.hellFar],
    masterPanelNumber: 4,
    regen: false,
  },
  {
    title: "地狱·吞没",
    action: [
      "单镜头，9:16，同一水墨体系，极繁最满。",
      "繁复忿怒纹样／面具铠甲几乎填满画面，普通奶龙缩成一点几乎被吞没。最暗收束。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.hellNear, ASSETS.hellFar],
    masterPanelNumber: 4,
    regen: false,
  },
  {
    title: "救度·破暗",
    action: [
      "单镜头，9:16，同一水墨体系，从极暗转向光。",
      "地狱最暗处一道清净佛光劈开墨暗；佛陀奶龙圆光在光柱中显现。普通奶龙仍在下方，表情惊惶／含泪，不要笑。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.buddha, ASSETS.nailong, ASSETS.hellNear, ASSETS.hellFar],
    masterPanelNumber: 5,
    regen: false,
  },
  {
    title: "救度·接引",
    action: [
      "单镜头，9:16，同一水墨体系，向上接引。",
      "佛陀奶龙伸手托起／接住普通奶龙，把她从火渊向上引离；身下残火，上方清光。",
      "普通奶龙必须是哭／泪眼／委屈表情（像被牵离时还在害怕），严禁微笑、浅笑、开心脸。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.buddha, ASSETS.nailong, ASSETS.dharma, ASSETS.hellNear],
    masterPanelNumber: 5,
    referenceTitle: "救度·破暗",
    regen: true,
  },
  {
    title: "救度·泪握",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "更近一档：佛陀奶龙的手／光掌稳稳握住普通奶龙；普通奶龙泪流满面、抽泣，眼神还带着怕，但开始被托住。",
      "只要一只普通奶龙；不要笑。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.buddha, ASSETS.nailong],
    masterPanelNumber: 5,
    referenceTitle: "救度·接引",
    regen: true,
  },
  {
    title: "回归·清光",
    action: [
      "单镜头，9:16，同一水墨体系，骤疏骤亮。",
      "暗气将散，一道清光打在法会山寺；灯海众生。忽然干净。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.dharma, ASSETS.buddha],
    masterPanelNumber: 5,
    regen: false,
  },
  {
    title: "回归·佛现",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "佛陀奶龙近景：袈裟、清晰水墨圆光、安详翠眼。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.buddha, ASSETS.dharma],
    masterPanelNumber: 5,
    regen: false,
  },
  {
    title: "回归·相对",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "佛陀奶龙与普通奶龙相对或并立：合十、师徒视线；法会灯火虚化背景。普通奶龙可仍含泪但已安定，不要傻笑。",
      "不要双魔，不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.buddha, ASSETS.nailong, ASSETS.dharma],
    masterPanelNumber: 5,
    regen: false,
  },
  {
    title: "回归·月色",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "新月山水留白收束：远山、细月、松影；人物退场。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.dharma],
    masterPanelNumber: 5,
    regen: false,
  },
];

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
        "owner 审片重跑：取消卡住任务",
      );
    } else {
      db.prepare(
        `UPDATE image_generations SET status = 'cancelled', error_msg = ?, updated_at = ? WHERE id = ?`,
      ).run("owner 审片重跑", new Date().toISOString(), row.id);
    }
  }

  const fresh = services.assets.getPanel(panelId)!;
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

  let lastError = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
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
      const after = services.assets.getPanel(ready.id)!;
      if (
        task.status === "completed" &&
        (gen.image_url || after.image_url) &&
        (gen.status === "completed" || gen.status === "remote")
      ) {
        console.log(`完成 ${gen.status} → ${gen.image_url ?? after.image_url}`);
        report.push({
          title: ready.title,
          panelNumber: ready.panel_number,
          ok: true,
          imageUrl: gen.image_url ?? after.image_url,
        });
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
  report.push({ title: ready.title, ok: false, lastError });
  throw new Error(`${ready.title} 失败：${lastError}`);
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
    .get(PROJECT_ID) as { id: number };
  const masters = services.assets
    .listPanels(episode.id)
    .filter((p) => p.panel_number <= 5);
  const masterByN = new Map(masters.map((p) => [p.panel_number, p]));
  if (masterByN.size < 5) throw new Error("缺总镜 1–5");

  // 1) upsert 规格（先写正文与资产；引用稍后二次绑定）
  for (const spec of ORDER) {
    const master = masterByN.get(spec.masterPanelNumber)!;
    const existing = services.assets
      .listPanels(episode.id)
      .find((p) => p.title === spec.title);
    if (existing) {
      services.assets.updatePanel(existing.id, {
        action: spec.action,
        project_asset_ids: spec.project_asset_ids,
        reference_panel_id: master.id,
      });
      console.log(`更新 ${spec.title}`);
    } else {
      services.assets.createPanel({
        episode_id: episode.id,
        title: spec.title,
        action: spec.action,
        project_asset_ids: spec.project_asset_ids,
        reference_panel_id: master.id,
        image_recipe_prompt: "",
        image_recipe_references: [],
        extra_reference_images: [],
      });
      console.log(`新建 ${spec.title}`);
    }
  }

  // 2) 按 ORDER 重排单镜头（总镜 1–5 固定）
  const all = services.assets.listPanels(episode.id);
  const keepTitles = new Set(ORDER.map((s) => s.title));
  const orphans = all.filter(
    (p) => p.panel_number > 5 && !keepTitles.has(p.title ?? ""),
  );
  for (const o of orphans) {
    console.log(`保留未在本轮名单的镜（不删）：${o.panel_number} ${o.title}`);
  }

  // 临时把单镜头推到高序号，避免 UNIQUE 冲突
  const singles = all.filter((p) => p.panel_number > 5);
  let tmp = 1000;
  for (const p of singles) {
    db.prepare(`UPDATE panels SET panel_number = ? WHERE id = ?`).run(tmp++, p.id);
  }
  let n = 6;
  for (const spec of ORDER) {
    const row = services.assets
      .listPanels(episode.id)
      .find((p) => p.title === spec.title);
    if (!row) throw new Error(`缺 ${spec.title}`);
    db.prepare(`UPDATE panels SET panel_number = ? WHERE id = ?`).run(n++, row.id);
  }
  // 其余孤儿接到后面
  for (const o of orphans) {
    db.prepare(`UPDATE panels SET panel_number = ? WHERE id = ?`).run(n++, o.id);
  }

  // 3) 绑定单镜引用
  const byTitle = new Map(
    services.assets.listPanels(episode.id).map((p) => [p.title ?? "", p]),
  );
  for (const spec of ORDER) {
    const row = byTitle.get(spec.title);
    if (!row) continue;
    const master = masterByN.get(spec.masterPanelNumber)!;
    const ref =
      (spec.referenceTitle && byTitle.get(spec.referenceTitle)) || master;
    services.assets.updatePanel(row.id, {
      action: spec.action,
      project_asset_ids: spec.project_asset_ids,
      reference_panel_id: ref.id,
    });
  }

  console.log("当前单镜序：");
  for (const p of services.assets.listPanels(episode.id)) {
    if (p.panel_number <= 5) continue;
    console.log(`  ${p.panel_number}. ${p.title}`);
  }

  await services.aiConfigs.refresh("pearapi", "image");
  const models = services.aiConfigs.models("pearapi", "image");
  const model =
    models.find((m) => m.id === MODEL_ID) ||
    models.find((m) => /gpt-image-2\.5-2k/iu.test(m.id));
  if (!model) throw new Error(`无 ${MODEL_ID}`);

  const report: Array<Record<string, unknown>> = [];
  const regenTitles = ORDER.filter((s) => s.regen).map((s) => s.title);
  // 生成顺序：先远景再近场／静夜；先盼保持；念依赖盼图；牵绳→下引；缩；接引→泪握
  for (const title of regenTitles) {
    const panel = services.assets
      .listPanels(episode.id)
      .find((p) => p.title === title);
    if (!panel) throw new Error(`找不到 ${title}`);
    await generateOne(services, db, model.id, panel.id, report);
  }

  const out = path.join(
    process.cwd(),
    "data",
    "exports",
    "story1-owner-pass-report.json",
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(`\n报告 ${out}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
