import type { AssetKind } from "../types/domain";

/** ZIP 内三类文件夹名（导出用产品文案）。 */
export const KIND_FOLDER: Record<AssetKind, string> = {
  character: "角色卡",
  scene: "场景卡",
  prop: "道具卡",
};

/** 导入时文件夹名 → kind；「物品卡」兼容「道具卡」。 */
export const FOLDER_KIND: Record<string, AssetKind> = {
  角色卡: "character",
  场景卡: "scene",
  道具卡: "prop",
  物品卡: "prop",
};

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

/** 卡名 → ZIP 内安全文件名主体。 */
export function sanitizeArchiveBaseName(
  name: string | undefined | null,
  fallback = "asset",
): string {
  const raw = String(name ?? "").trim() || fallback;
  const cleaned = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_")
    .replace(/\s+/gu, " ")
    .replace(/\.+$/gu, "")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

export function uniqueArchiveFileName(
  base: string,
  ext: string,
  used: Set<string>,
): string {
  const normalizedExt = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  let candidate = `${base}${normalizedExt}`;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}_${index}${normalizedExt}`;
    index += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function extensionFromPathOrMime(
  filePath: string,
  mime?: string | null,
): string {
  const fromPath = pathExt(filePath);
  if (fromPath && IMAGE_EXT.has(fromPath)) return fromPath;
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/webp") return ".webp";
  return fromPath && IMAGE_EXT.has(fromPath) ? fromPath : ".png";
}

function pathExt(filePath: string): string {
  const match = /\.[a-z0-9]+$/iu.exec(filePath.replace(/\\/gu, "/").split("/").pop() ?? "");
  return match ? match[0].toLowerCase() : "";
}

/** 解析 ZIP 内相对路径：`角色卡/奶龙.png` → kind + 卡名。忽略子目录与垃圾文件。 */
export function parseArchiveImageEntry(
  entryPath: string,
): { kind: AssetKind; name: string; ext: string } | null {
  const normalized = entryPath.replace(/\\/gu, "/").replace(/^\/+/u, "");
  if (!normalized || normalized.endsWith("/")) return null;
  if (normalized.startsWith("__MACOSX/") || normalized.includes("/.")) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const folder = parts[0] ?? "";
  const fileName = parts[1] ?? "";
  const kind = FOLDER_KIND[folder];
  if (!kind) return null;
  const extMatch = /\.([a-z0-9]+)$/iu.exec(fileName);
  if (!extMatch) return null;
  const ext = `.${extMatch[1].toLowerCase()}`;
  if (!IMAGE_EXT.has(ext)) return null;
  const base = fileName.slice(0, -ext.length).trim();
  if (!base || base.startsWith(".")) return null;
  return { kind, name: base, ext };
}

export function archiveZipFileName(projectTitle: string, projectId: number): string {
  const base = sanitizeArchiveBaseName(projectTitle, `project-${projectId}`);
  return `${base}-资产图存档.zip`;
}
