---
name: media-archive
description: 修改 狗狗漫画 的图片本地归档、generation 历史、版本选择、上传参考图时使用；生图成功后的 remote→本地指针切换以本 Skill 为准，不负责 Provider HTTP 协议细节。
---

# Media Archive

业务 owner：`ImageGenerationService` + `MediaArchiveService`。适配器只返回可下载 URL（或等价媒体结果），**不得**在适配器内落盘或改业务指针。

## 生图完成标准（Agnes / PearAPI 共用）

1. 供应商适配器返回图片 URL 后，`acceptRemote`：generation `status=remote`，`image_url`/`source_url` 指向远程；资产或分镜当前指针先挂远程（远程就是远程，无魔法）。
2. 同任务内立即尝试一次本地归档；失败**不**抹远程预览，只记 `failure_stage=archive` 与 `archive_attempts`。
3. `startArchiveRetryLoop` 有界重试：单次下载超时约 45s、最多 5 次；成功后 `status=completed`，指针切到 `/static/...`。`available` **仅**表示本地文件真实存在。
4. 本地上传 / `importLocal` 直接 `completed`，不走 `remote`。
5. 每次生成创建独立历史；选用只改指针。选用允许 `remote`（有 `image_url`）或已归档 `completed`。
6. 服务重启：回收仍停在 `pending/processing` 的 `image_generations`（与已终态 `async_tasks` 对齐），避免「已有进行中任务」死锁。`remote` 记录继续由归档循环处理，**不**因重启标失败。
7. 不存在「待复核」状态机或 `confirm-review`；无正式生产数据约束时禁止为旧列/旧 API 保留兼容壳。

## 参考图

- 参考图数组属于单个资产卡或分镜；创建、恢复、复制和更新都复制数组，异步上传不得写入后来选中的目标。
- 本地参考图仅在 Provider 调用边界转换为带 MIME 的 Data URL，不把 localhost 路径交给供应商。

## 验证

- 真实文件签名与磁盘存在性证明归档；下载失败用例证明 remote 预览保留与重试后切本地。
- Mock/HTTP 200/仅 task id **不等于**业务完成；真实出片与本地归档分列报告。
