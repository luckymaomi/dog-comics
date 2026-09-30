import type { AssetKind, AssetOutputType, ProjectAssetRow } from '../types/domain';
import { compileAssetTextBlock } from './storyboardPromptAssembler';
import { ValidationError } from '../errors';

/** 图片参考锁定：未选不组装；选中则按类型写入锁脸/锁景/锁物。 */
export type ReferenceLockKind = 'face' | 'scene' | 'prop';

/** 画面禁字：未选不组装；选中则写入禁止出字约束。 */
export type ImageTextBanKind = 'ban';

export type AssetOutputPromptSource = Pick<
  ProjectAssetRow,
  "kind" | "name" | "text_profile" | "output_type"
> & {
  input_reference_images?: readonly string[] | null;
  reference_lock?: ReferenceLockKind | null;
  ban_image_text?: ImageTextBanKind | null;
};

const OUTPUT_INSTRUCTIONS: Record<AssetOutputType, string> = {
  "character-layout-a":
    "产出布局 A（左脸右身）：左侧为正脸特写，包含头部与肩部并锁定五官与发型；右侧为正面、90度侧面、背面三张等高全身视图，头顶与脚底对齐。",
  "character-layout-b":
    "产出布局 B（4+3 双层）：第一排为正面、左侧面、右侧面、背面四张全身图；第二排为正面、左侧面、右侧面三张头部特写。",
  "character-layout-c":
    "产出布局 C（7 图身份锚点组）：正面肖像、四分之三侧面、纯侧面、全身、中性表情、微笑表情、手部特写。",
  "character-layout-d":
    "产出布局 D（表情 8 格）：同一角色、同一发型与服装，白底或浅灰底，八格表情表（每格只换表情，头身比例一致）：中性／平淡、微笑、捧腹大笑、悲伤、愤怒、惊讶、害怕／紧张、得意／坏笑。其中「捧腹大笑」必须极端夸张、一眼可辨：双眼眯成向下弯的缝几乎看不见瞳孔，嘴张到最大露出两排圆白牙，双手紧抱鼓起的大肚子或扶头捧腹，身体可略后仰；禁止只做成普通微笑或微张嘴。不要文字、水印、复杂背景。",
  "character-layout-e":
    "产出布局 E（动作 8 格）：同一角色、同一造型，白底或浅灰底，八格动作姿势表（每格全身可见，比例一致）：站立待机、行走、奔跑、坐下、挥手打招呼、伸手指指、双手抱胸、跳跃／腾空。不要文字、水印、复杂背景。",
  "character-layout-f":
    "产出布局 F（经典九宫格）：同一角色、同一造型，白底或浅灰底，严格 3×3 九格均分、格间留细白边，整张横版构图；格子内只有角色，不要编号、圈号、文字、水印、复杂背景。上排身份三视图（全身、头顶与脚底对齐）：左格正面全身；中格侧面全身（90度）；右格背面全身；三视图一律正常平静表情。中排叙事表情（半身或头肩、比例一致）：左格平淡／中性；中格捧腹大笑／大狂笑（夸张一眼可辨）；右格悲伤（眼眶被泪水浸湿、含泪欲滴）。下排叙事动作（全身可见）：左格挥手打招呼；中格坐下；右格奔跑。除中排中格大狂笑外，其余格子一律正常睁眼表情，禁止把狂笑脸套到其它格。",
  "character-layout-g":
    "产出布局 G（表情十六宫格）：同一角色、同一造型，白底或浅灰底，严格 4×4 十六格均分、格间留细白边，整张横版构图；每格半身或头肩、只换表情、头身比例一致；格子内只有角色，不要编号、圈号、文字、水印、复杂背景。第一行快乐档：平静、微笑、开心大笑、鬼畜狂笑（狂笑须夸张一眼可辨）。第二行悲伤档：委屈、悲伤含泪（泪水浸湿眼眶）、大哭、绝望。第三行怒厌档：微恼、愤怒、暴怒、嫌弃／无语。第四行认知防御档：疑惑、惊讶、恐惧／慌张、得意／坏笑。",
  "character-layout-h":
    "产出布局 H（女装九宫格）：同一角色身份与面孔保持一致（沿用参考图，勿另造角色），白底或浅灰底，严格 3×3 九格均分、格间留细白边，整张横版构图；每格全身站姿、平静表情，只换女装造型；格子内只有角色，不要编号、圈号、文字、水印、复杂背景。九套分别按下列经典角色的服装气质来画，主题只作方向、款式细节不限死，鼓励自由发挥。上排：不知火舞；蒂法；兔女郎。中排：魅魔；女骑士；沙漠舞娘。下排：女教官；女海盗；春丽。",
  "scene-panorama":
    "产出空间全景图：使用宽幅构图，清楚呈现整体布局、空间关系、建筑风格、尺度和氛围，保持透视结构可供后续分镜复用。",
  "scene-detail":
    "产出局部特写图：聚焦本卡关键陈设、材质、装饰和光影细节，保持与场景空间、建筑风格和色调一致。",
  "scene-lighting-variant":
    "产出光影变体卡：当前场景卡具有独立 ID，只表达文本结构指定的一种光影设定；清楚呈现光源、色温、明暗对比和时间氛围。",
  "prop-multi-angle":
    "产出多角度图：同一道具包含正面、侧面和局部特写，清楚呈现尺寸、材质、颜色、形状、特殊标记与默认状态。",
  "prop-state-variant":
    "产出状态变体卡：当前道具卡具有独立 ID，只表达文本结构指定的一种道具状态；清楚呈现该状态的形态、材质、特殊标记和可辨识细节。",
};

const BAN_IMAGE_TEXT =
  "画面约束（禁止出字）：图像中不得出现任何文字、字母、数字、字幕、水印、招牌字、标签、气泡或其它可读字符；保持纯视觉画面。";

const LOCK_FOR_ASSET_KIND: Record<AssetKind, ReferenceLockKind> = {
  character: "face",
  scene: "scene",
  prop: "prop",
};

export function normalizeReferenceLock(
  kind: AssetKind,
  value: unknown,
): ReferenceLockKind | null {
  if (value === null || value === undefined || value === "") return null;
  const expected = LOCK_FOR_ASSET_KIND[kind];
  if (value === expected || value === "on" || value === true) return expected;
  if (value === "face" || value === "scene" || value === "prop") {
    if (value !== expected) {
      throw new ValidationError(
        `当前${kind === "character" ? "角色" : kind === "scene" ? "场景" : "道具"}卡只能选择${expected === "face" ? "锁脸" : expected === "scene" ? "锁景" : "锁物"}`,
      );
    }
    return value;
  }
  throw new ValidationError("图片参考锁定选项无效");
}

export function normalizeBanImageText(value: unknown): ImageTextBanKind | null {
  if (value === null || value === undefined || value === "") return null;
  if (value === "ban" || value === "on" || value === true) return "ban";
  throw new ValidationError("画面禁字选项无效");
}

/** 选中锁定时显式写明：基于我上传的输入参考图（共 N 张）为锚点。组装结果即发给模型的文本，不含产品接线说明。 */
export function buildReferenceLockBlock(
  lock: ReferenceLockKind,
  inputReferenceImages: readonly string[] | undefined,
): string {
  const count = Array.isArray(inputReferenceImages)
    ? inputReferenceImages.map((item) => item.trim()).filter(Boolean).length
    : 0;
  const anchorCount =
    count > 0
      ? `基于我上传的输入参考图（共 ${count} 张）`
      : "基于我上传的输入参考图（共 0 张；当前卡尚无输入参考图，生成前请先上传）";
  if (lock === "face") {
    return `图片参考锁定（锁脸）：${anchorCount}为唯一面部身份锚点，img2img 图生图。严格保持参考图中人物的同一张脸：脸型、额头、颧骨、下颌、眉形、眼型、鼻型、唇形、发际线与发型轮廓一致。`;
  }
  if (lock === "scene") {
    return `图片参考锁定（锁景）：${anchorCount}为唯一场景锚点，img2img 图生图。严格保持参考图中的空间结构、建筑风格、尺度关系、关键陈设相对位置与色调一致。`;
  }
  return `图片参考锁定（锁物）：${anchorCount}为唯一道具锚点，img2img 图生图。严格保持参考图中道具的外形轮廓、比例、材质、颜色与特殊标记一致。`;
}

export function assembleAssetOutputPrompt(
  asset: AssetOutputPromptSource,
): string {
  const lock = normalizeReferenceLock(asset.kind, asset.reference_lock);
  const banText = normalizeBanImageText(asset.ban_image_text);
  return [
    lock ? buildReferenceLockBlock(lock, asset.input_reference_images ?? undefined) : "",
    banText ? BAN_IMAGE_TEXT : "",
    compileAssetTextBlock(asset),
    OUTPUT_INSTRUCTIONS[asset.output_type],
  ]
    .filter((part) => part.trim().length > 0)
    .join("\n");
}
