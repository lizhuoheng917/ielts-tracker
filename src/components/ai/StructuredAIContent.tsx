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
  formatWritingSourceReference,
  type WritingFeedbackV2,
  type WritingSubmission,
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

const PROMPT_COVERAGE_LABELS: Record<NonNullable<WritingFeedbackV2['deepAnalysis']>['promptCoverage'][number]['status'], string> = {
  met: '已回应',
  partial: '部分回应',
  missing: '尚未回应',
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
    <div className="px-3.5 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{criterion.summary}</p>
        </div>
        {showBand && criterion.band !== null && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-lg font-semibold tabular-nums text-primary" aria-label={`${label} ${formatWritingBand(criterion.band)} 分`}>
            {formatWritingBand(criterion.band)}
          </span>
        )}
      </div>
      <div className="mt-3 grid gap-2 text-sm leading-6 sm:grid-cols-2">
        {criterion.evidence.length > 0 && (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">依据：</span>{criterion.evidence.join(' · ')}
          </p>
        )}
        <p className="text-foreground/85">
          <span className="font-medium text-primary">下一步：</span>{criterion.improvement}
        </p>
      </div>
    </div>
  )
}

export function WritingFeedbackContent({
  feedback,
  submission,
  overallBand: suppliedOverallBand,
}: {
  feedback: WritingFeedbackV2
  submission: WritingSubmission
  overallBand?: ReturnType<typeof calculateWritingOverallBand>
}) {
  const value = feedback
  const isScored = value.assessmentStatus === 'scored'
  const calculatedOverallBand = isScored ? calculateWritingOverallBand(value) : null
  const overallBand = suppliedOverallBand === calculatedOverallBand
    ? suppliedOverallBand
    : calculatedOverallBand
  // Artifact parsing materializes legacy records to null. Keep this fallback
  // here too so an older in-memory report never renders a misleading label.
  const estimatedOverallBand = value.estimatedOverallBand ?? null
  const displayedOverallBand = estimatedOverallBand ?? overallBand
  const displayedOverallLabel = estimatedOverallBand !== null
    ? 'AI 预估总分'
    : '总体分'
  const taskLabel = submission.task === 'task1' ? 'Task 1' : 'Task 2'
  const moduleLabel = submission.module === 'academic' ? 'Academic' : 'General Training'
  const taskCriterionLabel = WRITING_CRITERION_LABELS.task[value.taskCriterion]
  const automaticReference = submission.schemaVersion === 3
  const deepSubmission = submission.schemaVersion === 4

  // The reference-only writing flow deliberately avoids criterion-level
  // scoring, paragraph-by-paragraph claims, and a long evidence report. Its
  // single text-only estimate is explicitly labeled, so it remains a useful
  // fallback rather than looking like a full verified scoring report.
  if (!isScored) {
    return (
      <article className="space-y-4" aria-label="AI 写作快速改进建议">
        <section className="rounded-xl border border-primary/15 bg-primary/[0.045] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">快速改进建议</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">本次不提供分维度评分或逐段判断，先聚焦最值得立刻修改的地方。</p>
              </div>
            </div>
            {estimatedOverallBand !== null && (
              <div className="shrink-0 rounded-xl bg-background/85 px-3 py-2 text-right shadow-sm">
                <span className="block text-xs font-medium text-muted-foreground">AI 预估总分</span>
                <strong
                  className="block text-2xl font-semibold tabular-nums text-primary"
                  aria-label={`AI 预估总分 ${formatWritingBand(estimatedOverallBand)} 分`}
                >
                  {formatWritingBand(estimatedOverallBand)}
                </strong>
                <span className="block text-[11px] text-muted-foreground">仅供参考</span>
              </div>
            )}
          </div>
          <p className="mt-4 text-base leading-7 text-foreground">{value.summary}</p>
        </section>

        {value.priorities.length > 0 && (
          <section className="rounded-xl border border-border/70 bg-card p-4" aria-label="优先行动">
            <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
              <ListChecks className="size-5 text-primary" aria-hidden="true" />
              现在这样修改
            </h3>
            <ol className="space-y-3">
              {value.priorities.slice(0, 2).map((priority, index) => (
                <li key={`${priority.title}-${index}`} className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-medium text-foreground">{priority.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{priority.reason}</p>
                    <p className="mt-2 text-sm leading-6 text-foreground/85"><span className="font-medium text-primary">例如：</span>{priority.example}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </article>
    )
  }

  const criteria = [
    { key: 'task', label: taskCriterionLabel, value: value.criteria.task },
    { key: 'coherence', label: WRITING_CRITERION_LABELS.coherenceCohesion, value: value.criteria.coherenceCohesion },
    { key: 'lexical', label: WRITING_CRITERION_LABELS.lexicalResource, value: value.criteria.lexicalResource },
    { key: 'grammar', label: WRITING_CRITERION_LABELS.grammaticalRangeAccuracy, value: value.criteria.grammaticalRangeAccuracy },
  ]

  return (
    <article className="space-y-5" aria-label="AI 写作反馈报告">
      <header className="rounded-xl border border-primary/15 bg-primary/[0.035] p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{moduleLabel} · {taskLabel}</span>
              <span>英文 {submission.wordCount} 词</span>
              {automaticReference && (
                <span className="font-medium text-primary">题目自动识别 · 参考评估</span>
              )}
            </div>
            <p className="mt-3 text-base leading-7 text-foreground">{value.summary}</p>
          </div>
          {isScored && displayedOverallBand !== null ? (
            <div className="flex min-w-24 items-center gap-2 rounded-xl bg-background/80 px-3 py-2.5 shadow-sm sm:flex-col sm:items-end sm:gap-0.5">
              <span className="text-sm font-medium text-muted-foreground">{displayedOverallLabel}</span>
              <strong
                className="text-3xl font-semibold tabular-nums text-primary"
                aria-label={`${displayedOverallLabel} ${formatWritingBand(displayedOverallBand)} 分`}
              >
                {formatWritingBand(displayedOverallBand)}
              </strong>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm font-medium text-amber-800 dark:text-amber-200">
              <AlertTriangle className="size-4" aria-hidden="true" />
              证据不足
            </div>
          )}
        </div>

        <details className="mt-4 border-t border-primary/15 pt-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">查看评分说明与题目参考</summary>
          <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
            <p>基于公开评分标准的学习估分，不是 IELTS 官方成绩。</p>
            {automaticReference ? (
              <div>
                <p className="font-medium text-foreground">题目引用</p>
                <p className="mt-1 text-foreground/85">{formatWritingSourceReference(submission)}</p>
                <p className="mt-1">AI 会按此引用尝试识别题目，结果可能与原题不完全一致。</p>
                {submission.module === 'academic' && submission.task === 'task1' && (
                  <p className="mt-2 text-amber-800 dark:text-amber-200">未提供原图，Task Achievement 仅作参考；本报告以语言、结构和表达反馈为主。</p>
                )}
              </div>
            ) : deepSubmission ? (
              <div>
                <p className="font-medium text-foreground">深度分析题目</p>
                <p className="mt-1 text-foreground/85">
                  {submission.promptSource.kind === 'text'
                    ? submission.promptSource.text
                    : '题目图片仅用于本次请求，未保存。'}
                </p>
                <p className="mt-1">
                  {submission.promptSource.kind === 'text' && submission.promptSource.origin === 'recognized_image'
                    ? '图片题目已识别；报告只保留识别出的文字。'
                    : '本次使用用户提供的完整题目进行深度分析。'}
                </p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-foreground">作文题目</p>
                <p className="mt-1 text-foreground/85">{submission.promptText || '未提供题目'}</p>
                {submission.sourceMaterial.kind === 'text_description' && (
                  <>
                    <p className="mt-3 font-medium text-foreground">图表材料描述</p>
                    <p className="mt-1 text-foreground/85">{submission.sourceMaterial.description}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </details>
      </header>

      <section aria-label={isScored ? '四项评分' : '评分维度反馈'}>
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
          <BarChart3 className="size-5 text-primary" aria-hidden="true" />
          {isScored ? '四项评分' : '评分维度反馈'}
        </h3>
        <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card">
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
        <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.035] p-4" aria-label="写作优势">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
            写作优势
          </h3>
          <ul className="space-y-3">
            {value.strengths.map((strength, index) => (
              <li key={`${strength.title}-${index}`}>
                <p className="text-base font-medium text-foreground">{strength.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{strength.evidence}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {value.priorities.length > 0 && (
        <section className="rounded-xl border border-primary/15 bg-primary/[0.045] p-4" aria-label="优先行动">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <ListChecks className="size-5 text-primary" aria-hidden="true" />
            优先行动
          </h3>
          <ol className="space-y-3">
            {value.priorities.map((priority, index) => (
              <li key={`${priority.title}-${index}`} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-base font-medium text-foreground">{priority.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{priority.reason}</p>
                  <p className="mt-2 text-sm leading-6 text-foreground/85">
                    <span className="font-medium text-primary">例如：</span>{priority.example}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {value.deepAnalysis && (
        <section className="overflow-hidden rounded-xl border border-violet-500/20 bg-violet-500/[0.025]" aria-label="深度诊断">
          <div className="flex items-start gap-3 border-b border-violet-500/15 px-4 py-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-700 dark:text-violet-300">
              <Compass className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-foreground">深度诊断</h3>
              <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{value.deepAnalysis.promptRecognition.note}</p>
            </div>
          </div>
          <div className="border-b border-violet-500/15 px-4 py-4">
            <h4 className="text-sm font-semibold text-foreground">题目回应度</h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {value.deepAnalysis.promptCoverage.map((item, index) => (
                <article key={`${item.requirement}-${index}`} className="rounded-lg bg-background/80 p-3 text-sm leading-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium text-foreground">{item.requirement}</p>
                    <Badge variant={item.status === 'met' ? 'secondary' : 'outline'} className="shrink-0 text-xs">
                      {PROMPT_COVERAGE_LABELS[item.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">{item.finding}</p>
                  {item.evidence && <p className="mt-1 text-muted-foreground">依据：{item.evidence}</p>}
                  <p className="mt-1 text-foreground/85"><span className="font-medium text-violet-700 dark:text-violet-300">下一步：</span>{item.nextStep}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="grid gap-0 divide-y divide-border/60 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <div className="p-4">
              <h4 className="text-sm font-semibold text-foreground">论证结构</h4>
              <ol className="mt-3 space-y-3">
                {value.deepAnalysis.argumentMap.map((paragraph) => (
                  <li key={paragraph.paragraphIndex} className="text-sm leading-6">
                    <p className="font-medium text-foreground">第 {paragraph.paragraphIndex} 段 · {paragraph.role}</p>
                    <p className="text-muted-foreground">{paragraph.contribution}</p>
                    <p className="text-foreground/85"><span className="font-medium text-violet-700 dark:text-violet-300">缺口：</span>{paragraph.gap}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="p-4">
              <h4 className="text-sm font-semibold text-foreground">反复出现的模式</h4>
              <ul className="mt-3 space-y-3">
                {value.deepAnalysis.recurringPatterns.map((pattern, index) => (
                  <li key={`${pattern.type}-${index}`} className="text-sm leading-6">
                    <p className="font-medium text-foreground">{pattern.finding}</p>
                    <p className="text-muted-foreground">依据：{pattern.evidence}</p>
                    <p className="text-foreground/85"><span className="font-medium text-violet-700 dark:text-violet-300">修正：</span>{pattern.fix}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-violet-500/15 px-4 py-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground"><TrendingUp className="size-4 text-violet-600" aria-hidden="true" />建议重写顺序</h4>
            <ol className="mt-3 grid gap-2 sm:grid-cols-3">
              {[...value.deepAnalysis.rewritePlan].sort((left, right) => left.priority - right.priority).map((item) => (
                <li key={item.priority} className="rounded-lg bg-background/80 p-3 text-sm leading-6">
                  <p className="font-medium text-foreground">{item.priority}. {item.action}</p>
                  <p className="mt-1 text-muted-foreground">完成标准：{item.successCheck}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {(value.paragraphFeedback.length > 0 || value.corrections.length > 0 || value.limitations.length > 0) && (
        <details className="overflow-hidden rounded-xl border border-border/70">
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-base font-semibold text-foreground">
            <span>查看逐段点评与修订</span>
            <span className="text-sm font-normal text-muted-foreground">展开</span>
          </summary>
          <div className="space-y-5 border-t border-border/70 px-4 py-4">
            {value.paragraphFeedback.length > 0 && (
              <section aria-label="段落点评">
                <h3 className="mb-3 text-base font-semibold text-foreground">段落点评</h3>
                <ol className="space-y-3">
                  {value.paragraphFeedback.map((paragraph) => (
                    <li key={paragraph.paragraphIndex} className="rounded-lg bg-muted/40 px-3 py-3">
                      <p className="text-sm font-semibold text-primary">第 {paragraph.paragraphIndex} 段</p>
                      <p className="mt-1 text-sm leading-6 text-foreground">{paragraph.summary}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground"><span className="font-medium text-foreground">依据：</span>{paragraph.evidence}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {value.corrections.length > 0 && (
              <section aria-label="修订示例">
                <h3 className="mb-3 text-base font-semibold text-foreground">修订示例</h3>
                <div className="space-y-3">
                  {value.corrections.map((correction, index) => (
                    <div key={`${correction.original}-${index}`} className="rounded-lg border border-border/70 px-3 py-3">
                      <p className="text-sm leading-6 text-muted-foreground"><span className="font-medium text-foreground">原句：</span>{correction.original}</p>
                      <p className="mt-2 text-sm leading-6 text-foreground"><span className="font-medium text-primary">建议改写：</span>{correction.revision}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{correction.reason}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {value.limitations.length > 0 && (
              <section aria-label="评分局限" className="rounded-lg bg-amber-500/5 px-3 py-3">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                  <div>
                    <p className="text-base font-medium text-foreground">评分局限</p>
                    <ul className="mt-1.5 space-y-1 text-sm leading-6 text-muted-foreground">
                      {value.limitations.map((item, index) => <li key={`${item}-${index}`}>· {item}</li>)}
                    </ul>
                  </div>
                </div>
              </section>
            )}
          </div>
        </details>
      )}
    </article>
  )
}
