# Phase 3.3F：计划执行唯一性与计划域多标签写入保护

## 本阶段解决的问题

旧实现把“新增执行”和“更新执行”交给页面自行判断。同一计划、同一天在快速点击、重复确认或多个标签页同时操作时，可能生成多条不同 ID 的执行记录。页面只展示其中一条，但 Stats、热力图与 AI 快照会逐条累计，形成“页面看起来正确，统计和奖励却重复”的隐性错账。

本阶段把 `(planId, date)` 定义为计划执行的正式业务唯一键，并将计划域的写入流程收敛为：

1. 获取跨标签页 canonical mutation lock；
2. 在锁内读取最新持久化 envelope，而不是沿用当前标签的旧内存；
3. 从最新状态构造绝对目标写入；
4. 使用本地事务 journal 同时更新执行、XP、热力图、打卡保护和影子账本；
5. 提交后广播 revision，其他标签在 storage pulse 或重新聚焦时刷新；
6. 导入或清空时推进 epoch，旧标签不能把整体更新前的数据重新写回来。

## 唯一语义与历史数据

- 唯一键为 `planId + local date`，不再以随机 execution ID 判断“今天是否已有记录”；
- `setExecutionForDate()` 接受目标完成状态，而不是执行“反转旧页面快照”；
- 相同目标状态是真正 no-op：不新增 execution、journal、账本事件、XP、热力图或 daily check-in；
- 已存在记录在完成与未完成之间切换时沿用原 ID；
- 历史重复记录没有可靠时间戳，因此按现有数组顺序保留第一条，后续记录视为 duplicate；
- duplicate 通过正式 activity transaction 删除。多余的已完成记录会同步抵消热力图贡献，daily check-in 奖励不会被删除或再次发放；
- V1/V2/V3 旧备份仍允许导入不同 ID、相同 `(planId,date)` 的历史记录，页面重新启动后使用同一事务修复，避免新版直接拒绝旧备份。

## 统一读取口径

- Dashboard、Plans 只读取 canonical execution；
- Stats 先按复合键归一，再计算区间完成数；
- AI learning snapshot 在范围过滤前使用相同归一规则，执行数、完成数、完成率和 timeline 不再受隐藏 duplicate 污染；
- 活动账本回放始终根据当天和 canonical heatmap 重算 `currentStreak`，同时保留历史 `longestStreak`；
- Backup 不携带 mutation revision、epoch、lease、pulse、journal 或影子账本。

## 多标签页协调边界

### 已覆盖

- `studyPlans` envelope 的全部正式写入口：计划新增、编辑、启停、删除；
- AI 计划草稿确认、拒绝及 durable command receipt；
- 计划 execution 的设定、删除和历史 duplicate 修复；
- 计划完成产生的 daily check-in、XP、streak、heatmap 与 activity-ledger 副作用；
- JSON 备份导入与“清空全部数据”；
- 启动 journal recovery、计划域 storage pulse 与 focus refresh；
- import/clear epoch tombstone，防止旧标签复活整体更新前的计划。

Web Locks 是现代浏览器中的正式互斥路径。无 Web Locks 时使用短租约、TTL、心跳和 token 复核；无法安全使用 storage 时失败关闭，不允许直接绕过锁写入。

### 尚未覆盖

本阶段不宣称“整个应用的所有 Store 都已支持多标签并发”。单词、模考、计时、日记、手动打卡、徽章和统计访问等旧同步写入口尚未全部迁入同一异步 coordinator。两个标签页同时在不同模块写共享 XP/heatmap/journal，仍属于待收口边界。

这类跨模块、跨标签同时写入不是当前主流程的阻断项，但在后端同步或正式生产发布前，应增加一个全局 activity mutation coordinator，把所有 canonical learning write 都改为“锁内 rehydrate 后构造事务”。

## 浏览器验收

使用隔离的 `http://127.0.0.1:5175` 来源完成真实双标签测试，没有读取或修改用户当前 `5173` 的学习数据：

1. 两个标签基于空快照同时新增不同计划；刷新后两份计划都存在；
2. 两个标签同时完成同一计划；刷新后两边均显示 `1 / 2 已完成`；
3. Stats 只显示 `完成计划 1`；
4. 成就页只显示 `10 XP` 和一次“初次打卡”，没有重复发奖。

## 全栈影响

- **Frontend**：changed。计划执行、计划域多标签协调、历史修复、Stats、AI snapshot、Backup 和错误提示均有变更。
- **Backend**：reviewed-not-needed。计划、execution、XP、heatmap、epoch 与锁仍是浏览器本地数据；AI Gateway 请求/返回字段及保存边界没有变化。
- **Admin**：reviewed-not-needed。没有新增远程状态、策略、配额或管理员可管理对象。
- **Deployment**：not-deployed。没有提交、推送、应用 Supabase migration、部署 Edge Function 或 Cloudflare Pages。

## 下一步建议

按当前产品路线进入 `WritingFeedbackV2`：统一题目/图表输入、IELTS rubric、严格结构化返回、证据与局限说明、明确保存位置及 Managed/Custom Gateway 路由。

在接入正式后端同步或生产发布前，再安排 Phase 3.3G 全局本地写入协调，把 word/practice/timer/diary/manual check-in 等共享投影写入口迁入同一 coordinator，并补跨模块双标签故障测试。
