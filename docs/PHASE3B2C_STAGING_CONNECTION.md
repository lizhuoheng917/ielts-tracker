# Phase 3.3B-2C：共享 Lexi staging 连接合同

日期：2026-08-01
状态：本地配置门禁已实现；独立 staging 已创建并固定 project ref

## 决策边界

Lexi Tracker 与 Lexi Words 共享同一个 Lexi 账号体系、Supabase Auth、受管 AI Gateway 和 Lexi Control。共享的是平台身份与服务底座，不是把两个产品的业务数据混成一套表。

- Tracker 学习记录继续 local-first，当前仍保存在 Tracker 设备端存储中。
- Lexi Words 的词库、学习阶段、同步队列与后台报表保持原有合同。
- AI Gateway 只接收用途受限的临时快照；正式数据库只保存运行元数据。
- 如果未来 Tracker 业务数据进入云端，必须使用独立表/命名空间、独立 RLS 与同步合同，并通过跨账号隔离测试。

## 浏览器安全配置

无配置时应用继续使用本地模式。连接远端时只允许浏览器安全值：

```dotenv
VITE_LEXI_ENVIRONMENT=staging
VITE_SUPABASE_URL=https://<staging-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SUPABASE_PROJECT_REF=<staging-project-ref>
```

不得放入 `VITE_*`：Supabase secret/service-role key、AI provider key、数据库密码、个人 access token 或任何服务端 Secret。

运行时会执行以下 fail-closed 检查：

1. 只要配置 Supabase 远端连接，`VITE_LEXI_ENVIRONMENT` 就必须显式设置为 `staging` 或 `production`；省略环境标识的旧兼容连接会被拒绝。
2. staging 必须显式提供 project ref，且与 `*.supabase.co` URL 完全一致。
3. staging 指向已知生产 project `olkvqmnuyxuddgpcordp` 时停止初始化 Supabase 客户端。
4. staging 只允许已核验的 `kkynryhceurvnylprxyx`；其他非生产 ref 即使 URL 自洽也拒绝。
5. local 标记不能连接任意远端 URL。
6. production 标记只能指向已知生产 project；当前阶段不会使用或部署该模式。
7. key 以 `sb_secret_` 开头或 JWT role 为 `service_role` 时拒绝连接。
8. Auth session storage key 按环境和 project ref 分区；切换 staging/production 时不会把旧环境的 access/refresh session 交给新项目。

## staging 验收顺序

1. 使用隔离的 `Lexi IELTS Staging`（ref `kkynryhceurvnylprxyx`），取得独立 URL、publishable key 与 Auth 数据。
2. 在正式 Lexi 仓库应用 AI Gateway migration、设置仅 staging 可见的 Function Secret 并部署 Function。
3. 使用专用测试账户验证注册/登录；不复制生产用户、邮件、日记或学习数据。
4. 验证每日建议成功后只更新 `ielts-tracker:aiSuggestion`。
5. 验证学习分析只有点击“保存报告”后才写入 `ielts-tracker:reports`。
6. 验证 401、403、413、429、重复请求、超时与 provider 失败不会创建本地内容。
7. 检查 Lexi Control 只显示聚合运行元数据，且普通账户无法读取管理 RPC 或其他账户数据。

## 当前未完成的远端门槛

- staging project 已创建，正式迁移已应用，`lexi-ai-gateway` v1 已部署为 ACTIVE。
- 尚未设置 staging provider Function Secret，因此 Gateway 当前按设计失败关闭。
- 尚未运行真实 JWT、双连接并发、RLS、跨账号和 provider smoke test。
- 尚未提交、推送或部署 Tracker。

在上述门槛全部通过前，不得让生产 Tracker 依赖尚未验证的 AI Gateway。
