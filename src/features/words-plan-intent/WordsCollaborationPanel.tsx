import {
  ArrowRight,
  CircleHelp,
  PenLine,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { StudyPlan } from '@/lib/types'
import type { LexiCrossProductHandoffV1 } from '@/contracts/lexiCrossProduct'
import { WORDS_HUB_NEW_PLAN_ID } from './wordsHub'
import { WordsExecutionProgress } from './WordsExecutionProgress'
import { WordsPlanReceiptStatus } from './WordsPlanReceiptStatus'

type Props = {
  plans: readonly StudyPlan[]
  selectedPlan: StudyPlan | null
  selectedReceipt?: LexiCrossProductHandoffV1 | null
  userId: string | null
  preview?: boolean
  receiptLoading?: boolean
  receiptError?: string
  onSelectPlan: (planId: string) => void
  onRefreshReceipt?: () => void
  onDeletePlan: () => void
  onStartManual: () => void
  onStartAi: () => void
  onOpenPlans: () => void
}

export function WordsCollaborationPanel({
  plans,
  selectedPlan,
  selectedReceipt,
  userId,
  preview = false,
  receiptLoading,
  receiptError,
  onSelectPlan,
  onRefreshReceipt,
  onDeletePlan,
  onStartManual,
  onStartAi,
  onOpenPlans,
}: Props) {
  return (
    <section
      className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.055] via-surface-raised to-violet-500/[0.04] p-4 shadow-[0_10px_28px_-24px_oklch(0.45_0.2_275/0.4)] sm:p-5"
      aria-labelledby="words-collaboration-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-primary/20 bg-primary/10 text-primary" variant="outline">
              TRACKER × WORDS
            </Badge>
            <div className="flex items-center gap-1">
              <h2 id="words-collaboration-title" className="font-semibold tracking-tight sm:text-base">
                词汇计划中心
              </h2>
              <Popover>
                <PopoverTrigger
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="查看词汇计划生成说明"
                >
                  <CircleHelp className="size-4" aria-hidden="true" />
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="bottom"
                  className="w-[min(22rem,calc(100vw-2rem))] gap-3 p-3.5"
                >
                  <PopoverHeader>
                    <PopoverTitle>两种生成方式</PopoverTitle>
                    <PopoverDescription className="space-y-2 leading-5">
                      <span className="block"><strong className="font-medium text-foreground">自己填写：</strong>由你填写日期、目标词数与学习模式。</span>
                      <span className="block"><strong className="font-medium text-foreground">AI 生成：</strong>按需参考 Words 云端学习汇总，以及 Tracker 的近期进度、当天负荷和过往词汇计划表现。</span>
                      <span className="block">两种方式都会先保存一条 Tracker 词汇计划，再把日期、总词数、模式和真实计划编号发送给 Words。具体词书与单词仍在 Words 中确认。</span>
                    </PopoverDescription>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            新建或更新 Tracker 计划，再发送给 Words 执行。
          </p>
        </div>

        <Button type="button" variant="ghost" size="sm" onClick={onOpenPlans}>
          <Settings2 className="size-3.5" aria-hidden="true" />
          查看计划中心
        </Button>
      </div>

      <WordsExecutionProgress userId={userId} preview={preview} />

      <div className="mt-3 flex min-w-0 flex-col gap-1.5 rounded-xl border border-border/75 bg-background/65 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">保存方式</span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:max-w-sm">
          <Select
            value={selectedPlan?.id ?? WORDS_HUB_NEW_PLAN_ID}
            onValueChange={(value) => value && onSelectPlan(value)}
          >
            <SelectTrigger id="words-hub-plan" aria-label="选择新建或更新词汇计划" className="h-8 min-w-0 flex-1 bg-background">
              <SelectValue>{selectedPlan ? `更新：${selectedPlan.title}` : '新建词汇计划'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WORDS_HUB_NEW_PLAN_ID}>新建词汇计划</SelectItem>
              {plans.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>更新：{plan.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPlan && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDeletePlan}
              aria-label={`删除词汇计划：${selectedPlan.title}`}
              className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      {selectedPlan && (
        <WordsPlanReceiptStatus
          receipt={selectedReceipt}
          loading={receiptLoading}
          error={receiptError}
          onRefresh={onRefreshReceipt}
          className="mt-2.5"
        />
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          onClick={onStartManual}
          className="h-auto min-h-16 justify-start gap-3 whitespace-normal border-border/80 bg-background/85 p-3 text-left"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
            <PenLine className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">自己填写词汇计划</span>
            <span className="mt-0.5 block text-xs font-normal leading-5 text-muted-foreground">填写名称、日期、词数和用时</span>
          </span>
          <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Button>

        <Button
          type="button"
          onClick={onStartAi}
          className="h-auto min-h-16 justify-start gap-3 whitespace-normal p-3 text-left shadow-sm"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-foreground/15 text-primary-foreground">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">AI 生成词汇计划</span>
            <span className="mt-0.5 block text-xs font-normal leading-5 text-primary-foreground/80">综合 Words 与 Tracker 学习进度</span>
          </span>
          <ArrowRight className="size-4 text-primary-foreground/80" aria-hidden="true" />
        </Button>
      </div>
    </section>
  )
}
