import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Compass,
  Info,
  Lightbulb,
  ListChecks,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import type { DailySuggestionV2, LearningAnalysisV2 } from '@/ai/structuredOutputs'
import {
  calculateWritingOverallBand,
  type WritingFeedbackV2,
  type WritingSubmissionV2,
} from '@/ai/writingFeedback'
import { Badge } from '@/components/ui/badge'

const CATEGORY_LABELS: Record<DailySuggestionV2['actions'][number]['category'], string> = {
  vocabulary: '词汇',
  reading: '阅读',
  listening: '听力',
  writing: '写作',
  speaking: '口语',
  planning: '计划',
  review: '复盘',
}

const INSIGHT_LABELS: Record<LearningAnalysisV2['insights'][number]['type'], string> = {
  strength: '优势',
  risk: '需留意',
  pattern: '趋势',
}

const PRIORITY_LABELS: Record<LearningAnalysisV2['actions'][number]['priority'], string> = {
  high: '优先',
  medium: '随后',
  low: '可选',
}

function EvidenceAndLimitations({
  evidence,
  limitations,
}: {
  evidence?: string[]
  limitations: string[]
}) {
  if ((!evidence || evidence.length === 0) && limitations.length === 0) return null

  return (
    <div className="grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-2">
      {evidence && evidence.length > 0 && (
        <div className="rounded-lg bg-emerald-500/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden="true" />
            参考依据
          </p>
          <ul className="mt-1.5 space-y-1 text-xs leading-5 text-muted-foreground">
            {evidence.map((item, index) => <li key={`${item}-${index}`}>· {item}</li>)}
          </ul>
        </div>
      )}
      {limitations.length > 0 && (
        <div className="rounded-lg bg-amber-500/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Info className="size-3.5 text-amber-600" aria-hidden="true" />
            数据局限
          </p>
          <ul className="mt-1.5 space-y-1 text-xs leading-5 text-muted-foreground">
            {limitations.map((item, index) => <li key={`${item}-${index}`}>· {item}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

export function DailySuggestionContent({ value }: { value: DailySuggestionV2 }) {
  return (
    <section className="space-y-3" aria-label="今日 AI 学习建议">
      <div>
        <p className="text-base font-semibold tracking-tight text-foreground">{value.headline}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{value.summary}</p>
      </div>

      <div className="rounded-xl border border-primary/15 bg-primary/[0.045] p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Compass className="size-3.5" aria-hidden="true" />
            今日重点
          </p>
          <Badge variant="secondary" className="gap-1 text-[10px] font-medium">
            <Clock3 className="size-3" aria-hidden="true" />
            {value.focus.estimatedMinutes} 分钟
          </Badge>
        </div>
        <p className="mt-1.5 text-sm font-medium text-foreground">{value.focus.title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{value.focus.reason}</p>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ListChecks className="size-3.5" aria-hidden="true" />
          建议步骤
        </p>
        <ol className="space-y-2">
          {value.actions.map((action, index) => (
            <li key={`${action.title}-${index}`} className="flex gap-2.5 rounded-lg border border-border/60 p-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium text-foreground">{action.title}</p>
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                    {CATEGORY_LABELS[action.category]}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">{action.estimatedMinutes} 分钟</span>
                </div>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{action.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <EvidenceAndLimitations evidence={value.evidence} limitations={value.limitations} />
    </section>
  )
}

function insightVisual(type: LearningAnalysisV2['insights'][number]['type']) {
  if (type === 'strength') return { icon: TrendingUp, className: 'text-emerald-600 bg-emerald-500/10' }
  if (type === 'risk') return { icon: AlertTriangle, className: 'text-amber-600 bg-amber-500/10' }
  return { icon: BarChart3, className: 'text-indigo-600 bg-indigo-500/10' }
}

export function LearningAnalysisContent({ value }: { value: LearningAnalysisV2 }) {
  return (
    <article className="space-y-5" aria-label="AI 学习分析报告">
      <section className="rounded-xl border border-primary/15 bg-primary/[0.045] p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Sparkles className="size-3.5" aria-hidden="true" />
          分析结论
        </p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-foreground">{value.title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{value.conclusion}</p>
      </section>

      <section>
        <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <BarChart3 className="size-4 text-primary" aria-hidden="true" />
          关键发现
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {value.insights.map((insight, index) => {
            const visual = insightVisual(insight.type)
            const Icon = visual.icon
            return (
              <div key={`${insight.title}-${index}`} className="rounded-xl border border-border/70 p-3">
                <div className="flex items-start gap-2.5">
                  <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${visual.className}`}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium text-foreground">{insight.title}</p>
                      <span className="text-[10px] text-muted-foreground">{INSIGHT_LABELS[insight.type]}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{insight.finding}</p>
                    <p className="mt-1.5 rounded-md bg-muted/60 px-2 py-1 text-[11px] leading-4 text-muted-foreground">
                      依据：{insight.evidence}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Lightbulb className="size-4 text-primary" aria-hidden="true" />
          下一步行动
        </h3>
        <ol className="space-y-2">
          {value.actions.map((action, index) => (
            <li key={`${action.title}-${index}`} className="flex items-start gap-3 rounded-xl border border-border/70 px-3 py-2.5">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{action.title}</p>
                  <Badge variant={action.priority === 'high' ? 'default' : 'secondary'} className="h-5 px-1.5 text-[10px]">
                    {PRIORITY_LABELS[action.priority]}
                  </Badge>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock3 className="size-3" aria-hidden="true" />
                    {action.estimatedMinutes} 分钟
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{action.reason}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <EvidenceAndLimitations limitations={value.limitations} />
    </article>
  )
}

type WritingCriterion = WritingFeedbackV2['criteria']['task']

const WRITING_CRITERION_LABELS = {
  task: {
    task_achievement: '任务完成',
    task_response: '任务回应',
  },
  coherenceCohesion: '连贯与衔接',
  lexicalResource: '词汇资源',
  grammaticalRangeAccuracy: '语法多样性与准确性',
} as const

function formatWritingBand(band: number): string {
  return Number.isInteger(band) ? band.toFixed(0) : band.toFixed(1)
}

function WritingCriterionRow({
  criterion,
  label,
  showBand,
}: {
  criterion: WritingCriterion
  label: string
  showBand: boolean
}) {
  return (
    <div className="space-y-2 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {showBand && criterion.band !== null && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-primary" aria-label={`${label} ${formatWritingBand(criterion.band)} 分`}>
            {formatWritingBand(criterion.band)}
          </span>
        )}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{criterion.summary}</p>
      {criterion.evidence.length > 0 && (
        <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
          {criterion.evidence.map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-1.5">
              <span className="text-primary" aria-hidden="true">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="border-l-2 border-primary/25 pl-2.5 text-xs leading-5 text-foreground/85">
        <span className="font-medium text-primary">改进：</span>{criterion.improvement}
      </p>
    </div>
  )
}

export function WritingFeedbackContent({
  feedback,
  submission,
  overallBand: suppliedOverallBand,
}: {
  feedback: WritingFeedbackV2
  submission: WritingSubmissionV2
  overallBand?: ReturnType<typeof calculateWritingOverallBand>
}) {
  const value = feedback
  const isScored = value.assessmentStatus === 'scored'
  const calculatedOverallBand = isScored ? calculateWritingOverallBand(value) : null
  const overallBand = suppliedOverallBand === calculatedOverallBand
    ? suppliedOverallBand
    : calculatedOverallBand
  const taskLabel = submission.task === 'task1' ? 'Task 1' : 'Task 2'
  const moduleLabel = submission.module === 'academic' ? 'Academic' : 'General Training'
  const taskCriterionLabel = WRITING_CRITERION_LABELS.task[value.taskCriterion]

  const criteria = [
    { key: 'task', label: taskCriterionLabel, value: value.criteria.task },
    { key: 'coherence', label: WRITING_CRITERION_LABELS.coherenceCohesion, value: value.criteria.coherenceCohesion },
    { key: 'lexical', label: WRITING_CRITERION_LABELS.lexicalResource, value: value.criteria.lexicalResource },
    { key: 'grammar', label: WRITING_CRITERION_LABELS.grammaticalRangeAccuracy, value: value.criteria.grammaticalRangeAccuracy },
  ]

  return (
    <article className="space-y-5" aria-label="AI 写作反馈报告">
      <header className="border-b border-border/70 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="secondary" className="font-medium">{moduleLabel} · {taskLabel}</Badge>
            <span>{submission.wordCount} 词</span>
          </div>
          {isScored && overallBand !== null ? (
            <p className="flex items-baseline gap-1.5 text-sm text-muted-foreground">
              总体分
              <span className="text-2xl font-semibold tabular-nums text-primary">{formatWritingBand(overallBand)}</span>
            </p>
          ) : (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="size-3" aria-hidden="true" />
              证据不足
            </Badge>
          )}
        </div>
        <p className="mt-3 text-sm leading-6 text-foreground">{value.summary}</p>
        <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
          基于公开评分标准的学习估分，不是 IELTS 官方成绩。
        </p>
        <div className="mt-3 border-l-2 border-border pl-3">
          <p className="text-[11px] font-medium text-muted-foreground">作文题目</p>
          <p className="mt-1 text-xs leading-5 text-foreground/85">
            {submission.promptText || '未提供题目'}
          </p>
          {submission.sourceMaterial.kind === 'text_description' && (
            <>
              <p className="mt-2 text-[11px] font-medium text-muted-foreground">图表材料描述</p>
              <p className="mt-1 text-xs leading-5 text-foreground/85">
                {submission.sourceMaterial.description}
              </p>
            </>
          )}
        </div>
      </header>

      <section aria-label={isScored ? '四项评分' : '评分维度反馈'}>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <BarChart3 className="size-4 text-primary" aria-hidden="true" />
          {isScored ? '四项评分' : '评分维度反馈'}
        </h3>
        <div className="divide-y divide-border/70 rounded-lg border border-border/70">
          {criteria.map((criterion) => (
            <WritingCriterionRow
              key={criterion.key}
              criterion={criterion.value}
              label={criterion.label}
              showBand={isScored}
            />
          ))}
        </div>
      </section>

      {value.strengths.length > 0 && (
        <section className="border-t border-border/70 pt-4" aria-label="写作优势">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
            写作优势
          </h3>
          <ul className="divide-y divide-border/60">
            {value.strengths.map((strength, index) => (
              <li key={`${strength.title}-${index}`} className="py-2 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-foreground">{strength.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{strength.evidence}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {value.priorities.length > 0 && (
        <section className="border-t border-border/70 pt-4" aria-label="优先行动">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <ListChecks className="size-4 text-primary" aria-hidden="true" />
            优先行动
          </h3>
          <ol className="space-y-3">
            {value.priorities.map((priority, index) => (
              <li key={`${priority.title}-${index}`} className="flex gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{priority.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{priority.reason}</p>
                  <p className="mt-1 text-xs leading-5 text-foreground/85">
                    <span className="font-medium text-primary">例如：</span>{priority.example}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {value.paragraphFeedback.length > 0 && (
        <section className="border-t border-border/70 pt-4" aria-label="段落点评">
          <h3 className="mb-2 text-sm font-semibold text-foreground">段落点评</h3>
          <ol className="divide-y divide-border/60">
            {value.paragraphFeedback.map((paragraph) => (
              <li key={paragraph.paragraphIndex} className="grid gap-1 py-2.5 first:pt-0 sm:grid-cols-[5.5rem_1fr] sm:gap-3">
                <p className="text-xs font-medium text-primary">第 {paragraph.paragraphIndex} 段</p>
                <div>
                  <p className="text-sm leading-6 text-foreground">{paragraph.summary}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">依据：{paragraph.evidence}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {value.corrections.length > 0 && (
        <section className="border-t border-border/70 pt-4" aria-label="修订示例">
          <h3 className="mb-2 text-sm font-semibold text-foreground">修订示例</h3>
          <div className="divide-y divide-border/60">
            {value.corrections.map((correction, index) => (
              <div key={`${correction.original}-${index}`} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                <p className="text-xs leading-5 text-muted-foreground">
                  <span className="font-medium">原句：</span>{correction.original}
                </p>
                <p className="text-sm leading-6 text-foreground">
                  <span className="font-medium text-primary">建议改写：</span>{correction.revision}
                </p>
                <p className="text-xs leading-5 text-muted-foreground">{correction.reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {value.limitations.length > 0 && (
        <section className="border-t border-border/70 pt-4" aria-label="评分局限">
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 px-3 py-2.5">
            <Info className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium text-foreground">评分局限</p>
              <ul className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
                {value.limitations.map((item, index) => <li key={`${item}-${index}`}>· {item}</li>)}
              </ul>
            </div>
          </div>
        </section>
      )}
    </article>
  )
}
