import { DownloadOutlined, SoundOutlined } from '@ant-design/icons'
import { App, Button, Form, Input, Select, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { freedubApi, type FreedubOption } from '../../api/freedub'
import { notifyAppError, notifyAppSuccess } from '../../errors/appError'

type FormValues = {
  text: string
  role?: string
  style?: string
}

export function DubbingWorkspace() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [voices, setVoices] = useState<FreedubOption[]>([])
  const [styles, setStyles] = useState<FreedubOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        setLoadingOptions(true)
        const options = await freedubApi.options()
        if (!alive) return
        setVoices(options.voices)
        setStyles(options.styles)
        form.setFieldsValue({
          role:
            options.voices.find((v) => v.id === 'zh-CN-XiaochenNeural')?.id
            ?? options.voices.find((v) => v.label.includes('晓辰'))?.id
            ?? options.voices[0]?.id,
          style:
            options.styles.find((s) => s.id === 'assistant')?.id
            ?? options.styles.find((s) => s.label.includes('智能助手'))?.id
            ?? options.styles[0]?.id,
        })
      } catch (reason) {
        if (alive) notifyAppError({ message, modal }, reason)
      } finally {
        if (alive) setLoadingOptions(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [form, message, modal])

  const generate = async () => {
    try {
      const values = await form.validateFields()
      setGenerating(true)
      const result = await freedubApi.synthesize({
        text: values.text,
        role: values.role,
        style: values.style,
      })
      setAudioUrl(result.audio_url)
      notifyAppSuccess(message, '配音已生成，可试听或下载')
    } catch (reason) {
      if (reason && typeof reason === 'object' && 'errorFields' in reason) return
      notifyAppError({ message, modal }, reason)
    } finally {
      setGenerating(false)
    }
  }

  const download = () => {
    if (!audioUrl) return
    const anchor = document.createElement('a')
    anchor.href = audioUrl
    anchor.download = `配音-${Date.now()}.mp3`
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  return (
    <div className="dubbing-workspace">
      <div className="dubbing-heading">
        <Typography.Title level={2}>配音</Typography.Title>
        <Typography.Text type="secondary">
          贴文案 → 选音色风格 → 生成试听下载。不保存到项目。
        </Typography.Text>
      </div>

      <Form
        className="dubbing-panel"
        form={form}
        layout="vertical"
        requiredMark={false}
        disabled={loadingOptions}
      >
        <Form.Item
          className="dubbing-text-item"
          name="text"
          label="文案"
          rules={[{ required: true, message: '请输入要配音的文案' }]}
        >
          <Input.TextArea
            className="dubbing-textarea"
            autoSize={false}
            placeholder="粘贴旁白、对白或任意要读出来的文字"
          />
        </Form.Item>

        <div className="dubbing-select-row">
          <Form.Item
            name="role"
            label="音色"
            rules={[{ required: true, message: '请选择音色' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={voices.map((v) => ({ value: v.id, label: v.label }))}
              placeholder="选择音色"
            />
          </Form.Item>
          <Form.Item
            name="style"
            label="风格"
            rules={[{ required: true, message: '请选择风格' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={styles.map((s) => ({ value: s.id, label: s.label }))}
              placeholder="选择风格"
            />
          </Form.Item>
        </div>

        <div className="dubbing-button-row">
          <Space wrap size={10}>
            <Button
              type="primary"
              icon={<SoundOutlined />}
              loading={generating}
              onClick={() => void generate()}
            >
              生成配音
            </Button>
            <Button
              icon={<DownloadOutlined />}
              disabled={!audioUrl}
              onClick={download}
            >
              下载音频
            </Button>
          </Space>
        </div>

        {audioUrl ? (
          <div className="dubbing-player-row">
            <audio controls src={audioUrl} preload="metadata">
              当前浏览器不支持音频播放
            </audio>
          </div>
        ) : null}
      </Form>
    </div>
  )
}
