# PearAPI 生图专栏 · Doubao（豆包 Seedream）

对应官方：`生图生视频API/PearAPI/图片/Doubao（豆包 Seedream）.txt`  
公共传输、请求字段、本仓 async/url 策略见 `00-general-contract.md`。

## 定位

字节跳动即梦（Jimeng）系列文生图 / 图生图。旧别名 `jimeng-4.0` / `4.5` / `5.0` 仍兼容，官方会归一化为 `doubao-seedream-*`。

## 模型 id 来源

- **权威 id**：PearAPI `GET /v1/models` 返回的正式 `model` 字符串。
- **公开价目**：同 id 合并 `pricing`；价目另含 `doubao-seedream-5-0-pro-260628`（同族补洞）。
- **静态专栏**：下列清单为官方专栏已写明的能力；目录若返回同族新日期后缀，按同族能力补洞。

## 本专栏能力

| model_id | 画幅（aspect_ratio） | 参考图上限 |
| :--- | :--- | ---: |
| `doubao-seedream-5-0-260128` | 1:1，4:3，3:4，16:9，9:16，3:2，2:3，21:9 | ≤ 10 |
| `doubao-seedream-5-0-pro-260628`（价目/目录正式 id） | 同上（8 种） | ≤ 10 |
| `doubao-seedream-4-5-251128` | 同上（8 种） | ≤ 10 |
| `doubao-seedream-4-0-250828` | 同上（8 种） | ≤ 10 |
| `SeedVR2-Upscaler`（价目 id 常为小写 `seedvr2-upscaler`） | —（未知，保持 `null`） | ≤ 1 |

模式：Seedream 族文生图与图生图均支持（目录补洞登记 `text2image` + `image2image`）。  
Upscaler 仅按「编辑/图生图」理解，参考图上限 1；画幅未知不猜。

本仓实测优选：**`doubao-seedream-5-0-260128`**（专栏最新 5.0；价目约 ¥0.099/次）。

## 接口（本专栏）

| 操作 | 方法路径 | 说明 |
| :--- | :--- | :--- |
| 生成 | `POST /v1/images/generations` | `model` 换成本表任一 id |
| 编辑 | `POST /v1/images/edits` | 字段与生成一致，**必须**至少传 `image` 或 `images` |
| 查任务 | `GET /v1/images/tasks/{id}` | 本仓固定 `task_type=async` 时轮询 |

图生图示例字段：`model` + `prompt` + `image`（或 `images`）+ `aspect_ratio`。  
本专栏支持 `negative_prompt`（官方注明 Seedream 部分可用）；本仓未强制注入负向词。

## 本仓适配器状态

- 落点：`backend/src/providers/adapters/pearApi.ts` → `isDoubaoSeedreamFamilyId` / `isSeedVr2UpscalerId` / `knownModelMetadata`
- Seedream 匹配：`doubao-seedream-*`，以及兼容旧别名 `jimeng-4.0` / `jimeng-4.5` / `jimeng-5.0`
- Upscaler 匹配：`SeedVR2-Upscaler`（大小写不敏感）
- `source`：一律 `adapter-override`
- 测试：`backend/test/dynamicModels.test.ts` 覆盖 Seedream 5.0/4.5/4.0 与 Upscaler

## 维护注意

- 不要把 Seedream 的 10 张 / 8 画幅套到 `SeedVR2-Upscaler`。
- 不要用 GPT / Nano Banana / Grok 专栏的参考图上限或画幅表推导豆包。
- 日期后缀（如 `-260128`）与 `5-0-pro` 属于目录正式 id，按同主版本族能力补洞。
