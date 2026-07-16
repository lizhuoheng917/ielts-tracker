import type { ReactNode } from 'react'

/**
 * 通用空状态组件
 * 使用大面积浅色背景 + 内联 SVG 简约几何插画 + 引导文案
 */

// SVG 插画场景定义
type Scene = 'tasks' | 'words' | 'practice' | 'diary' | 'achievements' | 'plans' | 'generic'

interface EmptyStateProps {
  scene?: Scene
  title: string
  description?: string
  action?: ReactNode
}

// ===== 内联 SVG 插画 =====
function Illustration({ scene }: { scene: Scene }) {
  const illustrations: Record<Scene, ReactNode> = {
    // 待办任务：打开的笔记本 + 勾选框
    tasks: (
      <svg viewBox="0 0 120 100" className="w-28 h-24 md:w-32 md:h-28 mx-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* 笔记本 */}
        <rect x="25" y="15" width="55" height="70" rx="6" fill="#E0E7FF" />
        <rect x="30" y="20" width="45" height="60" rx="3" fill="#EEF2FF" />
        {/* 笔记本线条 */}
        <line x1="38" y1="32" x2="67" y2="32" stroke="#A5B4FC" strokeWidth="2" strokeLinecap="round" />
        <line x1="38" y1="42" x2="60" y2="42" stroke="#C7D2FE" strokeWidth="2" strokeLinecap="round" />
        <line x1="38" y1="52" x2="55" y2="52" stroke="#C7D2FE" strokeWidth="2" strokeLinecap="round" />
        {/* 打勾 */}
        <circle cx="50" cy="68" r="8" fill="#6366F1" />
        <polyline points="45,68 49,72 56,64" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* 铅笔 */}
        <rect x="82" y="40" width="6" height="35" rx="2" fill="#F59E0B" transform="rotate(-15, 85, 57)" />
        <rect x="82" y="40" width="6" height="6" rx="1" fill="#D97706" transform="rotate(-15, 85, 57)" />
        {/* 装饰圆点 */}
        <circle cx="15" cy="25" r="4" fill="#C7D2FE" opacity="0.5" />
        <circle cx="100" cy="20" r="3" fill="#FDE68A" opacity="0.6" />
        <circle cx="95" cy="80" r="5" fill="#A5B4FC" opacity="0.3" />
      </svg>
    ),
    // 单词本：打开的书 + 字母
    words: (
      <svg viewBox="0 0 120 100" className="w-28 h-24 md:w-32 md:h-28 mx-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* 书本 */}
        <path d="M30 25 C30 22, 32 20, 35 20 L58 20 L58 80 L35 80 C32 80, 30 78, 30 75 Z" fill="#E0E7FF" />
        <path d="M58 20 L81 20 C84 20, 86 22, 86 25 L86 75 C86 78, 84 80, 81 80 L58 80 Z" fill="#C7D2FE" />
        <line x1="58" y1="20" x2="58" y2="80" stroke="#A5B4FC" strokeWidth="2" />
        {/* 字母 */}
        <text x="42" y="42" fill="#6366F1" fontSize="10" fontWeight="bold" fontFamily="serif">A</text>
        <text x="42" y="56" fill="#818CF8" fontSize="10" fontWeight="bold" fontFamily="serif">B</text>
        <text x="42" y="70" fill="#A5B4FC" fontSize="10" fontWeight="bold" fontFamily="serif">C</text>
        <text x="66" y="42" fill="#6366F1" fontSize="10" fontWeight="bold" fontFamily="serif">a</text>
        <text x="66" y="56" fill="#818CF8" fontSize="10" fontWeight="bold" fontFamily="serif">b</text>
        <text x="66" y="70" fill="#A5B4FC" fontSize="10" fontWeight="bold" fontFamily="serif">c</text>
        {/* 阅读灯 */}
        <circle cx="100" cy="18" r="6" fill="#FDE68A" />
        <line x1="100" y1="24" x2="100" y2="35" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
        {/* 装饰 */}
        <circle cx="18" cy="70" r="4" fill="#C7D2FE" opacity="0.5" />
        <circle cx="108" cy="60" r="3" fill="#FDE68A" opacity="0.5" />
      </svg>
    ),
    // 练习：耳机 + 播放按钮
    practice: (
      <svg viewBox="0 0 120 100" className="w-28 h-24 md:w-32 md:h-28 mx-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* 耳机头带 */}
        <path d="M30 55 C30 35, 40 22, 60 22 C80 22, 90 35, 90 55" stroke="#6366F1" strokeWidth="4" strokeLinecap="round" fill="none" />
        {/* 左耳罩 */}
        <rect x="22" y="50" width="18" height="28" rx="8" fill="#6366F1" />
        <rect x="25" y="54" width="12" height="20" rx="5" fill="#4F46E5" />
        {/* 右耳罩 */}
        <rect x="80" y="50" width="18" height="28" rx="8" fill="#6366F1" />
        <rect x="83" y="54" width="12" height="20" rx="5" fill="#4F46E5" />
        {/* 播放按钮 */}
        <circle cx="60" cy="72" r="12" fill="#EEF2FF" stroke="#A5B4FC" strokeWidth="1.5" />
        <polygon points="56,66 56,78 68,72" fill="#6366F1" />
        {/* 音波 */}
        <path d="M45 38 C45 38, 48 35, 48 32" stroke="#C7D2FE" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M75 38 C75 38, 72 35, 72 32" stroke="#C7D2FE" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M42 42 C42 42, 46 37, 46 33" stroke="#C7D2FE" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.5" />
        <path d="M78 42 C78 42, 74 37, 74 33" stroke="#C7D2FE" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.5" />
        {/* 装饰 */}
        <circle cx="15" cy="30" r="3" fill="#FDE68A" opacity="0.5" />
        <circle cx="105" cy="35" r="4" fill="#C7D2FE" opacity="0.4" />
      </svg>
    ),
    // 日记：钢笔 + 纸张
    diary: (
      <svg viewBox="0 0 120 100" className="w-28 h-24 md:w-32 md:h-28 mx-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* 纸张 */}
        <rect x="20" y="18" width="60" height="72" rx="4" fill="#EEF2FF" stroke="#C7D2FE" strokeWidth="1" />
        {/* 纸张线条 */}
        <line x1="30" y1="35" x2="70" y2="35" stroke="#E0E7FF" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="30" y1="45" x2="65" y2="45" stroke="#E0E7FF" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="30" y1="55" x2="60" y2="55" stroke="#E0E7FF" strokeWidth="1.5" strokeLinecap="round" />
        {/* 钢笔 */}
        <g transform="rotate(-35, 88, 55)">
          <rect x="85" y="15" width="6" height="50" rx="2" fill="#6366F1" />
          <polygon points="85,65 91,65 88,74" fill="#4F46E5" />
          <rect x="85" y="15" width="6" height="8" rx="2" fill="#F59E0B" />
        </g>
        {/* 心形装饰 */}
        <path d="M35 70 C35 68, 37 66, 39 66 C41 66, 43 68, 43 70 C43 73, 39 76, 39 76 C39 76, 35 73, 35 70 Z" fill="#FCA5A5" opacity="0.6" />
        {/* 装饰 */}
        <circle cx="100" cy="22" r="4" fill="#FDE68A" opacity="0.5" />
        <circle cx="12" cy="80" r="3" fill="#A5B4FC" opacity="0.4" />
      </svg>
    ),
    // 成就：奖杯 + 星星
    achievements: (
      <svg viewBox="0 0 120 100" className="w-28 h-24 md:w-32 md:h-28 mx-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* 奖杯 */}
        <path d="M45 25 L45 55 C45 60, 50 65, 55 65 L65 65 C70 65, 75 60, 75 55 L75 25 Z" fill="#F59E0B" />
        <rect x="42" y="20" width="36" height="8" rx="3" fill="#D97706" />
        {/* 奖杯把手 */}
        <path d="M45 30 C35 30, 30 38, 32 48 C34 53, 40 55, 45 52" stroke="#D97706" strokeWidth="3" fill="none" />
        <path d="M75 30 C85 30, 90 38, 88 48 C86 53, 80 55, 75 52" stroke="#D97706" strokeWidth="3" fill="none" />
        {/* 奖杯底座 */}
        <rect x="52" y="65" width="16" height="6" rx="2" fill="#D97706" />
        <rect x="47" y="71" width="26" height="5" rx="2" fill="#B45309" />
        {/* 星星 */}
        <polygon points="60,28 63,36 71,36 65,41 67,49 60,44 53,49 55,41 49,36 57,36" fill="#FDE68A" />
        {/* 闪光 */}
        <line x1="25" y1="25" x2="28" y2="28" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="25" y1="28" x2="28" y2="25" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="95" y1="30" x2="98" y2="33" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="95" y1="33" x2="98" y2="30" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="18" cy="55" r="3" fill="#FDE68A" opacity="0.4" />
        <circle cx="102" cy="65" r="4" fill="#FDE68A" opacity="0.3" />
      </svg>
    ),
    // 计划：日历 + 目标
    plans: (
      <svg viewBox="0 0 120 100" className="w-28 h-24 md:w-32 md:h-28 mx-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* 日历 */}
        <rect x="22" y="22" width="60" height="55" rx="6" fill="#EEF2FF" stroke="#C7D2FE" strokeWidth="1.5" />
        {/* 日历顶部 */}
        <rect x="22" y="22" width="60" height="16" rx="6" fill="#6366F1" />
        <rect x="22" y="32" width="60" height="6" fill="#6366F1" />
        {/* 日历挂钩 */}
        <rect x="38" y="16" width="4" height="10" rx="2" fill="#4F46E5" />
        <rect x="62" y="16" width="4" height="10" rx="2" fill="#4F46E5" />
        {/* 日历格子 */}
        <circle cx="38" cy="48" r="3" fill="#E0E7FF" />
        <circle cx="52" cy="48" r="3" fill="#E0E7FF" />
        <circle cx="66" cy="48" r="3" fill="#E0E7FF" />
        <circle cx="38" cy="60" r="3" fill="#E0E7FF" />
        <circle cx="52" cy="60" r="3" fill="#6366F1" />
        <circle cx="66" cy="60" r="3" fill="#E0E7FF" />
        {/* 目标箭头 */}
        <g transform="rotate(-45, 95, 50)">
          <rect x="90" y="35" width="10" height="25" rx="3" fill="#F59E0B" />
          <polygon points="90,60 100,60 95,68" fill="#D97706" />
        </g>
        {/* 装饰 */}
        <circle cx="105" cy="25" r="4" fill="#FDE68A" opacity="0.5" />
        <circle cx="14" cy="65" r="3" fill="#C7D2FE" opacity="0.5" />
      </svg>
    ),
    // 通用：空盒子
    generic: (
      <svg viewBox="0 0 120 100" className="w-28 h-24 md:w-32 md:h-28 mx-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="28" y="35" width="55" height="40" rx="6" fill="#E0E7FF" stroke="#C7D2FE" strokeWidth="1.5" />
        <path d="M28 41 L55.5 30 L83 41" stroke="#A5B4FC" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="55.5" y1="30" x2="55.5" y2="75" stroke="#C7D2FE" strokeWidth="1" strokeDasharray="3 3" />
        {/* 问号 */}
        <text x="50" y="63" fill="#818CF8" fontSize="18" fontWeight="bold" fontFamily="serif">?</text>
        {/* 装饰 */}
        <circle cx="18" cy="30" r="4" fill="#C7D2FE" opacity="0.5" />
        <circle cx="100" cy="70" r="3" fill="#FDE68A" opacity="0.5" />
      </svg>
    ),
  }

  return <>{illustrations[scene]}</>
}

// ===== 场景对应的背景色 =====
const sceneBgClass: Record<Scene, string> = {
  tasks: 'bg-indigo-50/80 dark:bg-indigo-950/30',
  words: 'bg-indigo-50/80 dark:bg-indigo-950/30',
  practice: 'bg-indigo-50/80 dark:bg-indigo-950/30',
  diary: 'bg-violet-50/80 dark:bg-violet-950/30',
  achievements: 'bg-amber-50/80 dark:bg-amber-950/30',
  plans: 'bg-indigo-50/80 dark:bg-indigo-950/30',
  generic: 'bg-indigo-50/80 dark:bg-indigo-950/30',
}

export function EmptyState({
  scene = 'generic',
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className={`rounded-xl p-6 md:p-8 ${sceneBgClass[scene]} text-center`}>
      <Illustration scene={scene} />
      <h3 className="mt-3 text-[15px] md:text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 text-[13px] md:text-sm text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
