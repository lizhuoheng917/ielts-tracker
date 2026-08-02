<p align="center">
  <img src="/public/favicon.svg" alt="Lexi Tracker" width="80" height="80" />
</p>

<h1 align="center">Lexi Tracker · 雅思学习追踪</h1>

<p align="center">
  一站式雅思备考管理平台，智能追踪每一次进步
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.2-blue?logo=react" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript" />
  <img src="https://img.shields.io/badge/Vite-8.1-purple?logo=vite" />
  <img src="https://img.shields.io/badge/TailwindCSS-4.3-38bdf8?logo=tailwindcss" />
  <img src="https://img.shields.io/badge/Zustand-5.0-orange" />
</p>

---

## ✨ 功能总览

Lexi Tracker 是 Lexi IELTS 旗下的本地优先学习追踪应用，将**学习管理、数据可视化、AI 智能分析**融为一体，帮助你高效规划、追踪和复盘每一次学习。

### 🎯 核心功能

| 模块 | 功能 |
|------|------|
| **📖 单词背诵** | 分类管理词汇，记录每日背诵量，支持按分类筛选和进度追踪 |
| **🧪 计时练习** | 分科目（听说读写）计时训练，完整记录每次练习的时长与表现 |
| **📝 模考打分** | 阅读/听力/写作/口语模考评分，自动计算各科平均分与趋势 |
| **📅 学习计划** | 创建 daily/weekly 计划任务，每日待办视图，计划执行日历热力图 |
| **✍️ 学习日记** | 记录每日学习心得、心情状态，支持文字回顾 |
| **📊 数据统计** | 单词累积趋势图、学习时长分布、能力雷达图、日历热力图 |
| **🤖 AI 智能助手** | 默认通过 Lexi 内置 AI 生成建议、分析、计划与写作反馈；高级用户也可明确选择本机自定义 AI |
| **🏆 成就系统** | 基于学习数据自动解锁徽章，等级提升机制激励持续学习 |
| **🔥 连续打卡** | 自动追踪每日活跃状态，可视化连续打卡天数与学习热力图 |

### 🌐 在线体验

> [**ielts-tracker-6km.pages.dev**](https://ielts-tracker-6km.pages.dev)

点击上方链接即可在线预览。学习数据默认保存在本地浏览器中；基础记录无需登录，使用 Lexi 内置 AI 时需要 Lexi 账号并确认本机记录归属。

---

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 18
- **pnpm / npm / yarn** 任一包管理器

### 安装与运行

```bash
# 克隆项目
git clone https://github.com/lizhuoheng917/ielts-tracker.git
cd ielts-tracker

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

开发服务器默认不加载正式连接；生产构建由仓库中的 `.env.production` 固定到共享 Lexi production Auth 与 AI Gateway。该文件只包含可公开到浏览器的 Supabase publishable key，不得加入 provider Key、`sb_secret_`、`service_role`、数据库密码或个人令牌。正式发布前运行 `npm run verify:release`，完整步骤见 [生产接入与发布说明](docs/PRODUCTION_CONNECTION_AND_RELEASE.md)。

### 使用 AI 助手

**Lexi 内置 AI（默认）**

1. 在应用中登录 Lexi 账号。
2. 按提示确认当前设备的本机学习记录归属。
3. 发起功能明确的 AI 请求。浏览器不会获取内置服务的 provider Key、endpoint 或实际模型路由。

**自定义 AI（可选高级功能）**

1. 进入 **设置 → AI 高级设置**。
2. 选择 **Agnes 2.0 Flash**、**DeepSeek V4 Flash** 或 **通用 OpenAI-compatible**。
3. 填写你自己的 API Key；通用连接还需填写 HTTPS 基础地址与模型名称。
4. 点击「检测连接」，再明确选择「使用自定义连接」。

自定义请求从当前浏览器直接发送到所选第三方，对方可接收用户本次明确选择发送的内容。Key、endpoint、模型和 provider 预设只保留在当前设备，不会进入 JSON 备份；内置 AI 失败不会自动切换至自定义服务，反向也一样。

---

## 🏗️ 技术架构

```
ielts-tracker/
├── src/
│   ├── components/        # 可复用 UI 组件
│   │   ├── ai/            # AI 对话面板、加载状态、操作确认卡片
│   │   ├── layout/        # 应用布局（导航栏、侧边栏）
│   │   └── ui/            # shadcn/ui 基础组件
│   ├── lib/               # 工具函数与常量
│   │   ├── aiService.ts   # AI API 流式调用（SSE）
│   │   ├── constants.ts   # 应用常量与存储 key
│   │   └── utils.ts       # 通用工具函数
│   ├── data/              # 备份、校验与影子活动账本
│   ├── pages/             # 路由页面
│   │   ├── Dashboard.tsx  # 首页仪表盘
│   │   ├── Words.tsx      # 单词背诵
│   │   ├── Practice.tsx   # 模考打分
│   │   ├── TimerPractice.tsx # 计时练习
│   │   ├── Plans.tsx      # 学习计划 + AI 生成
│   │   ├── Diary.tsx      # 学习日记
│   │   ├── Stats.tsx      # 数据统计
│   │   ├── Settings.tsx   # 应用设置
│   │   └── Achievements.tsx # 成就与等级
│   └── stores/            # 按领域拆分的 Zustand 状态管理
├── public/                # 静态资源
└── index.html
```

### 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| **框架** | React 19 + TypeScript | 函数组件 + Hooks，全量类型覆盖 |
| **构建** | Vite 8 | 极速 HMR 开发体验，Rolldown 生产打包 |
| **样式** | Tailwind CSS 4 + shadcn/ui | 原子化 CSS + 高质量组件库 |
| **状态管理** | Zustand 5 + persist | 轻量级状态管理，localStorage 持久化 |
| **路由** | React Router 7 | SPA 客户端路由 |
| **图表** | Recharts 3 | 数据可视化图表 |
| **AI 集成** | Lexi AI Gateway / Fetch API | 受管或自定义 AI，严格结构化结果与安全渲染 |
| **Markdown** | react-markdown | AI 生成内容富文本渲染 |

---

## 💡 创新亮点

### 1. AI 驱动的个性化学习规划

不同于传统的固定计划模板，Lexi Tracker 内置 AI 对话助手，能够：
- **用途限定的学习快照**：每次只组装当前功能所需的结构化数据，可选日记摘要需用户单独允许
- **解读历史分析报告**：自动读取学习报告中的薄弱项与建议，生成针对性计划
- **一致的结构化结果**：每日建议、学习分析与计划草稿都先通过用途对应的 V2 合同校验
- **知情确认与防重复**：完整预览计划字段后逐条确认；计划与幂等回执一次保存，重复点击不会重复创建

### 2. 本地优先的数据管理

- 多个独立 Zustand store 各自管理一类学习数据，职责清晰
- 所有数据通过 `localStorage` 自动持久化，无需后端服务器
- 支持正式业务数据的 JSON 导出/导入；API Key、恢复 journal 与影子账本不导出，旧备份会安全迁移每日打卡幂等记录
- 跨 Store 学习动作先写最小事务 checkpoint；异常关闭后会在 Zustand 水合前回滚半写状态，已提交但缺失的影子账本会自动重建
- 学习动作使用有界影子账本只读核对 XP、等级、连续学习、热力图与打卡状态，账本不会充当正式业务真相
- 同一计划同一天只有一个执行状态；计划域写入使用跨标签锁、最新持久化快照和 import/clear epoch，避免重复完成与旧标签覆盖
- 一键清空所有数据，支持从零开始

### 3. 游戏化激励体系

- **连续学习系统**：自动检测每日真实活动，可视化 streak 热力图
- **XP 与等级机制**：每次学习行为积累经验值，解锁更高等级
- **徽章成就**：预设多个成就徽章，基于数据自动解锁

### 4. 精致的设计与交互细节

- 完整的**深色/浅色模式**支持，实时切换
- **响应式布局**，适配桌面和移动端
- AI 对话中「请勿离开当前页面」的上下文提示
- 流式生成中断后状态稳定绑定，不会出现「假加载」状态

---

## 📄 开源协议

MIT License

---

<p align="center">
  Made with ❤️ for IELTS learners
</p>
