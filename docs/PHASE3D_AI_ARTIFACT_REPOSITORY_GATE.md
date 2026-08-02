# Phase 3.3D：AI 内容仓库 V2 门禁

日期：2026-08-02
状态：本机仓库、账号可见性、旧数据导入、删除、导出与 Backup V3 已实施；云端同步未实施

## 这一阶段解决什么

此前 Managed AI 能在发送前阻止错账号，但“每日建议”和“学习分析”仍分别保存在两个设备级 Store 中。
这会丢失服务端 artifact 来源，也会让同一浏览器中的另一个账号看到不属于自己的历史。

现在两类内容都进入 `AIArtifactRepositoryV2`，每条记录统一保留：

- 业务类型、结构化 V2 内容与安全 Markdown 投影；
- 生成时间、数据截至时间、数据范围与数据质量；
- Managed/Custom/Legacy 来源，以及 provider artifact id、run id、snapshot id 和 context hash；
- 本机或已确认 Lexi 账号的可见性归属；
- 手动保留策略，不在后台自动删除。

## 按应用场景说明内容保存在哪里

| 场景 | 当前保存位置 | 是否自动保存 | 是否上传 Supabase |
| --- | --- | --- | --- |
| 每日建议 | 当前浏览器的 `ielts-tracker:aiArtifactsV2` | 生成成功后保存 | 否 |
| 学习分析 | 同一本机仓库 | 预览后点击“保存报告”才保存 | 否 |
| 旧建议与旧分析 | 单向导入统一仓库，原 storage key 保留 | 首次启动导入一次 | 否 |
| 单份内容导出 | 用户选择的下载位置，Markdown 或 JSON | 明确点击导出 | 否 |
| 整体 JSON 备份 | Backup V3 的 `aiArtifacts` 字段 | 明确点击导出 | 否 |
| Managed Gateway 元数据 | Lexi 后端 run/artifact 控制面 | 请求执行时 | 是，但不含学习快照或生成正文 |

Backup V3 不导出 Supabase Session、AI key、Managed binding 或可作为授权依据的 account id。
导入后 artifact 回到本机归属，并清除 Managed binding，用户须在当前账号下重新确认。

## 可见性与错账号保护

- 未配置账号服务或明确退出时，项目仍是 local-first，但只显示仍归属于本机的内容；已经归属
  某个 Lexi 账号的内容会隐藏，重新登录原账号后恢复。
- 首次在已登录账号下确认本机数据归属时，本机 artifact 会被标记为该账号所有。
- 当前账号与 binding 不匹配、binding 损坏、认证服务不可用或尚在恢复会话时，内容列表与 AI
  快照均失败关闭：不暴露正文，不允许新增或删除。
- 页面只通过显式 access scope 读写仓库，不再直接读取全局报告数组。

## 旧数据和备份策略

1. 启动时读取旧 `aiSuggestion` 和 `reports` Zustand envelope。
2. 结构化内容按 V2 对象导入；旧 Markdown 逐字保留为 `legacy_text`。
3. 确定性 record id 防止重复启动产生重复项。
4. 只有新仓库写入成功才记录 migration receipt；失败时保留旧 key 并等待下次重试。
5. 新版导出只写 Backup V3 `aiArtifacts`；导入继续接受 V1、V2 和 V3。
6. 导入先全量校验，失败时回滚；只有成功才清除账号 binding。

## 用户体验规则

- “统计”页增加紧凑的 AI 内容库，提供类型筛选、分页、详情、单份 Markdown 导出与当前列表 JSON 导出。
- 删除前必须二次确认；删除后不会改动学习记录。
- 写入失败会回滚内存状态并明确提示“已生成但未保存”，不显示假的“已保存”。
- 设置页只显示数量、备份提示和管理入口，不堆叠大段解释。

## 后端与管理端边界

本阶段没有建立 Supabase `ai_artifacts` 表，也没有让 `/admin` 读取用户生成正文。现有 Gateway
只保留运行、限额、安全和 artifact 元数据，不保存学习快照、日记片段、用户输入或生成正文。
因此 Formal Lexi 的 learner frontend、Supabase schema/RPC/RLS 与 `/admin` 均审查为
`reviewed-not-needed`。

未来若要跨设备同步 AI 内容，必须作为新的全栈发布单元实施：表结构、`user_id` 所有权、
RLS/RPC/grants、双向同步与冲突规则、删除/保留策略，以及管理端可见性与隐私审计都需要同时完成。

## 验收清单

- [x] Managed artifact 完整 provenance 不再被前端丢弃。
- [x] 账号 A/B 可见性与 auth 恢复期失败关闭。
- [x] 旧纯文本和结构化内容单向无损导入。
- [x] 一次性导入不重复，原始 key 不删除。
- [x] 删除确认、详情、筛选、分页和单份/列表导出。
- [x] 写入失败回滚，不显示假成功。
- [x] 损坏仓库停止读取、写入与不完整备份，保留原始字节等待恢复。
- [x] Backup V1/V2 兼容导入和 Backup V3 往返。
- [ ] 真实 staging JWT/provider 与跨账号远程验收。
- [ ] 云端 artifact 同步、RLS 与 admin 可见性决策。

## 后续阶段

该建议已在 `PHASE3E_PLAN_DRAFT_COMMAND_GATE.md` 实施：计划助手改用严格 PlanDraftV2、逐条确认、
同 envelope 回执和确定性计划 ID。下一步先收敛计划 execution 唯一性与多标签页写入，再进入
WritingFeedbackV2。
