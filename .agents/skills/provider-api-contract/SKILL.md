---
name: provider-api-contract
description: "维护并验证 potato 的 PearAPI/Agnes 生图 Provider API 协议、模型能力目录与适配器映射；修改 GPT Image、Nano Banana、Grok、Agnes 生图请求或能力补洞时使用。"
---

# Provider API 协议合同（生图）

把外部 **PearAPI / Agnes 生图** 协议转成可审查、可测试的仓库合同。覆盖路径、鉴权、异步/同步结果、请求字段、模型能力、`adapter-override` 与真实验收边界。不负责前端视觉、通用业务编排或本地归档指针（归档见 [media-archive](../media-archive/SKILL.md)）。

本 Skill 的 `references/` **只含生图**。生视频不在此目录维护。

## 工作规则

1. 先读公共或供应商入口，再按模型族读专栏：
   - PearAPI 公共传输与本仓策略 → `references/00-general-contract.md`
   - GPT Image → `references/10-image-GPT Image.md`
   - Nano Banana（Gemini Image） → `references/10-image-Nano Banana（Gemini Image）.md`
   - Grok（xAI）生图 → `references/10-image-Grok（xAI）.md`
   - Agnes 生图 → `references/20-agnes-image.md`（官方 wiki：`agnes-image-2.5/2.1/2.0-flash`）
2. 外部桌面源文件删除后不作为运行时依赖；以本目录合同为准。Agnes 以 wiki.agnes-ai.com / agnes-ai.com 已拉取页面为证据；PearAPI 以本目录 `10-image-*.md` 为准。标准化文档不能替代仍可取得的源证据。
3. 能力三层：供应商目录原始字段 → 适配器已核验补洞（`source: adapter-override`）→ 业务通用校验。未知保持 `null`/`unknown`，禁止从示例或其它专栏猜测。目录正式 id 以供应商返回为准；静态专栏滞后时按同族能力补洞，不得把目录 id 当成脏数据丢掉。
4. 业务层只消费 `ProviderModelCapabilities`，不得按 provider 名或 model id 分支。协议差异只在适配器内处理。Agnes 与 PearAPI **不得**互相推导。
5. PearAPI 生图：`POST /v1/images/generations`（及官方 `edits`）、异步 `GET /v1/images/tasks/{id}`，Bearer 鉴权。本仓固定 `response_format=url` 与 `task_type=async`（见通用合同）。
6. 适配器成功止于可下载 URL；`remote` → 本地归档 → `/static` 指针由 media-archive / `ImageGenerationService` 负责。HTTP 200、Mock task id、测试绿灯不能证明真实出片与本地归档完成。
7. 每次能力变更至少增加目录能力测试；涉及拒绝规则时覆盖非法参考图数或画幅。

## 参考文档路由

| 需求 | 读 |
| :--- | :--- |
| PearAPI 公共路径 / 字段 / 本仓策略 | `references/00-general-contract.md` |
| GPT Image 模型表与补洞状态 | `references/10-image-GPT Image.md` |
| Nano Banana 模型表与补洞状态 | `references/10-image-Nano Banana（Gemini Image）.md` |
| Grok 生图模型表与缺口 | `references/10-image-Grok（xAI）.md` |
| Agnes 生图（2.5/2.1/2.0） | `references/20-agnes-image.md`（证据：wiki.agnes-ai.com） |

## 变更与验收

- 先建立缺口或失败测试，再改对应适配器与合同；需要时同步 `history.md` / `spec.md`。
- 能力目录变更覆盖：model id、modes、`maxReferenceImages`、`aspectRatios`、`source`。
- 跑后端 `npm.cmd test`、`npm.cmd run typecheck`、`npm.cmd run build`；必要时前端测试/build；`git diff --check`。
- 真实供应商调用需 owner 授权与脱敏证据；未授权停在确定性测试。归档验收按 media-archive。
