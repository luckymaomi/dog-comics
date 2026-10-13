/**
 * 故事1：保留镜 1–5 九宫格总镜，追加 1:1 单镜头分镜（镜 6 起），并挂 reference_panel_id 指向对应总镜。
 * 不跑生图。用法：cd backend && npx tsx scripts/seedStory1SingleShots.ts
 */
import { loadConfig } from "../src/config";
import { getDb } from "../src/db";
import { initializeDatabase } from "../src/db/schema";
import logger, { configureAuditLog } from "../src/logger";
import { providerRegistry } from "../src/providers";
import { createServices } from "../src/services/container";

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

type ShotSpec = {
  title: string;
  action: string;
  project_asset_ids: number[];
  /** 总镜 panel_number（1–5） */
  masterPanelNumber: number;
};

/** 与 regenStory1OwnerPass.ts 的 ORDER 对齐（删逼／裂地／景色空镜，加近场／静夜／下引／泪握） */
const SHOTS: ShotSpec[] = [
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
  },
  {
    title: "救度·破暗",
    action: [
      "单镜头，9:16，同一水墨体系，从极暗被一道光照亮。",
      "上一镜是吞没：此刻地狱仍极繁、极暗，普通奶龙与无数劳苦众生剪影挤在烟桥／火渊／狱门之间，像被业力压着的众生潮。",
      "关键：一道清净佛光自上而下劈开墨暗与繁纹，把地狱照亮——光柱中隐约可见佛陀奶龙的圆光／金黄身影（可稍远、不要抢成接引握手特写）。",
      "重点是「光照亮地狱与劳苦众生」，不是伸手托人；托人留给下一镜「接引」。",
      "普通奶龙可在光里惊惶／含泪抬头，不要笑。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.buddha, ASSETS.nailong, ASSETS.hellNear, ASSETS.hellFar],
    masterPanelNumber: 5,
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
  },
];

function main(): void {
  const config = loadConfig();
  configureAuditLog(process.env.DOG_COMICS_AUDIT_LOG_PATH?.trim() || undefined);
  const db = getDb(config.database);
  initializeDatabase(db);
  const services = createServices(db, config, providerRegistry, logger);

  const project = services.projects.require(PROJECT_ID);
  const episode = project.episodes?.[0];
  if (!episode) throw new Error("无话");

  const existing = services.assets.listPanels(episode.id);
  const masters = new Map(
    existing
      .filter((p) => p.panel_number >= 1 && p.panel_number <= 5)
      .map((p) => [p.panel_number, p]),
  );
  if (masters.size < 5) {
    throw new Error(`需要先有镜1–5总镜，当前只有 ${masters.size} 个`);
  }

  // 删掉旧的单镜头（panel_number > 5），保留 1–5
  const toRemove = existing.filter((p) => p.panel_number > 5);
  for (const panel of [...toRemove].reverse()) {
    services.assets.deletePanel(panel.id);
  }
  console.log(`已删除旧单镜头 ${toRemove.length} 条；保留总镜 1–5`);

  const created: Array<{ n: number; title: string; ref: number }> = [];
  for (const shot of SHOTS) {
    const master = masters.get(shot.masterPanelNumber);
    if (!master) throw new Error(`缺总镜 ${shot.masterPanelNumber}`);
    const panel = services.assets.createPanel({
      episode_id: episode.id,
      title: shot.title,
      action: shot.action,
      project_asset_ids: shot.project_asset_ids,
      reference_panel_id: master.id,
      image_recipe_prompt: "",
      image_recipe_references: [],
      extra_reference_images: [],
    });
    created.push({
      n: panel.panel_number,
      title: panel.title ?? "",
      ref: master.panel_number,
    });
  }

  const all = services.assets.listPanels(episode.id);
  console.log(`当前共 ${all.length} 镜`);
  for (const row of created) {
    console.log(`+ 镜${row.n} ${row.title} → 引用总镜${row.ref}`);
  }
}

main();
