import { CopyOutlined, DownloadOutlined } from '@ant-design/icons'
import { App, Button } from 'antd'
import type { ReactNode } from 'react'
import { downloadMediaWithPrompt } from '../utils/downloadMediaWithPrompt'

/** Ant Design Image.preview 配置：大图旁展示本次生成提示词，可复制 / 连带下载。 */
export function imagePreviewWithPrompt(input: {
  prompt?: string | null
  mediaUrl?: string | null
  downloadBase?: string
  emptyHint?: string
}): {
  imageRender: (originalNode: ReactNode) => ReactNode
  toolbarRender: (originalNode: ReactNode) => ReactNode
} {
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  const emptyHint = input.emptyHint ?? '本次生成没有保存提示词'
  return {
    imageRender: (originalNode) => (
      <div className="image-preview-with-prompt">
        <div className="image-preview-with-prompt-media">{originalNode}</div>
        <aside className="image-preview-with-prompt-side" aria-label="生成提示词">
          <div className="image-preview-with-prompt-side-head">
            <strong>生成提示词</strong>
            {prompt ? <PreviewCopyButton text={prompt} /> : null}
          </div>
          <pre className="image-preview-with-prompt-text">{prompt || emptyHint}</pre>
        </aside>
      </div>
    ),
    toolbarRender: (originalNode) => (
      <>
        {originalNode}
        {input.mediaUrl && input.downloadBase ? (
          <Button
            type="text"
            icon={<DownloadOutlined />}
            onClick={() =>
              downloadMediaWithPrompt({
                mediaUrl: input.mediaUrl!,
                downloadBase: input.downloadBase!,
                prompt,
              })
            }
            aria-label="下载原图"
            title="下载原图（含提示词）"
          />
        ) : null}
      </>
    ),
  }
}

function PreviewCopyButton({ text }: { text: string }) {
  const { message } = App.useApp()
  return (
    <Button
      type="text"
      size="small"
      icon={<CopyOutlined />}
      onClick={async (event) => {
        event.stopPropagation()
        try {
          await navigator.clipboard.writeText(text)
          message.success('已复制生成提示词')
        } catch {
          message.error('复制失败')
        }
      }}
    >
      复制
    </Button>
  )
}
