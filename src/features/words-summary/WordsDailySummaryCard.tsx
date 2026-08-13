import { AlertCircle, ArrowUpRight, Cloud, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import type { WordsDailySummaryState } from './wordsDailySummary'

type WordsDailySummaryCardProps = {
  className?: string
  state: WordsDailySummaryState
  wordsUrl: string | null
  onRefresh: () => void
}

function formatDuration(durationMs: number): string {
  if (durationMs === 0) return '0 分钟'
  if (durationMs < 60_000) return '<1 分钟'
  return `${Math.max(1, Math.round(durationMs / 60_000)).toLocaleString('zh-CN')} 分钟`
}

function formatRefreshedAt(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-emerald-950/8 bg-white/72 px-3 py-3 dark:border-white/8 dark:bg-white/[0.035]">
      <p className="text-lg font-bold tabular-nums tracking-tight text-foreground md:text-xl">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

function WordsLink({ wordsUrl }: { wordsUrl: string | null }) {
  if (!wordsUrl) {
    return <p className="text-xs text-muted-foreground">Words 地址待配置</p>
  }

  return (
    <a
      href={wordsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      打开 Words
      <ArrowUpRight aria-hidden="true" />
    </a>
  )
}

export function WordsDailySummaryCard({
  className,
  state,
  wordsUrl,
  onRefresh,
}: WordsDailySummaryCardProps) {
  const summary = state.summary
  const refreshedAt = formatRefreshedAt(state.refreshedAt)

  return (
    <section aria-labelledby="words-daily-summary-title" className={className}>
      <Card className="overflow-hidden border-emerald-600/18 bg-[linear-gradient(135deg,color-mix(in_oklch,var(--card),#ecfdf5_58%),var(--card)_68%)] py-0 shadow-sm dark:border-emerald-300/12 dark:bg-[linear-gradient(135deg,color-mix(in_oklch,var(--card),#064e3b_18%),var(--card)_72%)]">
        <CardContent className="grid p-0 md:grid-cols-[minmax(13rem,0.72fr)_minmax(0,1.28fr)]">
          <div className="flex flex-col items-start border-b border-emerald-950/8 px-4 py-4 sm:px-5 md:border-b-0 md:border-r dark:border-white/8">
            <div className="flex items-center gap-3">
              <img
                src="/brand/lexi-words-icon.svg"
                alt=""
                aria-hidden="true"
                draggable={false}
                className="size-11 shrink-0 rounded-xl shadow-sm ring-1 ring-black/5"
              />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                  Lexi Words · 今日
                </p>
                <h2 id="words-daily-summary-title" className="mt-0.5 text-base font-semibold tracking-tight">
                  词汇学习摘要
                </h2>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              查看同一 Lexi 账号下的 Words 云端进度；Tracker 本地记录保持独立。
            </p>
            <div className="mt-4">
              <WordsLink wordsUrl={wordsUrl} />
            </div>
          </div>

          <div className="min-w-0 px-4 py-4 sm:px-5" aria-live="polite">
            <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
              <Badge variant="outline" className="border-emerald-600/20 bg-emerald-500/8 text-emerald-800 dark:text-emerald-200">
                Words 云端记录
              </Badge>
              {refreshedAt && (
                <span className="text-[11px] text-muted-foreground">{refreshedAt} 更新</span>
              )}
            </div>

            {state.status === 'ready' && summary ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <SummaryMetric label="今日练习" value={`${summary.attempts.toLocaleString('zh-CN')} 次`} />
                  <SummaryMetric label="今日通过" value={`${summary.passed.toLocaleString('zh-CN')} 次`} />
                  <SummaryMetric label="学习时长" value={formatDuration(summary.durationMs)} />
                  <SummaryMetric label="待复习" value={`${summary.dueWords.toLocaleString('zh-CN')} 词`} />
                </div>
                <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    云端词库 {summary.activeWordbooks.toLocaleString('zh-CN')} 本
                    <span aria-hidden="true"> · </span>
                    词汇 {summary.activeWords.toLocaleString('zh-CN')} 词
                    <span aria-hidden="true"> · </span>
                    已掌握 {summary.masteredWords.toLocaleString('zh-CN')} 词
                  </p>
                  <Button type="button" variant="ghost" size="xs" onClick={onRefresh} className="self-start sm:self-auto">
                    <RefreshCw aria-hidden="true" />
                    刷新摘要
                  </Button>
                </div>
              </>
            ) : state.status === 'loading' ? (
              <div aria-label="正在读取 Lexi Words 云端摘要">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-hidden="true">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className="h-[4.25rem] animate-pulse rounded-xl bg-emerald-950/7 dark:bg-white/6" />
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">正在读取今天的 Words 云端记录…</p>
              </div>
            ) : state.status === 'unavailable' ? (
              <div className="flex min-h-[5.4rem] flex-col items-start justify-center gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">暂时无法读取 Words 摘要</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">不会影响 Tracker 的本地学习记录和正常使用。</p>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
                  <RefreshCw aria-hidden="true" />
                  重试
                </Button>
              </div>
            ) : (
              <div className="flex min-h-[5.4rem] items-start gap-2.5 sm:items-center">
                <Cloud className="mt-0.5 size-4 shrink-0 text-muted-foreground sm:mt-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">登录同一 Lexi 账号后查看</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">仅显示 Words 已同步到云端的记录，本机未同步内容不会被误计入。</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
