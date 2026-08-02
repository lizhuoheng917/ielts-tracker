# Phase 3.3E: PlanDraftV2、确认回执与幂等计划写入

## 本阶段解决的问题

旧计划助手把模型返回的自由文本当作操作协议，再用正则提取字段。未知操作可能让确认卡崩溃，非法时间或星期会被静默改写；计划与“已执行”又分别写入两个 Store，刷新、重复点击或中途写入失败都可能产生重复计划。

本阶段把链路改为：

1. 每次发送时读取最新、用途受限的 `plan_draft` 学习快照；
2. Managed AI 或用户明确选择的 Custom AI 都必须返回同一个严格 `PlanDraftV2` JSON；
3. Provider 只能给出 1–4 个计划候选，不能提供计划 ID、命令 ID、确认状态或幂等键；
4. Tracker 校验所有字段后，才在本机生成绑定快照、AI 来源和账号范围的命令草稿；
5. 用户逐条查看分类、频率、星期、时间、时长和数量，再明确确认；
6. Plan Store 在同一次持久化写入中保存确定性计划 ID 与 `AiCommandReceipt`；
7. 同一命令再次确认只返回 `duplicate`，不会创建第二份计划。

自由文本 `[ACTION:*]` 不再是新请求的输入或输出合同。旧聊天中的标记只会作为历史文本被移除，不会恢复为可执行操作。

## PlanDraftV2 边界

- 顶层严格字段：`schemaVersion`、`kind`、`title`、`summary`、`plans`、`evidence`、`limitations`；
- `plans` 为 1–4 项；额外字段、空标题、超长文字或未知枚举全部拒绝；
- `daily` 必须使用空 `weekDays`，`weekly` 必须使用 0–6 的非空去重星期列表；
- `targetTime` 只能是 `HH:mm` 或 `null`；
- `targetDuration` 只能是 5–180 的整数或 `null`；
- `targetCount` 只能是 1–10000 的整数或 `null`；
- 生成成功只代表“草稿可预览”，不代表计划已经保存。

## 内容保存位置

| 内容 | 保存位置 | 写入时机 | 是否上传正式数据库 |
| --- | --- | --- | --- |
| 学习快照、用户本次请求 | 组件与 Edge Function 运行内存 | 生成期间 | 否；仅临时传输 |
| PlanDraftV2 与本机命令草稿 | 当前账号/AI 来源隔离的 `ielts-tracker:aiChatHistory` | 严格解析成功后 | 否 |
| 已确认计划 + 命令回执 | 同一个 `ielts-tracker:studyPlans` Zustand envelope | 用户逐条确认后一次写入 | 否 |
| Gateway 配额与运行状态 | 正式 Lexi Supabase 私有 metadata 表 | Managed 请求预留/完成时 | 是，但不含快照、用户输入或生成正文 |
| `/admin` | Lexi Control AI 服务页 | 管理员读取或更新策略时 | 只展示策略、配额与聚合运行状态 |

可移植 Backup V3 会携带计划回执，避免导入后把已经执行过的草稿再次写入；Managed 草稿中的账号范围会被改为 `managed:unbound`，原账号 ID 不进入备份，导入后也不能直接执行旧 Managed 草稿。

## 失败关闭与体验保护

- 额外字段、用途错配、非法星期/时间/数量、超过四项计划或超限文本全部不渲染确认卡；
- 新请求、关闭弹窗、切换 Managed/Custom 或切换账号后，迟到响应会被丢弃；
- 命令 24 小时后过期，或确认时 AI 来源/账号范围变化，会返回 `stale` / `scope_mismatch`，不写计划；
- 确认按钮使用同步 in-flight guard，连点只执行一次；
- localStorage 写入失败时回滚计划与回执的内存快照，UI 不显示假成功；
- 创建计划定义不写 Activity Ledger、不增加 XP 或连续学习；只有真正完成计划执行才算学习活动；
- 移动端确认卡完整展示正式字段，主要操作高度至少 44px，计划弹窗使用动态视口高度。

## 全栈协调

- **Tracker Frontend**：新增 PlanDraftV2 解析、计划草稿卡、迟到响应保护、逐条确认、原子本机回执、账号范围隔离与 Backup V3 校验。
- **Formal Backend**：`lexi-ai-gateway` 增加 `plan_draft` purpose、严格 Provider Schema 与 Function 运行时复验；向前 migration 扩展 policy/usage/request-receipt CHECK 和 RPC 白名单，新增默认关闭的独立策略。
- **Admin**：Lexi Control 增加第三张“计划草稿”策略卡，兼容迁移窗口内的 2 或 3 个 purpose，并明确“不会自动写入计划”。
- **Deployment**：本阶段没有应用远端 migration、设置 Secret、部署 Function/Cloudflare、提交或推送。正式启用前必须先部署兼容 Function/Admin，再应用默认关闭 migration，完成 Tracker 端到端验收后才开启策略。

## 已知后续项

- Phase 3.3F 已为全部 `studyPlans` 写入口增加 Web Locks/租约、锁内 rehydrate、revision pulse 与 import/clear epoch，并把 `(planId, date)` 收敛为 execution 唯一语义；Stats、热力图和 AI snapshot 已统一口径。
- 单词、模考、计时、日记与手动打卡等旧同步 Store 尚未全部迁入全局异步 coordinator；跨模块双标签共享 XP/heatmap 写入应在正式同步/生产发布前继续收口。
- 真实 staging provider、并发配额、跨账号远程执行与故障路径仍是部署门槛，本地测试不能替代。

## 下一步建议

计划执行唯一性与计划域多标签写入锁已经完成。下一阶段进入 `WritingFeedbackV2`，统一题目/图表输入、评分 rubric、结构化返回、明确保存和后端 Gateway 路由；全局跨模块写入协调作为正式后端同步/生产发布前的可靠性门槛。
