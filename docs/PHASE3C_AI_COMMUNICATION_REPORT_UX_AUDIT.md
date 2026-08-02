# Phase 3.3C：AI 通信与报告 UX 契约审计

日期：2026-08-01
状态：端到端审计、安全基线、DailySuggestionV2、LearningAnalysisV2、PlanDraftV2、WritingFeedbackV2 与 AI Artifact Repository V2 已完成；ChatEventV2 与远程验收尚未完成

## 为什么单独建立这一阶段

此前阶段已经建立 purpose-scoped 学习快照、Managed Gateway wire、run/artifact
来源校验和本机保存边界，但没有把“发送什么 → AI 返回什么 → 如何转换成业务对象 →
如何保存和展示”作为一条独立的用户体验与安全门禁。

Phase 3.3C 先建立这条链路的共同基线；后续 Phase 3.3D–3.3G 已依次完成统一内容仓库、
PlanDraftV2 和 WritingFeedbackV2。它们没有改变当前 local-first source of truth，也不会把
浏览器中的历史 AI 内容或写作正文自动上传到 staging。

## 当前通信链路

| 场景 | 浏览器发送 | AI 返回 | 整理与保存 | 展示 |
| --- | --- | --- | --- | --- |
| 今日建议 | request-time 学习快照；Managed 或 Custom | `DailySuggestionV2`；Custom SSE 也必须产出同一 JSON | 严格校验后自动覆盖最新本机建议，并保留文本投影 | 重点、行动、依据与局限 |
| 学习分析 | 7/30/90 天聚合快照；Managed 或 Custom | `LearningAnalysisV2`；Custom SSE 也必须产出同一 JSON | 预览后明确保存结构对象、文本投影与来源元数据 | 结论、发现、行动、局限与来源 |
| 计划助手 | request-time 学习快照与当前要求；Managed 或用户明确选择的 Custom | `PlanDraftV2` 严格 JSON | 生成草稿后逐条确认，以确定性计划 ID 和 command receipt 原子写入 | 计划草稿、确认状态与执行回执 |
| 写作批改 | `WritingSubmissionV2`：考试类型、Task、题目、文字材料与作文；Managed 或用户明确选择的 Custom | `WritingFeedbackV2` 严格 JSON | submission-bound 复验后预览；明确保存到统一 AI 内容仓库或完整导出 | 四项反馈、原文证据、行动、局限与报告详情 |

`assistant_chat` 当前只有 capability/type 定义，没有独立调用入口；非流式 `chatAI()`
当前也没有业务消费者。

## 1. 当前项目怎样给 AI 发送信息

### Managed 路径

浏览器只向 `lexi-ai-gateway` 发送版本化 JSON：

```json
{
  "schemaVersion": 1,
  "responseSchemaVersion": 2,
  "productId": "tracker",
  "requestId": "<uuid>",
  "idempotencyKey": "tracker-ai-<uuid>",
  "purpose": "daily_suggestion | learning_analysis | plan_draft | writing_feedback",
  "snapshot": "<purpose-scoped AiContextSnapshotV1>",
  "userInput": "<bounded request text>"
}
```

wire 不包含 provider key、endpoint、model、system prompt、原始 messages、浏览器 session
或客户端声明的 run 状态。服务端把固定 system 指令与“不可信 JSON 数据”分开，并使用
`store: false`、严格 JSON Schema、超时、响应大小和 token 上限调用 provider。

### Custom 路径

用户明确选择 Custom 后，建议、分析、计划与写作才会从浏览器直接调用其配置的服务：

```http
POST <custom-base-url>/chat/completions
Authorization: Bearer <device-local-key>
Content-Type: application/json
```

正文为 OpenAI-compatible `messages`、`stream: true`、temperature 与 max_tokens。四个结构化
入口即使走 Custom 也必须通过对应的 V2 解析器；Custom key、URL 和 model 留在设备
localStorage，不进入备份。Managed 失败不会静默回退到 Custom。

## 2. AI 怎样把信息发送回来

Managed 返回严格的 `ok/run/artifact/warnings` envelope。客户端要求 run、request、purpose、
snapshot、contextHash、dataAsOf 与 artifact 完全相符，artifact 同时声明
`outputSchemaVersion: 2`；`artifact.content` 必须按 purpose 匹配 `DailySuggestionV2`、
`LearningAnalysisV2`、`PlanDraftV2` 或 `WritingFeedbackV2`。写作还会按本次 submission 复验
task criterion、半分、证据原文和证据充分性。未知字段、purpose/kind 错配、越界字符串或数组、
畸形值均直接失败关闭。

Custom 返回 SSE `data:` event。现有解析器拼接 `choices[0].delta.content`，遇到 `[DONE]`
结束；建议、分析、计划与写作只接受纯 JSON 或单层 `json` 围栏，并复用各自 V2 运行时校验，
不再猜测标题、列表、计划 action 或写作分数。通用聊天流仍是独立的非结构化过渡入口。

## 3. 项目怎样整理、保存和展示 AI 信息

- 今日建议直接渲染 V2 的重点、行动、依据和局限；自动保存结构对象、可导出的 Markdown
  投影及 route/run/dataAsOf/range/warnings。旧设备文本只保留安全 Markdown 兜底，不再参与解析。
- 学习分析直接渲染 V2 的结论、发现证据、优先行动和局限；用户明确保存后，本机报告同时保存
  结构对象、Markdown 投影与 route/run/snapshot/context/dataAsOf/quality/warnings，历史报告会恢复
  这些 provenance 并显示来源、范围、数据质量和输出合同版本。
- 计划助手直接解析 `PlanDraftV2`；用户逐条确认后，计划和 `AiCommandReceipt` 在同一持久化
  envelope 中原子写入。旧 `[ACTION:*]` 只按历史文本处理，不再恢复成可执行命令。
- 写作以 `WritingSubmissionV2` 建立只含 `writing.submission` 的私有快照，并严格解析
  `WritingFeedbackV2`。用户明确保存后，submission、四项反馈、派生总体分、Markdown 投影与
  provenance 进入账号隔离的 AI 内容仓库；单份导出包含题目、文字材料、完整作文与反馈。
- AI Markdown 已统一收口到 `SafeAIContent`：原始 HTML 被丢弃，Markdown 图片永不加载，
  只有绝对 HTTP(S) 外链可以点击并在隔离的新窗口打开；列表型建议与历史摘要继续按纯文本展示。
- Managed 发送与 AI artifact 读写均经过显式账号归属门禁；新建议、分析和写作报告使用
  `AiArtifactRepositoryV2` 的本机/账号 owner。写作草稿也按本机或账号分区，账号切换会先中止
  旧请求并清空内存，再加载目标 scope，不能把账号 A 的作文写进账号 B。

## 第一批安全基线（已实现）

- 登录不会自动绑定、上传、下载、合并或覆盖 Tracker 本机记录。用户必须在 Lexi 账号面板
  明确确认后，Managed AI 才能读取并发送当前请求的 purpose-scoped 快照。
- 每次 Managed 请求先捕获一个 access token，再以 `auth.getUser(accessToken)` 向 Supabase
  服务端确认真实 user id；Function 调用显式复用同一个 token，避免验证后账号切换导致请求
  被错误归因。token 只进入 Authorization header，不进入 AI wire、备份或本机 binding。
- binding 只保存 `environment + project + user id + confirmedAt`。账号不匹配、binding 损坏、
  storage 不可用或备份刚导入时均在 Function 调用前失败关闭；Custom AI 与纯本机功能不经过
  这道 Managed 门禁。
- `SafeAIContent` 是 AI Markdown 的唯一富文本入口；聊天与旧文本历史继续使用它。V2 建议、
  分析、计划和写作直接渲染严格结构对象，不解释模型 HTML；恶意 URL、远程图片与原始 HTML
  仍由共享安全测试覆盖。
- 今日建议和学习分析遇到未登录、未绑定、错账号或绑定异常时，不再只显示“失败/重试”；
  用户可以从错误状态直接打开 Lexi 账号安全面板。损坏绑定会明确提示“导出 JSON 后重新导入”
  或“确认无需保留后清空数据”的真实恢复路径。
- 四个结构化入口已切换为 purpose-specific V2：Managed provider/Function 合同、Tracker
  Gateway 校验、Custom JSON 校验、本机备份导入校验和最终 UI 使用同一字段边界；远端实现仍
  需按发布门禁验收。写作额外将所有引用证据绑定到本次作文原文。

## 上线前阻断项

1. **已完成：Managed 发送与历史可见性使用同一归属门禁。** 账号 A 的内容不会在账号 B
   登录、错账号或退出登录后显示、导出或删除；认证恢复期间也会失败关闭。统一
   `AiArtifactRepositoryV2` 已提供账号作用域、导出、删除与手动保留策略。
2. **已完成：计划 action 改为结构化合同。** `PlanDraftV2`、`AiCommandDraft`、`Receipt` 与
   idempotency 已接入实际计划流程；旧 `[ACTION:*]` 不再是新请求的操作协议。
3. **已完成：写作输入补齐题目与 Task 1 材料边界。** Academic Task 1 首版只接收文字材料
   描述；缺少任务证据时只能返回 `insufficient_evidence`，不得显示伪精确分数。
4. **已完成：写作响应使用严格运行时 schema。** `WritingFeedbackV2` 校验 0–9 的 0.5 档、
   rubricVersion、task criterion、字段/数组边界、逐字原文证据与派生总体分，畸形内容不会渲染或保存。
5. **AI Markdown 远程资源风险已完成修复。** `SafeAIContent` 已禁用远程图片和原始 HTML、
   限制 URL 协议、隔离外链并覆盖恶意 Markdown 测试；后续新增 AI 富文本入口必须复用该组件。
6. **可选 Custom key 仍在浏览器。** 内置建议、分析、计划和写作都已有 Managed 路由；只有用户
   明确选择高级 Custom 才会直接调用其服务商，Managed 失败不会转发。Custom retention 由该
   服务商决定，key 不进入备份。
7. **远程验收仍未完成。** 必须在 staging 用真实 JWT/provider 验证四个 purpose、配额、RLS、
   账号 A/B、失败路径和“服务端不落学习快照、题目、作文或生成正文”，才能启用生产 Managed AI。

## 高优先级可靠性与体验项

- 建议、分析、计划和写作已建立 purpose-specific versioned schema；后续 `ChatEventV2` 仍需把
  通用聊天从自由文本流收敛为明确的消息/事件合同。
- 写作已补齐 timeout、AbortController、停止生成、请求序号、大小上限、稳定错误与取消后迟到
  响应保护；其他入口新增状态机时应复用相同原则。
- V2 报告展示“结论、证据、局限、行动”，并保留来源、数据截至时间、范围、质量、warnings、
  promptVersion/outputSchemaVersion/rubricVersion；旧报告保持只读，不猜测补全 provenance。
- 本机 AI artifact 已具备账号作用域、容量预算、手动保留、单份删除/导出与敏感备份提示；未来
  云同步必须单独设计 RLS、冲突、删除和管理员隐私边界。
- 校正快照时间语义与重复时长统计；按用途缩小 daily suggestion 数据范围。
- 写作已补齐 aria-live/aria-busy、停止按钮、动态视口移动端、未保存关闭确认、历史详情、删除
  确认和组件级测试；真实移动设备与弱网 provider 仍需在 staging smoke 中验收。

## 已记录、暂不阻塞的低频边界

以下项目不影响当前常规单标签使用，按本阶段“先解决明显用户体验问题”的优先级延后：

- 两个浏览器标签页在极短时间内分别用不同账号同时首次确认时，`localStorage` 的读后写不是
  原子事务；后续可用同源跨标签锁或账号级本机仓库彻底串行化。请求时 Gateway 仍会重新核验
  当前账号与现存 binding，但本阶段不为这个极端窗口增加浏览器兼容性门槛。
- 将真实 Supabase transport 工厂化后，增加 `getSession → getUser(token) → invoke` 的注入式
  header 回归测试；当前已由实现检查与 Gateway token 传递测试覆盖，后续在 staging 真实 JWT
  smoke 中再验证一次。
- 为仍接收 Markdown 的 Chat/legacy 入口继续保留“必须使用 SafeAIContent”防回退测试；V2
  Stats/Writing 已改为严格结构对象组件，并以结构化渲染与恶意文本转义测试守护。

## Phase 3.3C 实施顺序

1. **已完成：**建立本机数据与 Lexi 账号的 binding/switch gate；账号不匹配时禁止 Managed 发送。
2. **已完成：**新增共享 `SafeAIContent`，禁止远程图片与不安全 URL，并补恶意 Markdown 测试。
3. **已完成四个结构化入口：**定义并接入 `DailySuggestionV2`、`LearningAnalysisV2`、
   `PlanDraftV2` 与 `WritingFeedbackV2`；`ChatEventV2` 留待后续独立阶段。
4. **已完成：**Plan 接入 `AiCommandDraft + Receipt + idempotency`，删除新请求的文本 action 协议。
5. **已完成：**写作增加题目、Task 1 文字材料、rubric 版本、逐字证据与严格评分校验，并接入
   Managed/Custom 同合同路由。详见 `PHASE3G_WRITING_FEEDBACK_V2_GATE.md`。
6. **已完成：**建立 `AiArtifactRepositoryV2`，保留完整 provenance，并提供账号隔离、删除、导出和保留策略。详见 `PHASE3D_AI_ARTIFACT_REPOSITORY_GATE.md`。
7. **写作已完成，其他入口持续收敛：**统一取消、超时、大小、错误、重试和无障碍状态机。
8. **待完成：**在 staging 运行账号 A/B、远程图片、错误 JSON、未知 action、重复确认、SSE 分片、超长、
   timeout、失败不落库与备份往返测试。

## 当前验收状态

- [x] 已盘点全部实际 AI 入口、发送格式、返回格式、保存位置和展示路径。
- [x] 已确认 Managed wire 和服务端 provider 边界。
- [x] 已把上述风险加入独立 Phase 3.3C。
- [x] 账号 binding/switch gate，包括 A→B 会话切换竞态与备份导入失效。
- [x] SafeAIContent 与恶意 Markdown 测试。
- [x] DailySuggestionV2 / LearningAnalysisV2 全链路结构化 schema。
- [x] PlanDraftV2 / WritingFeedbackV2。
- [ ] ChatEventV2。
- [x] Plan structured command 接线。
- [x] Writing input/rubric/schema 修复与 Managed/Custom 同合同路由。
- [x] AiArtifactRepositoryV2 与生命周期。
- [ ] 真实 staging JWT/provider/跨账号/失败路径验收。

在真实 staging JWT/provider、跨账号和失败路径通过前，不得把本地 Managed 接线描述为已经上线
的正式内置 AI，也不得让生产 Tracker 依赖尚未完整验收的 staging Function。用户明确选择的
Custom 仍是独立高级路径，不能作为 Managed 失败时的自动降级。
