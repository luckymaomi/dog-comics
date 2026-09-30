import {
  extensionFromPathOrMime,
  sanitizeArchiveBaseName,
  uniqueArchiveFileName,
} from "./assetArchiveFormat";

/** ZIP 内分镜底板文件夹名。 */
export const PANEL_FOLDER = "分镜";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export { extensionFromPathOrMime, sanitizeArchiveBaseName, uniqueArchiveFileName };

/** `01-虚空法会` → 序号与标题；无序号时整段作标题。 */
export function parsePanelArchiveBaseName(base: string): {
  panelNumber: number | null;
  title: string;
} {
  const trimmed = base.trim();
  const match = /^(\d{1,4})(?:\s*[-_.]\s*|\s+)(.+)$/u.exec(trimmed);
  if (match) {
    const panelNumber = Number(match[1]);
    const title = (match[2] ?? "").trim();
    if (Number.isInteger(panelNumber) && panelNumber > 0 && title) {
      return { panelNumber, title };
    }
  }
  return { panelNumber: null, title: trimmed || "未命名" };
}

/** 导出文件名主体：`01-虚空法会`。 */
export function panelArchiveBaseName(
  panelNumber: number,
  title: string | null | undefined,
): string {
  const padded = String(panelNumber).padStart(2, "0");
  const label = sanitizeArchiveBaseName(title, `镜${panelNumber}`);
  return `${padded}-${label}`;
}

/** 解析 ZIP 内相对路径：`分镜/01-虚空法会.png`。忽略子目录与垃圾文件。 */
export function parsePanelArchiveImageEntry(
  entryPath: string,
): { panelNumber: number | null; title: string; ext: string } | null {
  const normalized = entryPath.replace(/\\/gu, "/").replace(/^\/+/u, "");
  if (!normalized || normalized.endsWith("/")) return null;
  if (normalized.startsWith("__MACOSX/") || normalized.includes("/.")) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  if (parts[0] !== PANEL_FOLDER) return null;
  const fileName = parts[1] ?? "";
  const extMatch = /\.([a-z0-9]+)$/iu.exec(fileName);
  if (!extMatch) return null;
  const ext = `.${extMatch[1].toLowerCase()}`;
  if (!IMAGE_EXT.has(ext)) return null;
  const base = fileName.slice(0, -ext.length).trim();
  if (!base || base.startsWith(".")) return null;
  const parsed = parsePanelArchiveBaseName(base);
  return { ...parsed, ext };
}

export function panelArchiveZipFileName(
  projectTitle: string,
  projectId: number,
  episodeNumber: number,
): string {
  const base = sanitizeArchiveBaseName(projectTitle, `project-${projectId}`);
  return `${base}-第${episodeNumber}话-分镜存档.zip`;
}
