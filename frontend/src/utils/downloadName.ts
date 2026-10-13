/** 浏览器 download 文件名主体：去掉路径非法字符，避免落成服务器生成号。 */
export function downloadFileBase(name: string | undefined | null, fallback = 'asset'): string {
  const raw = String(name ?? '').trim() || fallback
  const cleaned = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_')
    .replace(/\s+/gu, ' ')
    .replace(/\.+$/gu, '')
    .trim()
    .slice(0, 80)
  return cleaned || fallback
}

export function assetOriginalDownloadName(name: string | undefined | null): string {
  return `${downloadFileBase(name)}-原图`
}

/** 与原图文件名配对的提示词侧车：`角色卡-xxx-原图.prompt.txt` */
export function promptSidecarDownloadName(downloadBase: string): string {
  const base = downloadFileBase(downloadBase, 'media')
  return `${base}.prompt.txt`
}
