import { promptSidecarDownloadName } from './downloadName'

/** 触发浏览器下载一个文本文件。 */
export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text.endsWith('\n') ? text : `${text}\n`], {
    type: 'text/plain;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    anchor.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 下载媒体原图；若有提示词则同名侧车 `.prompt.txt` 一并下载，便于追溯生成词。 */
export function downloadMediaWithPrompt(input: {
  mediaUrl: string
  downloadBase: string
  prompt?: string | null
}): void {
  const base = input.downloadBase.trim() || 'media'
  const image = document.createElement('a')
  image.href = input.mediaUrl
  image.download = base
  image.rel = 'noopener'
  image.click()

  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  if (!prompt) return
  window.setTimeout(() => {
    downloadTextFile(promptSidecarDownloadName(base), prompt)
  }, 120)
}
