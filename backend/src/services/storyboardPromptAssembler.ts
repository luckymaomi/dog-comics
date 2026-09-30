import type { AssetKind, ProjectAssetRow, PanelRow } from "../types/domain";

export interface PanelRecipe {
  panelRecipe: {
    prompt: string;
    references: string[];
  };
}

export interface StoryboardRecipeInput {
  shot: PanelRow;
  assets: ProjectAssetRow[];
  /** 所引用分镜的当前底板 URL；仅当 shot.reference_panel_id 有值时使用。 */
  referencePanelImageUrl?: string | null;
}

const PROFILE_FIELDS: Record<
  AssetKind,
  ReadonlyArray<readonly [string, string]>
> = {
  character: [["brief", "视觉描述"]],
  scene: [["brief", "视觉描述"]],
  prop: [["brief", "视觉描述"]],
};

/** 分镜组装：本镜画面 + 可选引用镜头锁点 + 按出场资产 kind 的锁点段 + 干净画面约束；参考图挂出场资产标准图、可选引用镜头底板与其他参考图。不注入总览画风锁、资产档案或资产出图提示词。 */
export function assemblePanelRecipe({
  shot,
  assets,
  referencePanelImageUrl,
}: StoryboardRecipeInput): PanelRecipe {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const selectedAssets = shot.project_asset_ids
    .map((id) => assetById.get(id))
    .filter((asset): asset is ProjectAssetRow => Boolean(asset));
  const referencedUrl = shot.reference_panel_id
    ? clean(referencePanelImageUrl)
    : "";
  const references = unique([
    ...selectedAssets.map((asset) => asset.image_url),
    referencedUrl || null,
    ...shot.extra_reference_images,
  ]);
  const beat =
    clean(shot.action) ||
    clean(shot.description) ||
    clean(shot.image_prompt) ||
    clean(shot.title);
  const referenceLock = shot.reference_panel_id
    ? buildReferencePanelLockBlock(Boolean(referencedUrl))
    : "";
  const lockBlocks = selectedAssets.map(buildPanelAssetLockBlock);
  const imagePrompt = joinBlocks([
    beat,
    referenceLock,
    ...lockBlocks,
    "干净画面；无字幕、无气泡、无水印",
  ]);
  return { panelRecipe: { prompt: imagePrompt, references: [...references] } };
}

export function buildReferencePanelLockBlock(hasImage: boolean): string {
  if (hasImage) {
    return "图片参考锁定（引用镜头）：基于所引用分镜的当前底板为构图与造型连续参考，img2img 图生图。保持角色身份、场景气质与画面衔接一致，在此基础上完成本镜变化。";
  }
  return "图片参考锁定（引用镜头）：已选择引用分镜，但该镜尚无底板；生成前请先产出被引用镜的底板，或清空引用。";
}

/** @deprecated 兼容旧名；请用 buildReferencePanelLockBlock */
export function buildPreviousPanelLockBlock(hasImage: boolean): string {
  return buildReferencePanelLockBlock(hasImage);
}

/** 按出场资产类型写入锁脸/锁景/锁物；锚点显式指向该卡当前标准图。组装结果即发给模型的文本，不含产品接线说明。 */
export function buildPanelAssetLockBlock(
  asset: Pick<ProjectAssetRow, "kind" | "name" | "image_url">,
): string {
  const label = assetLabel(asset.kind);
  const name = clean(asset.name) || "未命名";
  const hasStandard = Boolean(clean(asset.image_url));
  const anchor = hasStandard
    ? `基于出场${label}卡「${name}」的当前标准图为唯一`
    : `基于出场${label}卡「${name}」的当前标准图为唯一（当前卡尚无标准图，生成前请先产出标准图）`;
  if (asset.kind === "character") {
    return `图片参考锁定（锁脸）：${anchor}面部身份锚点，img2img 图生图。严格保持参考图中人物的同一张脸：脸型、额头、颧骨、下颌、眉形、眼型、鼻型、唇形、发际线与发型轮廓一致。`;
  }
  if (asset.kind === "scene") {
    return `图片参考锁定（锁景）：${anchor}场景锚点，img2img 图生图。严格保持参考图中的空间结构、建筑风格、尺度关系、关键陈设相对位置与色调一致。`;
  }
  return `图片参考锁定（锁物）：${anchor}道具锚点，img2img 图生图。严格保持参考图中道具的外形轮廓、比例、材质、颜色与特殊标记一致。`;
}

/** 资产台组装提示词用的卡面文本块；分镜组装不再注入此段。 */
export function compileAssetTextBlock(
  asset: Pick<ProjectAssetRow, "kind" | "name" | "text_profile">,
): string {
  const fields = PROFILE_FIELDS[asset.kind].flatMap(([key, label]) => {
    const raw = asset.text_profile[key];
    const value = clean(raw);
    return value ? [`${label}：${value}`] : [];
  });
  const prefix = `${assetLabel(asset.kind)}卡「${asset.name}」`;
  return fields.length ? `${prefix}：${fields.join("；")}` : prefix;
}

function joinBlocks(values: Array<string | null | undefined>): string {
  return values.map(clean).filter(Boolean).join("\n");
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function assetLabel(kind: AssetKind): string {
  return { character: "角色", scene: "场景", prop: "道具" }[kind];
}
