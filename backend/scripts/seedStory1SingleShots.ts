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

const SHOTS: ShotSpec[] = [
  // —— 说法（总镜1）——
  {
    title: "说法·远景",
    action: [
      "单镜头，9:16，同一水墨体系，疏、静。",
      "法会月夜大远景：层叠墨山、雾气、山寺灯火点点，阶前可见众生剪影潮。",
      "镜头感：建立全场，缓慢、空旷。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.dharma, ASSETS.buddha],
    masterPanelNumber: 1,
  },
  {
    title: "说法·众听",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "从众人身后或侧前方看向法会：整齐坐影／站影听法，暖灯与冷夜对比；远处坛上隐约一点黄（佛陀奶龙）。",
      "镜头感：比远景更近一档，慢慢拉近听法场。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.dharma, ASSETS.buddha],
    masterPanelNumber: 1,
  },
  {
    title: "说法·佛说",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "佛陀奶龙中近景：圆润黄身、袈裟、水墨圆光；可侧坐莲台或正面举手说法／闭目禅定过渡到开口说法。",
      "强调圆光与慈悲眼神。不要人类僧人脸，不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.buddha, ASSETS.dharma],
    masterPanelNumber: 1,
  },
  {
    title: "说法·月色",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "收束空镜：深蓝夜空一弯细月，远山淡墨，可带松枝剪影；人物退场或极远。",
      "留白、静。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.dharma],
    masterPanelNumber: 1,
  },

  // —— 着魔1（总镜2）——
  {
    title: "着魔1·盼",
    action: [
      "单镜头，9:16，同一水墨体系，日常偏暖。",
      "小院中普通奶龙翘首以盼：望天或合十，表情认真期待。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong],
    masterPanelNumber: 2,
  },
  {
    title: "着魔1·念",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "普通奶龙近景：期待加重——闭目浅笑或星光眼兴奋，像脑海里一件件愿望蹦出来。",
      "不要九宫格，不要出字。",
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
      "单镜头，9:16，同一水墨体系。",
      "期盼魔持红绳牵着普通奶龙向前走；绳是引导线，气氛开始发暗。",
      "利爪可见。不要升天金光，不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.hope, ASSETS.nailong],
    masterPanelNumber: 2,
  },
  {
    title: "着魔1·下坠",
    action: [
      "单镜头，9:16，同一水墨体系，收暗、向下拽。",
      "构图必须清楚：普通奶龙在画面上方，双脚离地、身体被红绳吊着往下坠；期盼魔在画面下方／下半部（粗壮利爪、魔王姿），抓住红绳把奶龙往地狱里拽。",
      "画面底部是地狱：烟桥、狱门、熔岩橙光或暗渊，方向是魔把奶龙拖向下方地狱，不是升天、不是往光柱飞。",
      "利爪夸张可见。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.hope, ASSETS.hellFar],
    masterPanelNumber: 2,
  },

  // —— 着魔2（总镜3）——
  {
    title: "着魔2·魔现",
    action: [
      "单镜头，9:16，同一水墨体系，冷墨压抑。",
      "畏惧魔压迫登场：三头并立忿怒奶龙脸必须同时清楚可读，多臂对称展开，胸前璎珞与眼纹圆光，粗壮利爪张开放大前景；极低机位仰拍，普通奶龙仅作画面下方渺小剪影。",
      "墨烟与炭黑为主。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.fear, ASSETS.nailong],
    masterPanelNumber: 3,
  },
  {
    title: "着魔2·缩",
    action: [
      "单镜头，9:16，同一水墨体系，情绪更满一层。",
      "普通奶龙畏惧层层加深：先泪眼合十贴胸，再哭喊（一爪近嘴、泪痕清楚），最后蜷缩成防御圆球贴着岩穴／墨烟角落；背景冷墨烟涌动，可隐约有畏惧魔爪影或三头虚影压在上方，但不抢主体。",
      "竖构图吃满压迫感。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.fear],
    masterPanelNumber: 3,
  },
  {
    title: "着魔2·逼",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "畏惧魔逼近，狱气上涌；普通奶龙被迫对峙，远处地狱远景显形。可带期盼魔虚影。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.fear, ASSETS.hope, ASSETS.nailong, ASSETS.hellFar],
    masterPanelNumber: 3,
  },
  {
    title: "着魔2·交撕",
    action: [
      "单镜头，9:16，同一水墨体系，左右撕扯。",
      "期盼与畏惧同时交逼：左侧／上方期盼魔（单头魔王姿、红绳、粗壮利爪）往「再要一点」方向拽；右侧／上方畏惧魔（三头清楚、多臂）冷墨压来；普通奶龙在中间被两边拽得离地，表情又贪又怕。",
      "两魔外形不可混。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.hope, ASSETS.fear, ASSETS.nailong],
    masterPanelNumber: 3,
  },
  {
    title: "着魔2·裂地",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "脚下地面裂开，狱气黑烟与橙火从缝里上涌；普通奶龙站不稳，身影将被吸入裂缝。",
      "方向往下。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.hellFar],
    masterPanelNumber: 3,
  },
  {
    title: "着魔2·入狱",
    action: [
      "单镜头，9:16，同一水墨体系，向下向里。",
      "普通奶龙被魔爪／红绳拖入地狱狱门或裂谷深渊：身体翻转下坠，下方烟桥、狱门山城、熔岩橙光涌起；方向必须往下拖进地狱，不是升天。",
      "可带畏惧魔三头或利爪在上方。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.fear, ASSETS.nailong, ASSETS.hellFar],
    masterPanelNumber: 3,
  },

  // —— 地狱（总镜4）—— 精彩段加厚
  {
    title: "地狱·远景",
    action: [
      "单镜头，9:16，同一水墨体系，极暗。",
      "地狱远景：烟云、石桥押魂长队、远处狱门山城。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.hellFar],
    masterPanelNumber: 4,
  },
  {
    title: "地狱·桥押",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "更近：石桥上押魂队列拥挤前行，狱卒持矛剪影；普通奶龙夹在队中或被绳牵着走过深渊上方。",
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
    title: "地狱·火窟",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "地狱近景：火涡或锁链滑轮刑具窟，普通奶龙困于火光中。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.hellNear],
    masterPanelNumber: 4,
  },
  {
    title: "地狱·深渊",
    action: [
      "单镜头，9:16，同一水墨体系。",
      "高角度俯视更深一层火渊：铁链斜拉，熔岩河弯曲，普通奶龙在崖边或链上更小一点；压迫感加重。",
      "不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.hellNear, ASSETS.hellFar],
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

  // —— 救度（吞没→回归过渡）——
  {
    title: "救度·破暗",
    action: [
      "单镜头，9:16，同一水墨体系，从极暗转向光。",
      "地狱最繁复、最暗处：纹样与狱火正要吞没普通奶龙时，一道清净佛光自上劈开墨暗与繁纹；佛陀奶龙圆光在光柱中显现，狱纹退去、双魔影淡化。",
      "奶龙仍在下方火渊边缘。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.buddha, ASSETS.nailong, ASSETS.hellNear, ASSETS.hellFar],
    masterPanelNumber: 5,
  },
  {
    title: "救度·接引",
    action: [
      "单镜头，9:16，同一水墨体系，向上接引。",
      "佛陀奶龙（袈裟、水墨圆光）伸手或光掌托起／接住普通奶龙，把她从火渊与锁链中向上引离；身下仍可见地狱残火与烟，上方已是清光与法会夜色的过渡。",
      "师徒两张奶龙脸都按资产标准图。不要九宫格，不要出字。",
    ].join("\n"),
    project_asset_ids: [ASSETS.buddha, ASSETS.nailong, ASSETS.dharma, ASSETS.hellNear],
    masterPanelNumber: 5,
  },

  // —— 回归（总镜5）——
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
      "佛陀奶龙与普通奶龙相对或并立：合十、师徒视线；法会灯火虚化背景。",
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
