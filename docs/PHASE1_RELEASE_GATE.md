# Tracker 第一阶段范围与发布门禁

## 本阶段范围

第一阶段只重构浏览器本地数据基础、迁移与导入保护，并改善学习端 UI 和页面切换体验。本阶段不接入 Supabase，不新增或修改云端数据契约，也不建设 `/admin` 管理面。

对应的五层影响结论必须写入根目录 `release-impact.json`：

- `Frontend`: `changed`
- `Backend`: `reviewed-not-needed`，原因必须说明本阶段不改 Supabase 或同步契约
- `Admin`: `reviewed-not-needed`，原因必须说明本阶段没有可供管理端管理的云端状态
- `Deployment`: `not-deployed`
- `Verification`: 完整门禁通过前为 `required`，通过并记录证据后改为 `passed`

## 强制门禁

交付或推送前运行：

```bash
npm run verify:release
```

命令按以下顺序失败即停：

1. 校验 `release-impact.json` 的五层状态和具体原因。
2. 执行 TypeScript 类型检查。
3. 执行 oxlint。
4. 执行 Vitest 纯函数单元测试。
5. 执行生产构建。

`not-deployed` 是本阶段的真实发布状态，门禁通过不等于已上线。未实际核对远程提交和线上页面时，不得宣称已部署。

## 2026-08-01 本地验收记录

- `npm run verify:release` 通过：影响清单、类型检查、lint、10 个单元测试和生产构建均完成。
- 桌面端验证今日学习与设置页切换；390px 手机端验证主导航、更多菜单、单词页和练习页切换。
- 未知地址显示 404 回退页；浏览器运行时无 console error 或 warning。
- 初始单入口约 1.24 MB 已拆分为按页加载，主入口约 242 kB；体积最大的统计页独立为约 452 kB。
- `npm audit` 中可升级的工具链传递依赖已处理；剩余 2 条来自 React Router 的 RSC 模式公告，本项目为浏览器 SPA，未启用 RSC 或服务端 action。
