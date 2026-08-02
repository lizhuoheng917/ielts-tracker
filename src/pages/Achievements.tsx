import { useMemo } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Crown,
  LockKeyhole,
  Trophy,
  Zap,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { AchievementMark } from '@/components/achievements/achievement-mark'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { BADGES, LEVELS, XP_RULES } from '@/lib/constants'
import type { Achievement } from '@/lib/types'
import { useAchievementStore } from '@/stores/achievementStore'

const XP_RULES_LIST: { label: string; value: number }[] = [
  { label: '每日打卡', value: XP_RULES.DAILY_CHECKIN },
  { label: '每背诵 10 个单词', value: XP_RULES.WORDS_PER_10 },
  { label: '每 30 分钟练习', value: XP_RULES.PRACTICE_PER_30MIN },
  { label: '连续打卡 7 天以上额外奖励', value: XP_RULES.STREAK_BONUS_AFTER_7 },
  { label: '写一篇学习日记', value: XP_RULES.DIARY },
]

function AchievementBadgeCard({
  badge,
  isUnlocked,
}: {
  badge: Achievement
  isUnlocked: boolean
}) {
  return (
    <li className="min-w-0">
      <article
        className={`relative flex h-full min-h-44 flex-col rounded-xl border p-3.5 md:min-h-48 md:p-4 ${
          isUnlocked
            ? 'border-primary/25 bg-[linear-gradient(145deg,var(--surface-raised),var(--subject-listening-soft))] shadow-[0_8px_24px_-20px_var(--primary)]'
            : 'border-border/80 bg-surface-subtle/70'
        }`}
        aria-label={`${badge.name}，${isUnlocked ? '已解锁' : '尚未解锁'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <AchievementMark achievementId={badge.id} isUnlocked={isUnlocked} size="lg" />
          <Badge
            variant={isUnlocked ? 'secondary' : 'outline'}
            className={
              isUnlocked
                ? 'bg-success-surface text-success'
                : 'text-muted-foreground'
            }
          >
            {isUnlocked ? (
              <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
            ) : (
              <LockKeyhole data-icon="inline-start" aria-hidden="true" />
            )}
            {isUnlocked ? '已解锁' : '未解锁'}
          </Badge>
        </div>

        <div className="mt-4 flex flex-1 flex-col">
          <h3 className="text-sm font-semibold leading-5 text-foreground md:text-[15px]">
            {badge.name}
          </h3>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground md:text-[13px]">
            {badge.description}
          </p>
          <p className="mt-auto pt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
            {isUnlocked ? 'Milestone complete' : 'Next milestone'}
          </p>
        </div>
      </article>
    </li>
  )
}

export default function Achievements() {
  const totalXP = useAchievementStore((state) => state.totalXP)
  const currentLevel = useAchievementStore((state) => state.level)
  const unlockedBadges = useAchievementStore((state) => state.unlockedBadges)
  const displayXP = Math.max(totalXP, 0)

  const levelInfo = useMemo(() => {
    const current = LEVELS.find((level) => level.level === currentLevel) ?? LEVELS[0]
    const next = LEVELS.find((level) => level.level === currentLevel + 1)

    if (!next) {
      return {
        name: current.name,
        nextName: null as string | null,
        nextRequiredXP: null as number | null,
        progressXP: displayXP - current.requiredXP,
        requiredXP: 0,
        percentage: 100,
        isMaxLevel: true,
      }
    }

    const progressXP = displayXP - current.requiredXP
    const requiredXP = next.requiredXP - current.requiredXP
    const percentage = Math.min(Math.max((progressXP / requiredXP) * 100, 0), 100)

    return {
      name: current.name,
      nextName: next.name,
      nextRequiredXP: next.requiredXP,
      progressXP: Math.max(progressXP, 0),
      requiredXP,
      percentage,
      isMaxLevel: false,
    }
  }, [currentLevel, displayXP])

  const unlockedBadgeSet = useMemo(() => new Set(unlockedBadges), [unlockedBadges])
  const unlockedBadgeDefinitions = useMemo(
    () => BADGES.filter((badge) => unlockedBadgeSet.has(badge.id)),
    [unlockedBadgeSet],
  )
  const lockedBadgeDefinitions = useMemo(
    () => BADGES.filter((badge) => !unlockedBadgeSet.has(badge.id)),
    [unlockedBadgeSet],
  )

  const unlockedCount = unlockedBadges.length
  const totalCount = BADGES.length
  const badgeCompletion = Math.min(Math.round((unlockedCount / totalCount) * 100), 100)
  const remainingXP = levelInfo.nextRequiredXP === null
    ? 0
    : Math.max(levelInfo.nextRequiredXP - displayXP, 0)

  return (
    <div className="space-y-5 pb-8 md:space-y-6">
      <PageHeader
        eyebrow="Learning milestones"
        title="成就中心"
        description="把每一次打卡和练习沉淀成等级进度，清楚看到已经达成与尚待挑战的里程碑。"
        icon={<Trophy />}
      />

      <section aria-labelledby="level-overview-title">
        <Card className="relative isolate overflow-hidden border-primary/20 bg-[linear-gradient(135deg,var(--primary),var(--subject-listening))] text-primary-foreground shadow-[0_20px_50px_-32px_var(--primary)]">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-24 size-64 rounded-full border-[32px] border-primary-foreground/10"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-28 right-1/4 size-48 rounded-full bg-primary-foreground/5"
          />
          <CardContent className="relative grid gap-6 py-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-10 md:py-2">
            <div className="min-w-0">
              <Badge className="border border-primary-foreground/20 bg-primary-foreground/15 text-primary-foreground">
                <Crown data-icon="inline-start" aria-hidden="true" />
                当前等级
              </Badge>
              <div className="mt-4 flex items-center gap-3 md:gap-4">
                <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary-foreground/15 text-2xl font-bold tabular-nums ring-1 ring-primary-foreground/25 md:size-16 md:text-3xl">
                  {currentLevel}
                </div>
                <div className="min-w-0">
                  <h2 id="level-overview-title" className="text-xl font-bold leading-tight md:text-2xl">
                    {levelInfo.name}
                  </h2>
                  <p className="mt-1 text-sm text-primary-foreground/75">
                    {levelInfo.isMaxLevel
                      ? '你已经到达当前等级上限'
                      : `再获得 ${remainingXP} XP 即可晋级 ${levelInfo.nextName}`}
                  </p>
                </div>
              </div>

              <div className="mt-5 max-w-2xl">
                <div className="mb-2 flex items-center justify-between gap-4 text-xs font-medium tabular-nums text-primary-foreground/80">
                  <span>
                    {levelInfo.isMaxLevel
                      ? `${displayXP} XP · 最高等级`
                      : `${levelInfo.progressXP} / ${levelInfo.requiredXP} XP`}
                  </span>
                  <span>{Math.round(levelInfo.percentage)}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={levelInfo.isMaxLevel ? '等级进度，已达到最高等级' : `通往 ${levelInfo.nextName} 的等级进度`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(levelInfo.percentage)}
                  aria-valuetext={levelInfo.isMaxLevel ? '已达到最高等级' : `${Math.round(levelInfo.percentage)}%，还需 ${remainingXP} XP`}
                  className="h-2.5 overflow-hidden rounded-full bg-primary-foreground/20 ring-1 ring-primary-foreground/10"
                >
                  <div
                    className="h-full rounded-full bg-primary-foreground shadow-[0_0_16px_var(--primary-foreground)]"
                    style={{ width: `${levelInfo.percentage}%` }}
                  />
                </div>

                <dl className="mt-4 grid max-w-lg grid-cols-2 overflow-hidden rounded-xl border border-primary-foreground/15 bg-primary-foreground/10 text-primary-foreground">
                  <div className="min-w-0 px-3 py-2.5 sm:px-4">
                    <dt className="text-[11px] font-medium text-primary-foreground/65">累计经验</dt>
                    <dd className="mt-0.5 truncate text-base font-bold tabular-nums sm:text-lg">
                      {displayXP.toLocaleString('zh-CN')} <span className="text-xs font-medium text-primary-foreground/70">XP</span>
                    </dd>
                  </div>
                  <div className="min-w-0 border-l border-primary-foreground/15 px-3 py-2.5 sm:px-4">
                    <dt className="text-[11px] font-medium text-primary-foreground/65">徽章进度</dt>
                    <dd className="mt-0.5 truncate text-base font-bold tabular-nums sm:text-lg">
                      {unlockedCount}/{totalCount}
                      <span className="ml-1.5 text-xs font-medium text-primary-foreground/70">{badgeCompletion}%</span>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="hidden size-28 place-items-center rounded-[2rem] border border-primary-foreground/15 bg-primary-foreground/10 text-primary-foreground/90 backdrop-blur-sm md:grid lg:size-32">
              <Trophy aria-hidden="true" className="size-14 stroke-[1.35] lg:size-16" />
            </div>
          </CardContent>
        </Card>
      </section>

      <Card size="sm">
        <CardContent>
          <details className="group/rules">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-lg outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-ring/45">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning-surface text-warning">
                <Zap className="size-4.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">经验值获取规则</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">查看日常学习动作对应的 XP 奖励</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/rules:rotate-180" aria-hidden="true" />
            </summary>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="经验值获取规则列表">
              {XP_RULES_LIST.map((rule) => (
                <li
                  key={rule.label}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border/70 bg-surface-subtle/65 px-3 py-2"
                >
                  <span className="text-[13px] leading-5 text-foreground/80 md:text-sm">
                    {rule.label}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-primary">
                    +{rule.value} XP
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </CardContent>
      </Card>

      <section aria-labelledby="unlocked-badges-title" className="space-y-3.5">
        <SectionHeader
          title={`已解锁徽章 · ${unlockedBadgeDefinitions.length}`}
          titleId="unlocked-badges-title"
          description="这些里程碑已经完成，会一直保留在你的徽章墙中。"
        />
        {unlockedBadgeDefinitions.length > 0 ? (
          <ul className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 sm:grid-cols-3 md:gap-3 xl:grid-cols-4">
            {unlockedBadgeDefinitions.map((badge) => (
              <AchievementBadgeCard key={badge.id} badge={badge} isUnlocked />
            ))}
          </ul>
        ) : (
          <EmptyState
            scene="achievements"
            density="compact"
            title="第一枚徽章正在路上"
            description="完成一次每日打卡，就能点亮你的首个学习里程碑。"
          />
        )}
      </section>

      <section aria-labelledby="locked-badges-title" className="space-y-3.5">
        <SectionHeader
          title={`待解锁徽章 · ${lockedBadgeDefinitions.length}`}
          titleId="locked-badges-title"
          description="从容易达成的目标开始，逐步扩展到连续学习与全科覆盖。"
        />
        {lockedBadgeDefinitions.length > 0 ? (
          <ul className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 sm:grid-cols-3 md:gap-3 xl:grid-cols-4">
            {lockedBadgeDefinitions.map((badge) => (
              <AchievementBadgeCard key={badge.id} badge={badge} isUnlocked={false} />
            ))}
          </ul>
        ) : (
          <EmptyState
            scene="achievements"
            density="compact"
            title="全部徽章已解锁"
            description="你已经完成当前所有里程碑，继续保持这份学习节奏。"
          />
        )}
      </section>
    </div>
  )
}
