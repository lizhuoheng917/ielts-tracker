import { useMemo } from 'react'
import { useAchievementStore } from '@/stores/achievementStore'
import { LEVELS, BADGES, XP_RULES } from '@/lib/constants'

const XP_RULES_LIST: { label: string; value: number }[] = [
  { label: '每日打卡', value: XP_RULES.DAILY_CHECKIN },
  { label: '每背诵 10 个单词', value: XP_RULES.WORDS_PER_10 },
  { label: '每 30 分钟练习', value: XP_RULES.PRACTICE_PER_30MIN },
  { label: '连续打卡 7 天以上额外奖励', value: XP_RULES.STREAK_BONUS_AFTER_7 },
  { label: '写一篇学习日记', value: XP_RULES.DIARY },
]

export default function Achievements() {
  // --- stable primitive selectors ---
  const totalXP = useAchievementStore((s) => s.totalXP)
  const currentLevel = useAchievementStore((s) => s.level)
  const unlockedBadges = useAchievementStore((s) => s.unlockedBadges)

  // --- derived level info ---
  const levelInfo = useMemo(() => {
    const cur = LEVELS.find((l) => l.level === currentLevel) ?? LEVELS[0]
    const next = LEVELS.find((l) => l.level === currentLevel + 1)

    if (!next) {
      return {
        name: cur.name,
        nextName: null as string | null,
        nextRequiredXP: null as number | null,
        progressXP: totalXP - cur.requiredXP,
        requiredXP: 0,
        percentage: 100,
        isMaxLevel: true,
      }
    }

    const progressXP = totalXP - cur.requiredXP
    const requiredXP = next.requiredXP - cur.requiredXP
    const percentage = Math.min(Math.max((progressXP / requiredXP) * 100, 0), 100)

    return {
      name: cur.name,
      nextName: next.name,
      nextRequiredXP: next.requiredXP,
      progressXP: Math.max(progressXP, 0),
      requiredXP,
      percentage,
      isMaxLevel: false,
    }
  }, [currentLevel, totalXP])

  const unlockedCount = unlockedBadges.length
  const totalCount = BADGES.length

  return (
    <div className="space-y-5 md:space-y-6 pb-8">
      {/* ---------- shimmer keyframes (rendered once) ---------- */}
      <style>{`
        @keyframes badge-glow {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.75; }
        }
        @keyframes progress-shine {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* ---------- page title ---------- */}
      <div>
        <h1 className="text-[22px] md:text-2xl font-bold">成就系统</h1>
        <p className="mt-1 text-[13px] md:text-sm text-muted-foreground">追踪你的学习进度与成就</p>
      </div>

      {/* ==================== LEVEL CARD ==================== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 p-4 md:p-6 text-white shadow-xl">
        {/* decorative blobs */}
        <div className="absolute -right-8 -top-8 h-28 w-28 md:h-36 md:w-36 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -left-6 h-20 w-20 md:h-28 md:w-28 rounded-full bg-white/[0.06]" />

        <div className="relative flex items-center gap-4 md:gap-5">
          {/* level number circle */}
          <div className="flex h-16 w-16 md:h-20 md:w-20 shrink-0 items-center justify-center rounded-full bg-white/20 text-3xl md:text-4xl font-extrabold backdrop-blur-sm ring-2 ring-white/30">
            {currentLevel}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-lg md:text-xl font-bold leading-tight">{levelInfo.name}</h2>
            <p className="mt-1 text-[13px] md:text-sm text-white/80">
              总经验值: <span className="font-semibold">{totalXP}</span> XP
            </p>
            {levelInfo.isMaxLevel ? (
              <p className="mt-0.5 text-[13px] md:text-sm font-medium text-yellow-200">
                已达到最高等级!
              </p>
            ) : (
              <p className="mt-0.5 text-[13px] md:text-sm text-white/70">
                距离{' '}
                <span className="font-semibold text-white">
                  {levelInfo.nextName}
                </span>{' '}
                还需 {levelInfo.nextRequiredXP! - totalXP} XP
              </p>
            )}
          </div>
        </div>

        {/* progress bar */}
        {!levelInfo.isMaxLevel && (
          <div className="relative mt-4 md:mt-5">
            <div className="mb-1.5 flex justify-between text-[12px]">
              <span className="text-white/70">
                {levelInfo.progressXP} / {levelInfo.requiredXP} XP
              </span>
              <span className="font-medium text-white/90">
                {Math.round(levelInfo.percentage)}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-200 via-amber-200 to-amber-300 transition-all duration-700 ease-out"
                style={{ width: `${levelInfo.percentage}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ==================== STATS SUMMARY ==================== */}
      <div className="grid grid-cols-2 gap-3">
        <div className="relative overflow-hidden rounded-xl p-3 md:p-4 text-center shadow-sm bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-200/50 dark:border-amber-800/30">
          <div className="absolute -right-3 -top-3 h-12 w-12 rounded-full bg-amber-200/40 dark:bg-amber-700/20 blur-lg" />
          <p className="relative text-xl md:text-2xl font-bold text-amber-600 dark:text-amber-400">
            {unlockedCount}
            <span className="text-sm md:text-base font-normal text-amber-500/70 dark:text-amber-400/60">
              /{totalCount}
            </span>
          </p>
          <p className="relative mt-1 text-[13px] md:text-xs text-amber-700/70 dark:text-amber-300/60">已解锁徽章</p>
        </div>
        <div className="relative overflow-hidden rounded-xl p-3 md:p-4 text-center shadow-sm bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/20 border border-indigo-200/50 dark:border-indigo-800/30">
          <div className="absolute -right-3 -top-3 h-12 w-12 rounded-full bg-indigo-200/40 dark:bg-indigo-700/20 blur-lg" />
          <p className="relative text-xl md:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {totalXP}
          </p>
          <p className="relative mt-1 text-[13px] md:text-xs text-indigo-700/70 dark:text-indigo-300/60">总经验值 (XP)</p>
        </div>
      </div>

      {/* ==================== XP RULES ==================== */}
      <div className="rounded-xl border bg-card p-4 md:p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm md:text-base font-semibold">
          <span className="text-base md:text-lg">⚡</span>
          经验值获取规则
        </h3>
        <ul className="space-y-2">
          {XP_RULES_LIST.map((rule) => (
            <li
              key={rule.label}
              className="flex items-center justify-between rounded-lg bg-muted/50 px-3 md:px-4 py-2 md:py-2.5 text-[13px] md:text-sm"
            >
              <span className="text-foreground/80">{rule.label}</span>
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                +{rule.value} XP
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ==================== BADGE WALL ==================== */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm md:text-base font-semibold">
          <span className="text-base md:text-lg">🏅</span>
          徽章墙
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
          {BADGES.map((badge, index) => {
            const isUnlocked = unlockedBadges.includes(badge.id)

            return (
              <div
                key={badge.id}
                className={`animate-stagger-up stagger-${(index % 8) + 1} relative overflow-hidden rounded-xl border p-3 md:p-4 text-center transition-all duration-300 hover:scale-105 active:scale-100 hover:shadow-md ${
                  isUnlocked
                    ? 'border-indigo-300/60 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/40 dark:border-indigo-700/50'
                    : 'border-border/40 bg-muted/20 opacity-50 grayscale'
                }`}
              >
                {/* glow border for unlocked badges */}
                {isUnlocked && (
                  <div
                    className="pointer-events-none absolute inset-0 rounded-xl border-2 border-indigo-400/40 dark:border-indigo-500/30"
                    style={{
                      animation: 'badge-glow 2.5s ease-in-out infinite',
                    }}
                  />
                )}

                <div className="relative">
                  <span
                    className={`text-2xl md:text-4xl ${
                      isUnlocked ? 'drop-shadow-sm' : 'grayscale opacity-40'
                    }`}
                  >
                    {badge.icon}
                  </span>

                  <p
                    className={`mt-1.5 md:mt-2 text-[13px] md:text-sm font-semibold leading-tight ${
                      isUnlocked ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {badge.name}
                  </p>

                  <p className="mt-1 line-clamp-2 text-[12px] md:text-xs leading-snug text-muted-foreground">
                    {badge.description}
                  </p>

                  <p
                    className={`mt-1.5 md:mt-2 text-[12px] md:text-xs font-medium ${
                      isUnlocked
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-muted-foreground/40'
                    }`}
                  >
                    {isUnlocked ? '已解锁' : '???'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
