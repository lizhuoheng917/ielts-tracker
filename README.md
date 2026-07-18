<p align="center">
  <img src="/public/favicon.svg" alt="IELTS Tracker" width="80" height="80" />
</p>

<h1 align="center">IELTS Tracker · 雅思学习追踪</h1>

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

IELTS Tracker 是一款面向雅思备考者的全栈本地应用，将**学习管理、数据可视化、AI 智能分析**融为一体，帮助你高效规划、追踪和复盘每一次学习。

### 🎯 核心功能

| 模块 | 功能 |
|------|------|
| **📖 单词背诵** | 分类管理词汇，记录每日背诵量，支持按分类筛选和进度追踪 |
| **🧪 计时练习** | 分科目（听说读写）计时训练，完整记录每次练习的时长与表现 |
| **📝 模考打分** | 阅读/听力/写作/口语模考评分，自动计算各科平均分与趋势 |
| **📅 学习计划** | 创建 daily/weekly 计划任务，每日待办视图，计划执行日历热力图 |
| **✍️ 学习日记** | 记录每日学习心得、心情状态，支持文字回顾 |
| **📊 数据统计** | 单词累积趋势图、学习时长分布、能力雷达图、日历热力图 |
| **🤖 AI 智能助手** | 接入 Agnes AI API，对话式交互，自动分析学习数据、生成个性化学习计划 |
| **🏆 成就系统** | 基于学习数据自动解锁徽章，等级提升机制激励持续学习 |
| **🔥 连续打卡** | 自动追踪每日活跃状态，可视化连续打卡天数与学习热力图 |

### 🌐 在线体验

> [**ielts-tracker-6km.pages.dev**](https://ielts-tracker-6km.pages.dev)

点击上方链接即可在线预览，所有数据存储在本地浏览器中，无需注册或登录。

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

### 配置 AI 助手（可选）

1. 启动应用后进入 **设置** 页面
2. 填入你的 [Agnes AI](https://agnes-ai.com) API Key
3. 点击「检测连接」验证配置
4. 前往「学习计划」或「数据统计」页面，即可使用 AI 智能分析功能

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
│   ├── pages/             # 路由页面
│   │   ├── Home.tsx       # 首页仪表盘
│   │   ├── Words.tsx      # 单词背诵
│   │   ├── Practice.tsx   # 模考打分
│   │   ├── Timer.tsx      # 计时练习
│   │   ├── Plans.tsx      # 学习计划 + AI 生成
│   │   ├── Diary.tsx      # 学习日记
│   │   ├── Stats.tsx      # 数据统计
│   │   ├── Settings.tsx   # 应用设置
│   │   └── Level.tsx      # 成就与等级
│   └── stores/            # Zustand 状态管理（12 个独立 store）
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
| **AI 集成** | Fetch API (SSE) | 流式 AI 对话，实时内容渲染 |
| **Markdown** | react-markdown | AI 生成内容富文本渲染 |

---

## 💡 创新亮点

### 1. AI 驱动的个性化学习规划

不同于传统的固定计划模板，IELTS Tracker 内置 AI 对话助手，能够：
- **分析全量学习数据**：综合单词、练习、计时、日记等多维度数据
- **解读历史分析报告**：自动读取学习报告中的薄弱项与建议，生成针对性计划
- **流式交互体验**：AI 回复逐字流式输出，调用外部 API 时支持中断与重试
- **一键执行建议**：AI 生成的行动计划可直接创建为学习任务

### 2. 全栈本地化数据管理

- **12 个独立 Zustand store**，各自管理一类学习数据，职责清晰
- 所有数据通过 `localStorage` 自动持久化，无需后端服务器
- 支持**完整的数据导出/导入**（JSON 格式），轻松备份和跨设备迁移
- 一键清空所有数据，支持从零开始

### 3. 游戏化激励体系

- **连续打卡系统**：自动检测每日活跃度，可视化 streak 热力图
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
