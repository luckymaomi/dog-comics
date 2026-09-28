# Agnes 生图合同

实现 owner：`backend/src/providers/adapters/agnes.ts`。  
官方证据（已核验页面，2026-09-26 拉取）：

| 模型 | 官方文档 |
| :--- | :--- |
| `agnes-image-2.5-flash` | https://wiki.agnes-ai.com/en/docs/agnes-image-25-flash （中文：https://wiki.agnes-ai.com/zh-Hans/docs/agnes-image-25-flash） |
| `agnes-image-2.1-flash` | https://wiki.agnes-ai.com/en/docs/agnes-image-21-flash |
| `agnes-image-2.0-flash` | https://wiki.agnes-ai.com/en/docs/agnes-image-20-flash |
| 总览 / Base / 鉴权 | https://agnes-ai.com/en/docs/overview |

**不得**用 PearAPI 图片专栏推导 Agnes。2.5 官方写明：请求/响应参数、支持尺寸、计价与 2.1 **相同**，仅生成质量更强。

## 传输

| 项 | 合同 |
| :--- | :--- |
| Base URL | `https://apihub.agnes-ai.com/v1`（配置可覆盖） |
| 鉴权 | `Authorization: Bearer <api_key>` + `Content-Type: application/json` |
| 生图 | `POST /v1/images/generations` → 完整 URL `https://apihub.agnes-ai.com/v1/images/generations` |
| 目录 | `GET /v1/models`（动态；能力画幅由适配器按协议补洞，目录常不返回 ratio） |

客户端超时：官方建议 `60s–360s`；本仓生成请求不设本地等待上限（见 provider-integration）。

## 请求参数（2.1 / 2.5；2.0 同端点，尺寸写法偏精确像素）

| 参数 | 必填 | 说明 |
| :--- | :--- | :--- |
| `model` | 是 | 如 `agnes-image-2.5-flash` / `2.1-flash` / `2.0-flash` |
| `prompt` | 是 | 文生图或图生图指令 |
| `size` | 是 | **推荐档位** `1K` / `2K` / `3K` / `4K`；亦接受历史精确尺寸如 `1024x768`（不支持的会被标准化） |
| `ratio` | 否 | 与档位 `size` 联用；默认 `1:1`。支持：`1:1`、`3:4`、`4:3`、`16:9`、`9:16`、`2:3`、`3:2`、`21:9` |
| `return_base64` | 否 | **文生图**要 Base64 时用顶层 `true` |
| `extra_body` | 否 | 高级字段容器 |
| `extra_body.response_format` | 否 | `url` 或 `b64_json`。**禁止**放在请求体顶层（会 400） |
| `extra_body.image` | 图生图/多图必填 | `string[]`：公网 HTTPS URL 或 Data URI Base64；多张即多图合成 |

硬规则（官方 checklist / troubleshooting）：

- 文生图最少：`model` + `prompt` + `size`
- 可预期像素：档位 `size` + `ratio`（例：`size: "2K"` + `ratio: "16:9"` → `2624x1472`）
- 图生图/多图：**只**走 `extra_body.image`；**不要**传 `tags: ["img2img"]`
- 参考图 URL 须可匿名访问；否则用 Data URI
- 本仓固定：`extra_body.response_format = "url"`；有参考图时写入 `extra_body.image`（本地路径先经 `MediaReferenceService` 转 inline）

### 本仓 `size` / `ratio` 映射（适配器）

业务手选画幅走独立 `aspectRatio`；`size` 经 `mapAgnesImageSizeSpec`：

- 已是 `1K`–`4K` → 原样作 `size`，缺 ratio 时默认 `1:1`
- `WxH` 精确像素 → 按长边映射到 `1K`/`2K`/`3K`，比例就近落到上表 8 种
- 无法解析 → 默认 `2K` + `1:1`
- 例：`2560x1440` → `{ size: "2K", ratio: "16:9" }`（与官方「用 2K+16:9 替代显示分辨率」一致）

### 能力补洞（`source: adapter-override`）

| 项 | 值 | 依据 |
| :--- | :--- | :--- |
| modes | `text-to-image` + `image-to-image` | 官方核心能力 |
| aspectRatios | 上表 8 种 | 官方 `ratio` 列表；目录常缺字段 |
| maxReferenceImages | `8` | 适配器门闸（官方只写「第 4 张起计价」，未写硬上限；超限本仓拒绝） |

## 响应

同步一次返回（无 PearAPI 式 `task_type=async` 轮询）：

```json
{
  "created": 1780000000,
  "data": [
    {
      "url": "https://storage.googleapis.com/agnes-aigc/xxx.png",
      "b64_json": null,
      "revised_prompt": null
    }
  ]
}
```

- URL 输出读 `data[0].url`
- Base64 输出读 `data[0].b64_json`（本仓可拼 `data:image/png;base64,...`）
- 两者皆缺 → 适配器明确拒绝，不假装成功

## 与业务归档的边界

适配器**只**负责：协议请求 → 可下载 `imageUrl`。之后：

1. `ImageGenerationService.acceptRemote`（`status=remote`，指针先挂远程）
2. `MediaArchiveService` 有界下载落盘
3. 成功后指针 `/static/...`，`status=completed`

见 [media-archive](../../media-archive/SKILL.md)。HTTP 200 / 仅有远程 URL **≠** 本地归档完成。

## 变更纪律

- 官方 wiki 变更 → 先改本文件 → 再改 `agnes.ts` 与 `backend/test/agnesProvider.test.ts`
- 禁止从 PearAPI 专栏抄字段名或异步合同
- 真实出片与归档需 owner 授权；未授权停在确定性测
