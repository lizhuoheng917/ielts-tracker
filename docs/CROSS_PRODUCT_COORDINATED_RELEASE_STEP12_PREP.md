# Tracker × Words 协调发布：Step 12 准备门

- 日期：2026-08-13
- 状态：准备中，尚未提交、推送或部署
- 本步性质：冻结第 1–11 步候选并完成本地终验，不继续扩大产品功能

## 为什么现在进入发布准备

第 11 步已经完成“词汇中心创建或更新一条真实 Tracker 计划，再把同一计划引用发送给
Words”的核心闭环。此时继续插入交付回执、执行进度反向同步或新的数据库实体，会扩大
尚未上线版本的风险和验收范围。下一步应先把现有闭环作为一个完整候选交付；回执与长期
执行反馈留作发布后独立评估。

## 冻结范围

- Tracker：词汇中心双入口、双方数字摘要、AI 可编辑建议、专业计划模板、单一计划来源；
- Words：待确认收件箱、词书选择、实际数量校正、进度保护和最终应用；
- Supabase：既有短期 handoff、按需 Words 规划摘要，以及默认关闭的
  `words_plan_recommendation` 策略；
- Lexi Control：管理该 AI 用途的独立开关和配额；
- Lexi Account：无新业务交互，但必须从同一 Lexi 提交构建并做登录回归。

本候选不保存 AI 正文、推荐历史、规划快照或 Words 明细，不新增执行反馈表。短期 handoff
继续受每账号数量、过期清理和 owner 隔离约束；聚合数据只在用户请求时读取。

## 已核对的发布来源

- Tracker GitHub `main`：`874a59d5ba9a11be250f27592d8bac0b954fe9f1`；
- Lexi GitHub `main`：`527956ed7c73582862b7c9f72eb25f751ccc3356`；
- 当前实现位于两个隔离工作区，正式目录均有其他未提交改动，不能直接覆盖或搬入；
- 隔离工作区的 `origin` 指向本机仓库，发布前必须从上述 GitHub `main` 建立干净候选，
  并逐仓核对差异；
- Tracker 是独立仓库、独立提交；Words、Control 与 Account 使用 Lexi 仓库的同一已验证提交。

## 发布前仍需满足

1. 在两个干净候选中保留第 1–11 步完整改动，确认没有混入正式目录的其他脏改动；
2. 两仓分别运行 `git diff --check` 与 `npm run verify:release`；
3. 再做桌面和移动端本地验收：人工计划、AI 草稿、更新旧计划、Words 接受/拒绝、无数据降级；
4. 恢复 Supabase CLI 与 Cloudflare Wrangler 的发布认证；当前 Supabase 未登录，Wrangler 登录已过期；
5. 只读核对生产 migration history、函数版本、RLS/grants、advisors 与现有策略状态；
6. 用户明确批准发布后，才执行远端迁移、Function、Pages 和策略启用。

## 获批后的安全顺序

1. 提交并记录两个通过门禁的候选 SHA；
2. 精确应用向后兼容的 cross-product 与 planning-context 迁移；
3. 部署兼容新版合同的 `lexi-ai-gateway`，再应用默认关闭的 AI purpose 迁移；
4. 验证匿名拒绝、账号隔离、RPC 返回、保留上限，并确认新 AI 策略仍关闭；
5. 从同一 Lexi SHA 发布 Words、Lexi Control、Lexi Account；
6. 从独立 Tracker SHA Direct Upload 到 `ielts-tracker`；
7. 先验收人工计划闭环，再由 AAL2 管理员受控开启 `words_plan_recommendation`，完成一次真实 AI
   闭环；失败时立即关闭该用途，兼容迁移与人工计划仍可保留；
8. 核对两个 GitHub SHA、四个 Pages 来源、Supabase migration/Function 状态和跨账号隔离证据。

## 本地终验标准

- 两个仓库完整门禁通过，构建物不含 staging 地址或 secret-shaped token；
- 词汇计划只生成一条 Tracker 计划，handoff 的 `sourceRef` 与该计划 ID 一致；
- Words 不自动接受、不自动选词书，实际安排不回退已完成进度；
- AI 不可用、Words 无云端数据或网络失败时，人工计划仍然可用；
- 未获发布批准前，生产数据库、Function、策略和 Pages 均保持不变。
