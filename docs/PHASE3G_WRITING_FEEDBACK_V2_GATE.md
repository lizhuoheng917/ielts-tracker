# Phase 3.3G：WritingFeedbackV2 输入、评分与报告门禁

日期：2026-08-02
状态：Tracker、Formal Gateway 与 Lexi Control 的本地实现及发布门禁已完成；真实 staging provider/JWT 与正式全栈发布尚未验收

## 本阶段解决的问题

旧写作批改只发送作文正文，并从自由文本中猜测一个宽松 JSON。缺少原始题目或 Academic
Task 1 图表材料时，模型仍可能给出看似精确的分数；返回值也没有可靠的 rubric、证据、字段上限
或账号隔离合同。

现在写作链路收敛为：

1. 用户选择 `Academic` / `General Training` 与 `Task 1` / `Task 2`；
2. 用户提供原始题目、作文正文，以及 Academic Task 1 可选的图表材料文字描述；
3. Tracker 计算词数，并建立只含 `writing.submission` 的用途专属私有快照；
4. 用户当前明确选择的 Managed 或 Custom 路由必须返回同一个严格 `WritingFeedbackV2`；
5. Tracker 先按提交内容复验评分、证据与字段边界，再展示结构化预览；
6. 生成成功不等于保存成功，用户必须明确保存到 AI 内容库，或导出完整 Markdown；
7. 新报告使用统一 V2 仓库；旧写作报告只读保留，不会被猜测升级或重新评分。

Managed 失败不会把作文静默转发给 Custom。Custom 只有在用户明确选择后才会被调用。

## WritingSubmissionV2 输入合同

| 字段 | 合同 | 用户体验边界 |
| --- | --- | --- |
| `schemaVersion` | 固定为 `2` | 由 Tracker 生成，模型不能修改 |
| `module` | `academic` 或 `general_training` | 明确选择考试类型 |
| `task` | `task1` 或 `task2` | 决定使用 Task Achievement 或 Task Response |
| `promptText` | 原始题目；运行时硬上限 4,000 字符 | 当前编辑器要求填写，UI 上限 2,000 字符 |
| `sourceMaterial` | `none` 或 `text_description` | 首版仅 Academic Task 1 显示文字描述输入；UI 上限 4,000 字符，运行时硬上限 6,000 字符 |
| `essayText` | 标准化换行并去除首尾空白的作文正文 | UI 上限 12,000 字符，运行时硬上限 20,000 字符 |
| `wordCount` | Tracker 根据正文计算的整数 | Provider 不能声明、覆盖或伪造词数 |

题目、材料描述和作文都被视为不可信数据，而不是 system 指令。写作快照不附带学习历史、日记、
计划、旧 AI 内容或其他用途的数据。

### 任务证据是否充分

- Task 2 与 General Training Task 1 需要原始题目，才能进行完整任务评分；
- Academic Task 1 同时需要原始题目和 `text_description` 材料描述；
- Academic Task 1 缺少材料描述时仍可提供语言与结构反馈，但必须返回
  `insufficient_evidence`，不得显示精确 Task Achievement 或总体分；
- 少于 150 词的 Task 1 或少于 250 词的 Task 2 会标记为质量有限并显示局限，但不会伪造词数；
- 首版不接收截图、图片 URL、文件引用或视觉模型输入。

## WritingFeedbackV2 严格返回合同

返回顶层字段必须且只能是：

`schemaVersion`、`kind`、`rubricVersion`、`assessmentStatus`、`taskCriterion`、
`summary`、`criteria`、`strengths`、`priorities`、`paragraphFeedback`、`corrections`、
`limitations`。

核心门禁如下：

- `schemaVersion` 固定为 `2`，`kind` 固定为 `writing_feedback`；
- `rubricVersion` 固定为 `ielts-writing-public-descriptors-v1`，不得声称是官方考官评分；
- Task 1 必须使用 `task_achievement`，Task 2 必须使用 `task_response`；
- `scored` 的四项分数必须全部是 0–9 的 0.5 档数字；模型不返回总体分，Tracker 根据四项平均值
  计算并四舍五入到最近的 0.5；
- `insufficient_evidence` 的四项分数必须全部为 `null`，并至少提供一条明确局限；
- 四项评分证据、优势证据、段落证据与修改示例的原句必须逐字来自本次作文；模型编造的“原文”
  会被拒绝；
- 四项反馈、优势、优先行动、段落反馈、修改示例与局限均有数组数量、字符串长度和总响应大小上限；
- 未知字段、用途错配、错误 rubric、非法半分、重复段落编号、畸形 JSON、Markdown 围栏外文字或
  与作文不匹配的证据均失败关闭，不渲染、不保存。

UI 直接渲染已经验证的结构对象。Markdown 是 Tracker 从结构对象确定性生成的投影，不是把模型
原始富文本直接插入页面。

评分维度、Task 1/Task 2 最低词数与四项等权的单项任务平均遵循 IELTS 官方公开说明；具体描述档位
以官方 [Writing Band Descriptors](https://ielts.org/cdn/ielts-guides/ielts-writing-band-descriptors.pdf)
和 [Writing scoring overview](https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail) 为依据。
本产品展示的是学习估分，不是官方考试成绩。

## Managed 与 Custom 路由

### Managed：Lexi 内置 AI

- 浏览器发送 `purpose: writing_feedback` 和用途专属快照；`userInput` 必须为空，避免出现与
  submission 相冲突的第二指令通道；
- 快照私有 scope 必须且只能包含 `writing.submission`；
- 调用前必须用服务端确认的 Lexi 身份核对本机数据 binding，错账号或 binding 异常时失败关闭；
- provider key、endpoint、model 与 system prompt 留在服务端，不进入浏览器 wire；
- Gateway 响应必须同时通过服务端合同和 Tracker 的 submission-bound 运行时校验；
- 服务端合同使用临时处理与 `store: false`：默认不保存题目、材料、作文、学习快照、用户请求或
  生成正文。正式数据库只允许保留运行、限额、安全、时延、模型别名、token 用量、context hash
  与 artifact 标识等最小元数据；
- 当前文档只确认 Tracker 本地合同与调用路径，不代表 staging provider Secret、真实 JWT、远程
  Function 或生产策略已经验收。

### Custom：用户明确配置的自定义 AI

- 只有用户在高级设置中明确选择 Custom，浏览器才会向其配置的 OpenAI-compatible 服务发送；
- Custom 使用同一 WritingFeedbackV2 system 合同和同一 submission-bound 解析器，不再接受宽松
  JSON 或从自由文本猜字段；
- key、URL 与 model 留在当前设备，不进入可移植备份；
- Custom 服务商是否保留请求由该服务商的政策和用户配置决定，不能套用“Lexi 服务端不落正文”
  的承诺；
- Managed 的身份、限额、网络或 provider 失败不会自动切换到 Custom。

两个路由均使用超时、AbortController、停止按钮、响应大小上限和稳定错误状态。请求序号会丢弃
取消后或新请求开始后才到达的旧响应，避免旧结果覆盖新结果。

## 保存、导出与账号隔离

| 内容 | 保存位置 | 写入时机 | 是否自动上传 |
| --- | --- | --- | --- |
| 未完成写作草稿 | 当前浏览器、按本机或 Lexi 账号分区的写作 draft key | 输入时自动保留；成功保存报告后清除 | 否 |
| 生成中的请求与未保存预览 | 组件内存 | 本次弹窗会话期间 | 否 |
| 新 WritingFeedbackV2 报告 | `ielts-tracker:aiArtifactsV2` | 用户点击“保存报告”且持久化成功后 | 否 |
| 单份 Markdown | 用户选择的下载位置 | 用户明确导出 | 否 |
| AI 内容列表 JSON / Backup V3 | 用户选择的下载位置 | 用户明确导出 | 否 |
| Managed 运行元数据 | Lexi 后端私有控制面 | Managed 请求执行时 | 是，但不含题目、作文或生成正文 |

新 V2 报告会保存 submission、严格 feedback、Tracker 计算的总体分、Markdown 投影、来源、
run/artifact/snapshot/context provenance、warnings、时间和 owner。写入失败会保留预览，并明确允许
重试或先导出，不会显示假的“已保存”。

单份写作 Markdown 明确包含原始题目、Academic Task 1 材料描述（如有）、完整作文和 AI 反馈。
AI 内容列表 JSON 与 Backup V3 也会携带完整写作报告，因此属于敏感文件；导出会移除原 Lexi
账号 ID，把内容恢复为本机归属，导入后必须重新确认账号 binding。

账号保护规则：

- 草稿 key 按本机或已确认 Lexi 账号分区；账号变化会中止旧请求、清空当前内存字段，再加载新
  scope 的草稿，不能把账号 A 的作文自动写进账号 B；
- 新报告带 `local` 或 `accountUserId` owner；账号不匹配、认证恢复中或 binding 异常时不显示、
  不导出、不删除、不新增；
- 首次明确绑定账号时，本机 artifact 才会被采用为该账号内容；退出后账号内容隐藏，重新登录
  原账号后恢复；
- 备份导入先全量校验，所有 artifact 回到本机归属并清除 Managed binding，不把备份中的账号
  声明当作授权依据。

## 旧写作报告与首版材料边界

旧 `writingReports` 仍保留在原本机 Store 与 Backup 兼容字段中，并在写作页的“旧版报告”区域
单独展示。它们缺少可靠题目、rubric、逐字证据和 V2 provenance，因此：

- 不会被自动改写为 WritingFeedbackV2；
- 不会根据旧文本推测分数、补题目或重新评分；
- 不会进入新 V2 报告的严格列表或被自动上传；
- 仍可按原兼容路径查看、删除和随完整备份迁移。

Academic Task 1 首版只允许用户以文字描述图表、地图、流程或示意图。加入图片上传、OCR 或视觉
模型会引入文件类型、大小、恶意文件、Storage、保留/删除、跨设备同步、RLS 与管理员隐私边界，
必须作为新的全栈发布单元设计，不能在本阶段暗中扩展。

## 用户体验与移动端保护

- 写作入口位于“模考记录 → 写作”，使用紧凑入口，不与普通模考记录混在同一表单；
- 移动端编辑器和报告详情使用 `100dvh` 全屏弹窗、单一内部滚动区与底部主要操作；
- 生成中可停止；关闭生成中或尚未保存的结果时必须二次确认，避免浪费调用或丢失报告；
- 预览、写作页历史和 AI 内容库复用同一结构化报告组件；原始作文默认折叠，减少页面抢占；
- 已保存报告可在写作页或 AI 内容库查看、导出和二次确认后删除；删除不会改动模考记录。

## 验证

本阶段的本地验证覆盖：

- WritingSubmissionV2 归一化、宿主词数、用途专属快照与证据质量；
- WritingFeedbackV2 半分、task criterion、逐字证据、证据不足和总体分派生；
- Managed wire、provenance 与写作专属私有 scope；
- Custom 与 Managed 使用同一严格 schema，且 Managed 失败不自动回退；
- V2 artifact 保存、幂等重试、账号隔离、写入失败回滚、防篡改与可移植导出；
- 单份 Markdown 包含题目、材料、完整作文和反馈；
- 结构化 scored / insufficient-evidence 报告、Task 1 材料和原文展示；
- Tracker TypeScript、oxlint、Vitest、生产构建与 390px 本地写作入口/弹窗交互；
- Formal Function、migration、Admin、零网络 staging harness、桌面/移动端 Admin E2E 与
  `npm run verify:release`。

这些本地验证不能替代真实 staging JWT、provider、Function、RLS、配额并发和跨账号远程验收。

## 全栈发布边界

- **Tracker Frontend**：WritingFeedbackV2 输入、路由、严格校验、状态机、结构化展示、保存、导出、
  旧报告隔离与移动端流程已在本地实现。
- **Formal Backend**：共享 `lexi-ai-gateway` 已在本地以向后兼容方式加入 `writing_feedback`，使用服务端
  固定 prompt/schema、provider Secret、配额、幂等与最小元数据审计；新增 migration 默认关闭该用途，
  每用户每日 4 次、请求上限 64 KiB、输出上限 2,400 tokens。本文不宣称远端 migration/Function 已发布。
- **Admin**：Lexi Control 已在本地加入第四张写作策略卡，只管理 writing purpose 的启停、限额和
  聚合运行状态，不展示用户题目、作文、逐字证据或生成报告；正式启用前仍须与 Backend 同一发布单元验收。
- **Deployment**：本阶段没有提交、推送、设置 Secret、应用远端 migration 或部署 Tracker、Function、
  Cloudflare Pages。

## 下一步建议

1. 在独立 staging 按兼容顺序应用 plan/writing 两项 purpose migration、部署同一版 Function/Admin，
   并保持 `writing_feedback` 策略关闭；
2. 设置 provider Secret，用专用账号验证成功、401/403/413/429、无效 JSON、错误
   rubric、编造证据、超时、取消、重复请求和写入失败；
3. 用账号 A/B 验证作文只在正确本机 scope 可见，并核对数据库、Function 日志和 Lexi Control
   不包含题目、作文或生成正文；
4. 完成同一 verified commit 的 Tracker、Backend、Admin 发布门禁后，再讨论生产启用；
5. 图片型 Task 1、跨设备 AI artifact 同步与全局跨模块多标签写入协调分别作为后续独立阶段，
   不与本次文字写作反馈混发。
