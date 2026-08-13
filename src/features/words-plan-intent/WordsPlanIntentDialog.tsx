import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  Loader2,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import {
  learnerAiTaskCoordinator,
  learnerAiTaskKey,
  learnerAiTaskScopeKey,
  useLearnerAiTaskState,
} from '@/ai/learnerAiTaskCoordinator'
import { isWordsPlanRecommendationV2, type WordsPlanRecommendationV2 } from '@/ai/structuredOutputs'
import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import { buildWordsPlanRecommendationSnapshot } from '@/ai/wordsPlanRecommendation'
import { AiQuotaNotice } from '@/components/ai/AiQuotaNotice'
import { ContentCloudLocationField } from '@/components/sync/ContentCloudLocationField'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LexiWordsStudyMode } from '@/contracts/lexiCrossProduct'
import { loadWordsPlanningContext } from '@/features/words-planning/wordsPlanningContext'
import { addLocalDays, isLocalDate, toLocalDate } from '@/lib/localDate'
import type { StudyPlan } from '@/lib/types'
import { cn } from '@/lib/utils'
import { usePlanStore } from '@/stores/planStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useTimerStore } from '@/stores/timerStore'
import { useWordStore } from '@/stores/wordStore'
import {
  setTrackerContentCloudLocation,
  trackerContentCloudMode,
  type TrackerContentCloudMode,
} from '@/sync/trackerContentCloudPolicy'
import { createWordsPlanIntent } from './wordsPlanIntent'
import {
  createWordsPlanRecommendationPreview,
  parseWordsPlanRecommendationTaskContext,
  resolveWordsPlanningTimeZone,
  WORDS_PLAN_CONFIDENCE_LABELS,
  wordsPlanAnalysisFallbackMessage,
  wordsPlanFormFingerprint,
  wordsPlanRecommendationTaskNamespace,
} from './wordsPlanRecommendationView'
import {
  createCanonicalVocabularyPlanFields,
  defaultVocabularyPlanDuration,
  defaultVocabularyPlanTitle,
} from './vocabularyPlanTemplate'
import {
  saveAndSendVocabularyPlan,
  VocabularyPlanWorkflowError,
} from './vocabularyPlanWorkflow'

const MODE_LABELS: Record<LexiWordsStudyMode, string> = {
  mixed: '智能混合',
  review: '仅复习',
  new: '仅新词',
}

type Props = {
  open: boolean
  mode: WordsPlanIntentMode
  plan: StudyPlan | null
  userId: string | null
  wordsUrl: string | null
  preview?: boolean
  onPlanSaved?: (planId: string) => void
  onOpenChange: (open: boolean) => void
}

export type WordsPlanIntentMode = 'manual' | 'ai'

function defaultTargetDate(plan: StudyPlan | null, today: string, lastDate: string): string {
  const scheduled = plan?.frequency === 'once' ? plan.scheduledDate : undefined
  return isLocalDate(scheduled) && scheduled >= today && scheduled <= lastDate ? scheduled : today
}

function defaultTargetCount(plan: StudyPlan | null): number {
  return Number.isSafeInteger(plan?.targetCount) && Number(plan?.targetCount) >= 1 && Number(plan?.targetCount) <= 1_000
    ? Number(plan?.targetCount)
    : 20
}

function defaultTargetDuration(plan: StudyPlan | null): number {
  return Number.isSafeInteger(plan?.targetDuration)
    && Number(plan?.targetDuration) >= 5
    && Number(plan?.targetDuration) <= 180
    ? Number(plan?.targetDuration)
    : defaultVocabularyPlanDuration(defaultTargetCount(plan))
}

function newOperationId() {
  return crypto.randomUUID()
}

function recommendationSourcePlan(
  plan: StudyPlan | null,
  targetDate: string,
): StudyPlan {
  if (plan) return plan
  const timestamp = new Date().toISOString()
  return {
    id: 'words-hub-direct-ai',
    title: '',
    category: 'vocabulary',
    frequency: 'once',
    scheduledDate: targetDate,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function accountSafetyMessage(
  userId: string | null,
  access: ReturnType<typeof useAiArtifactAccess>,
): string {
  if (!userId) return '请先登录同一个 Lexi 账号，再使用智能分析。'
  if (access.status === 'locked' && access.reason === 'account-mismatch') {
    return '本机 Tracker 数据属于另一个账号，智能分析已暂停；手动发送仍可继续。'
  }
  if (access.status !== 'ready' || access.mode !== 'account') {
    return '请先在账号面板确认本机 Tracker 数据属于当前账号；手动发送仍可继续。'
  }
  return ''
}

export function WordsPlanIntentDialog({
  open,
  mode,
  plan,
  userId,
  wordsUrl,
  preview = false,
  onPlanSaved,
  onOpenChange,
}: Props) {
  const today = toLocalDate()
  const lastDate = addLocalDays(today, 29)
  const plans = usePlanStore((state) => state.plans)
  const planExecutions = usePlanStore((state) => state.executions)
  const upsertVocabularyPlan = usePlanStore((state) => state.upsertVocabularyPlan)
  const wordRecords = useWordStore((state) => state.records)
  const practiceRecords = usePracticeStore((state) => state.records)
  const timerRecords = useTimerStore((state) => state.records)
  const artifactAccess = useAiArtifactAccess()
  const scopeKey = learnerAiTaskScopeKey(artifactAccess)
  const recommendationTaskKey = scopeKey
    ? learnerAiTaskKey(
        'words_plan_recommendation',
        scopeKey,
        wordsPlanRecommendationTaskNamespace(plan?.id ?? 'words-hub-direct'),
      )
    : null
  const { tasks } = useLearnerAiTaskState()
  const recommendationTask = recommendationTaskKey ? tasks[recommendationTaskKey] : undefined

  const [targetDate, setTargetDate] = useState(today)
  const [planTitle, setPlanTitle] = useState(defaultVocabularyPlanTitle(today))
  const [targetTime, setTargetTime] = useState('')
  const [targetCount, setTargetCount] = useState('20')
  const [targetDuration, setTargetDuration] = useState(String(defaultVocabularyPlanDuration(20)))
  const [studyMode, setStudyMode] = useState<LexiWordsStudyMode>('mixed')
  const [cloudMode, setCloudMode] = useState<TrackerContentCloudMode>('local')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loadingContext, setLoadingContext] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [previewRecommendation, setPreviewRecommendation] = useState<WordsPlanRecommendationV2 | null>(null)
  const [adoptedFingerprint, setAdoptedFingerprint] = useState('')
  const [pendingAutoGenerate, setPendingAutoGenerate] = useState(false)
  const operationIdRef = useRef(newOperationId())
  const savedPlanIdRef = useRef('')
  const submittedFingerprintRef = useRef('')
  const contextRequestRef = useRef(0)
  const appliedRecommendationRef = useRef('')
  const initializedDialogRef = useRef('')

  useEffect(() => {
    if (!open) {
      contextRequestRef.current += 1
      initializedDialogRef.current = ''
      return
    }
    const dialogIdentity = `${mode}:${plan?.id ?? 'new'}`
    if (initializedDialogRef.current === dialogIdentity) return
    initializedDialogRef.current = dialogIdentity
    const nextTargetDate = defaultTargetDate(plan, today, lastDate)
    setTargetDate(nextTargetDate)
    setPlanTitle(plan?.title || defaultVocabularyPlanTitle(nextTargetDate))
    setTargetTime(plan?.targetTime || '')
    setTargetCount(String(defaultTargetCount(plan)))
    setTargetDuration(String(defaultTargetDuration(plan)))
    setStudyMode('mixed')
    setCloudMode(plan
      ? trackerContentCloudMode({ entityKind: 'study_plan', entityId: plan.id })
      : 'local')
    setSaving(false)
    setError('')
    setSent(false)
    setLoadingContext(false)
    setAnalysisError('')
    setPreviewRecommendation(null)
    setAdoptedFingerprint('')
    setPendingAutoGenerate(mode === 'ai')
    operationIdRef.current = newOperationId()
    savedPlanIdRef.current = plan?.id ?? ''
    submittedFingerprintRef.current = ''
    appliedRecommendationRef.current = ''
  }, [lastDate, mode, open, plan, today])

  const closeDialog = () => {
    if (saving) return
    if (savedPlanIdRef.current) onPlanSaved?.(savedPlanIdRef.current)
    onOpenChange(false)
  }

  const taskContext = parseWordsPlanRecommendationTaskContext(recommendationTask?.context)
  const taskMatchesForm = Boolean(
    taskContext
    && taskContext.sourcePlanId === (plan?.id ?? null)
    && taskContext.targetDate === targetDate,
  )
  const taskRecommendation = taskMatchesForm
    && recommendationTask?.status === 'succeeded'
    && isWordsPlanRecommendationV2(recommendationTask.result?.content)
    ? recommendationTask.result.content
    : null
  const recommendation = previewRecommendation?.targetDate === targetDate
    ? previewRecommendation
    : taskRecommendation
  const taskRunning = taskMatchesForm
    && (recommendationTask?.status === 'running' || recommendationTask?.status === 'stopping')
  const analysisPending = loadingContext || taskRunning
  const taskFailure = taskMatchesForm
    && (recommendationTask?.status === 'failed' || recommendationTask?.status === 'outcome_unknown')
    ? recommendationTask.failure
    : undefined
  const visibleAnalysisError = analysisError || taskFailure?.message || ''
  const accountMessage = preview ? '' : accountSafetyMessage(userId, artifactAccess)

  useEffect(() => {
    if (
      !open
      || !recommendationTaskKey
      || !taskMatchesForm
      || !recommendationTask
      || recommendationTask.noticeDismissed
    ) return
    if (recommendationTask.status === 'running' || recommendationTask.status === 'stopping') return
    learnerAiTaskCoordinator.dismissNotice(recommendationTaskKey)
  }, [open, recommendationTask, recommendationTaskKey, taskMatchesForm])

  const parsedCount = Number(targetCount)
  const parsedDuration = Number(targetDuration)
  const dateInvalid = !isLocalDate(targetDate) || targetDate < today || targetDate > lastDate
  const titleInvalid = !planTitle.trim() || planTitle.trim().length > 60
  const countInvalid = !Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 1_000
  const durationInvalid = !Number.isInteger(parsedDuration) || parsedDuration < 5 || parsedDuration > 180
  const timeInvalid = Boolean(targetTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(targetTime))
  const canSubmit = Boolean(
    !saving
    && !sent
    && !dateInvalid
    && !titleInvalid
    && !countInvalid
    && !durationInvalid
    && !timeInvalid
    && (mode === 'manual' || !analysisPending)
    && (userId || preview),
  )
  const dateLabel = useMemo(() => {
    if (!isLocalDate(targetDate)) return '日期待确认'
    if (targetDate === today) return '今天'
    const [, month, day] = targetDate.split('-').map(Number)
    return `${month} 月 ${day} 日`
  }, [targetDate, today])
  const currentFormFingerprint = !dateInvalid && !countInvalid
    ? wordsPlanFormFingerprint(targetDate, parsedCount, studyMode)
    : ''
  const recommendationFingerprint = recommendation
    ? wordsPlanFormFingerprint(
        recommendation.targetDate,
        recommendation.targetCount,
        recommendation.studyMode,
      )
    : ''
  const recommendationApplied = Boolean(
    recommendationFingerprint
    && adoptedFingerprint === recommendationFingerprint
    && currentFormFingerprint === recommendationFingerprint,
  )
  const recommendationCustomized = Boolean(
    adoptedFingerprint
    && adoptedFingerprint === recommendationFingerprint
    && currentFormFingerprint !== recommendationFingerprint,
  )

  const analyze = useCallback(async () => {
    if (dateInvalid || loadingContext || taskRunning) return
    setAnalysisError('')
    setAdoptedFingerprint('')

    if (preview) {
      setPreviewRecommendation(createWordsPlanRecommendationPreview(targetDate))
      return
    }
    if (
      !userId
      || artifactAccess.status !== 'ready'
      || artifactAccess.mode !== 'account'
      || artifactAccess.accountUserId !== userId
      || !scopeKey
      || !recommendationTaskKey
    ) {
      setAnalysisError(accountSafetyMessage(userId, artifactAccess))
      return
    }

    const requestVersion = contextRequestRef.current + 1
    contextRequestRef.current = requestVersion
    setLoadingContext(true)
    try {
      const timeZone = resolveWordsPlanningTimeZone()
      const words = await loadWordsPlanningContext(userId, targetDate, timeZone)
      if (contextRequestRef.current !== requestVersion) return
      const snapshot = buildWordsPlanRecommendationSnapshot({
        sourcePlan: recommendationSourcePlan(plan, targetDate),
        plans,
        planExecutions,
        wordRecords,
        practiceRecords,
        timerRecords,
        words,
      })
      void learnerAiTaskCoordinator.start({
        key: recommendationTaskKey,
        purpose: 'words_plan_recommendation',
        scopeKey,
        label: 'Words 词汇计划建议',
        returnPath: '/words',
        context: {
          sourcePlanId: plan?.id ?? null,
          targetDate,
          snapshotContextHash: snapshot.contextHash,
          wordsGeneratedAt: words.generatedAt,
        },
        request: {
          purpose: 'words_plan_recommendation',
          snapshot,
          userInput: '',
        },
      })
    } catch {
      if (contextRequestRef.current === requestVersion) {
        setAnalysisError(wordsPlanAnalysisFallbackMessage())
      }
    } finally {
      if (contextRequestRef.current === requestVersion) setLoadingContext(false)
    }
  }, [
    artifactAccess,
    dateInvalid,
    loadingContext,
    plan,
    planExecutions,
    plans,
    practiceRecords,
    preview,
    recommendationTaskKey,
    scopeKey,
    targetDate,
    taskRunning,
    timerRecords,
    userId,
    wordRecords,
  ])

  useEffect(() => {
    if (!open || mode !== 'ai' || !pendingAutoGenerate) return
    setPendingAutoGenerate(false)
    void analyze()
  }, [analyze, mode, open, pendingAutoGenerate])

  useEffect(() => {
    if (
      mode !== 'ai'
      || analysisPending
      || !recommendation
      || !recommendationFingerprint
      || appliedRecommendationRef.current === recommendationFingerprint
    ) return
    setTargetCount(String(recommendation.targetCount))
    setTargetDuration(String(recommendation.estimatedMinutes))
    setStudyMode(recommendation.studyMode)
    setAdoptedFingerprint(recommendationFingerprint)
    setError('')
    appliedRecommendationRef.current = recommendationFingerprint
  }, [analysisPending, mode, recommendation, recommendationFingerprint])

  const submit = async () => {
    if (!canSubmit) return
    contextRequestRef.current += 1
    setLoadingContext(false)
    if (recommendationTaskKey && taskRunning) {
      learnerAiTaskCoordinator.stopWaiting(recommendationTaskKey)
    }
    const canonicalFields = createCanonicalVocabularyPlanFields({
      title: planTitle,
      targetDate,
      targetTime,
      targetCount: parsedCount,
      targetDuration: parsedDuration,
    }, plan)
    const fingerprint = wordsPlanFormFingerprint(targetDate, parsedCount, studyMode)
    if (submittedFingerprintRef.current && submittedFingerprintRef.current !== fingerprint) {
      operationIdRef.current = newOperationId()
    }
    submittedFingerprintRef.current = fingerprint
    setSaving(true)
    setError('')
    try {
      if (!preview) {
        const result = await saveAndSendVocabularyPlan({
          existingPlanId: savedPlanIdRef.current || plan?.id || undefined,
          fields: canonicalFields,
          cloudMode,
          userId: userId!,
          operationId: operationIdRef.current,
          targetDate,
          targetCount: parsedCount,
          studyMode,
        }, {
          readPlans: () => usePlanStore.getState().plans,
          upsertPlan: upsertVocabularyPlan,
          setCloudLocation: setTrackerContentCloudLocation,
          sendIntent: createWordsPlanIntent,
        })
        savedPlanIdRef.current = result.planId
      }
      setSent(true)
    } catch (caught) {
      if (caught instanceof VocabularyPlanWorkflowError && caught.savedPlanId) {
        savedPlanIdRef.current = caught.savedPlanId
      }
      setError(savedPlanIdRef.current
        ? 'Tracker 计划已保留，但暂时无法确认 Words 是否收到。保持当前内容重试会沿用同一计划和发送编号，不会重复创建。'
        : '暂时无法保存词汇计划，请稍后重试；当前内容不会自动发送到 Words。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeDialog() }}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] min-w-0 max-w-[45rem] flex-col gap-0 overflow-hidden overscroll-contain p-0 sm:w-[min(94vw,45rem)]">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 md:px-6 md:py-5">
          <DialogTitle className="flex items-center gap-2">
            {mode === 'ai'
              ? <Sparkles className="size-5 text-primary" aria-hidden="true" />
              : <PenLine className="size-5 text-primary" aria-hidden="true" />}
            {mode === 'ai' ? 'AI 生成词汇计划' : '自己填写词汇计划'}
          </DialogTitle>
          <DialogDescription className="leading-5">
            {mode === 'ai'
              ? '综合 Words 与 Tracker 的最新进度生成草稿，由你确认后再发送。'
              : '填写名称、日期、目标词数与用时，确认后保存并发送给 Words。'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 min-w-0 space-y-5 overflow-x-hidden overflow-y-auto px-4 py-5 md:px-6">
          {sent ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">词汇计划已保存并送达 Words</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {dateLabel} · {parsedCount} 词 · {MODE_LABELS[studyMode]}。计划中心会显示同一条计划，请在 Words 选择词书并确认。
                    </p>
                  </div>
                </div>
              </div>
              {wordsUrl && (
                <a href={wordsUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants(), 'w-full')}>
                  打开 Words 查看
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface-subtle px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p className="text-xs font-medium text-muted-foreground">Tracker 计划</p>
                <p className="min-w-0 truncate text-sm font-medium text-foreground" title={plan?.title}>
                  {plan ? `更新：${plan.title}` : '新建词汇计划'}
                </p>
              </div>

              {mode === 'ai' && (
              <section className="space-y-3 rounded-2xl border border-primary/20 bg-primary/[0.045] p-4" aria-labelledby="words-plan-ai-heading">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Sparkles className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 id="words-plan-ai-heading" className="font-semibold text-foreground">根据双方进度生成</h3>
                      <span className="rounded-full border border-primary/20 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">自动填入，不自动发送</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      参考 Words 学习状态，以及 Tracker 的近期进度、当天负荷与过往词汇计划表现。
                    </p>
                  </div>
                </div>

                <AiQuotaNotice
                  purpose="words_plan_recommendation"
                  active={open && !preview}
                  pending={analysisPending}
                />

                {analysisPending && (
                  <div className="flex items-center gap-2 rounded-xl border border-primary/15 bg-background/70 px-3 py-3 text-sm text-muted-foreground" role="status">
                    <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
                    <span>{loadingContext ? '正在读取双方最新数字摘要…' : '正在分析合适的词数与学习模式…'}</span>
                  </div>
                )}

                {visibleAnalysisError && !analysisPending && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-sm leading-5 text-amber-800 dark:text-amber-200" role="alert">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{visibleAnalysisError}</span>
                  </div>
                )}

                {recommendation && !analysisPending && (
                  <div className="space-y-4 rounded-2xl border border-primary/20 bg-background p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-primary">AI 生成的词汇计划</p>
                        <p className="mt-1 text-sm leading-6 text-foreground">{recommendation.summary}</p>
                      </div>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                        {WORDS_PLAN_CONFIDENCE_LABELS[recommendation.confidence]}
                      </span>
                    </div>

                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-xl bg-muted/45 px-3 py-2.5">
                        <dt className="text-[11px] text-muted-foreground">建议总量</dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums">{recommendation.targetCount}<span className="ml-1 text-xs font-normal text-muted-foreground">词</span></dd>
                      </div>
                      <div className="rounded-xl bg-muted/45 px-3 py-2.5">
                        <dt className="text-[11px] text-muted-foreground">优先复习</dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums">{recommendation.reviewWords}<span className="ml-1 text-xs font-normal text-muted-foreground">词</span></dd>
                      </div>
                      <div className="rounded-xl bg-muted/45 px-3 py-2.5">
                        <dt className="text-[11px] text-muted-foreground">建议新词</dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums">{recommendation.newWords}<span className="ml-1 text-xs font-normal text-muted-foreground">词</span></dd>
                      </div>
                      <div className="rounded-xl bg-muted/45 px-3 py-2.5">
                        <dt className="text-[11px] text-muted-foreground">预计用时</dt>
                        <dd className="mt-1 flex items-center gap-1 text-lg font-semibold tabular-nums"><Clock3 className="size-3.5 text-muted-foreground" aria-hidden="true" />{recommendation.estimatedMinutes}<span className="text-xs font-normal text-muted-foreground">分钟</span></dd>
                      </div>
                    </dl>

                    <div>
                      <p className="text-xs font-medium text-foreground">主要依据</p>
                      <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
                        {recommendation.evidence.slice(0, 3).map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                      <p>{recommendation.risks[0]}</p>
                      <p className="mt-1">{recommendation.limitations[0]}</p>
                      <p className="mt-1 font-medium text-foreground">
                        复习 / 新词拆分用于解释建议；发送时只传总词数和模式，Words 会按真实词书再校正。
                      </p>
                    </div>

                    {recommendationCustomized && (
                      <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" role="status">
                        你已在采纳后手动调整，最终会按下方当前内容发送。
                      </p>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300" role="status">
                        <Check className="size-4" aria-hidden="true" />
                        {recommendationApplied ? '已填入下方，可继续修改' : '正在更新计划内容'}
                      </p>
                      <Button type="button" variant="outline" onClick={() => void analyze()} className="w-full sm:w-auto">
                        <RefreshCw className="size-4" aria-hidden="true" />
                        重新生成
                      </Button>
                    </div>
                  </div>
                )}

                {!recommendation && !analysisPending && (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void analyze()}
                      disabled={dateInvalid || Boolean(accountMessage)}
                      className="w-full border-primary/25 bg-background hover:bg-primary/5"
                    >
                      <Sparkles className="size-4 text-primary" aria-hidden="true" />
                      根据双方进度生成计划
                    </Button>
                    {accountMessage && (
                      <p className="text-xs leading-5 text-muted-foreground">{accountMessage}</p>
                    )}
                  </div>
                )}
              </section>
              )}

              <section className="min-w-0 space-y-4" aria-labelledby="words-plan-final-heading">
                <div>
                  <h3 id="words-plan-final-heading" className="text-sm font-semibold text-foreground">
                    {mode === 'ai' ? '确认计划内容' : '填写计划内容'}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {mode === 'ai' ? 'AI 结果会自动填入，发送前仍可修改。' : '填写完成后再发送；Words 不会自动开始学习。'}
                  </p>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="min-w-0 space-y-2 sm:col-span-2">
                    <Label htmlFor="words-plan-title">计划名称</Label>
                    <Input
                      id="words-plan-title"
                      maxLength={60}
                      value={planTitle}
                      onChange={(event) => setPlanTitle(event.target.value)}
                      disabled={saving}
                      aria-invalid={titleInvalid}
                      placeholder={defaultVocabularyPlanTitle(targetDate)}
                    />
                  </div>

                  <div className="min-w-0 space-y-2 sm:col-span-2">
                    <Label htmlFor="words-plan-date">
                      {plan?.frequency === 'daily' || plan?.frequency === 'weekly' ? '本次发送日期' : '目标日期'}
                    </Label>
                    <div className="relative min-w-0 max-w-full">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <Input
                        id="words-plan-date"
                        type="date"
                        min={today}
                        max={lastDate}
                        value={targetDate}
                        onChange={(event) => {
                          const previousDefault = defaultVocabularyPlanTitle(targetDate)
                          const nextDate = event.target.value
                          setTargetDate(event.target.value)
                          if (!plan || !planTitle.trim() || planTitle === previousDefault) {
                            setPlanTitle(defaultVocabularyPlanTitle(nextDate))
                          }
                          setPreviewRecommendation(null)
                          setAnalysisError('')
                          setAdoptedFingerprint('')
                        }}
                        disabled={saving || analysisPending}
                        className="pl-9"
                        aria-invalid={dateInvalid}
                      />
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {plan?.frequency === 'daily' || plan?.frequency === 'weekly'
                        ? '原周期安排保持不变；这个日期只用于本次发送。'
                        : `最多提前 29 天发送${mode === 'ai' ? '；改变日期后请重新生成' : ''}。`}
                    </p>
                  </div>

                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="words-plan-count">目标词数</Label>
                    <Input
                      id="words-plan-count"
                      type="number"
                      min={1}
                      max={1000}
                      inputMode="numeric"
                      value={targetCount}
                      onChange={(event) => setTargetCount(event.target.value)}
                      disabled={saving}
                      aria-invalid={countInvalid}
                    />
                  </div>

                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="words-plan-duration">预计用时</Label>
                    <div className="relative min-w-0 max-w-full">
                      <Input
                        id="words-plan-duration"
                        type="number"
                        min={5}
                        max={180}
                        inputMode="numeric"
                        value={targetDuration}
                        onChange={(event) => setTargetDuration(event.target.value)}
                        disabled={saving}
                        className="pr-12"
                        aria-invalid={durationInvalid}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">分钟</span>
                    </div>
                  </div>

                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="words-plan-time">开始时间（可选）</Label>
                    <Input
                      id="words-plan-time"
                      type="time"
                      value={targetTime}
                      onChange={(event) => setTargetTime(event.target.value)}
                      disabled={saving}
                      aria-invalid={timeInvalid}
                    />
                  </div>

                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="words-plan-mode">学习模式</Label>
                    <Select value={studyMode} onValueChange={(value) => setStudyMode(value as LexiWordsStudyMode)} disabled={saving}>
                      <SelectTrigger id="words-plan-mode" className="w-full"><SelectValue>{MODE_LABELS[studyMode]}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mixed">智能混合</SelectItem>
                        <SelectItem value="review">仅复习</SelectItem>
                        <SelectItem value="new">仅新词</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <ContentCloudLocationField
                  entityKind="study_plan"
                  entityId={savedPlanIdRef.current || plan?.id || null}
                  value={cloudMode}
                  onValueChange={setCloudMode}
                  disabled={saving}
                  variant="compact"
                />
              </section>

              {!userId && !preview && (
                <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200" role="status">
                  请先登录同一个 Lexi 账号，再发送到 Words。
                </p>
              )}
              {mode === 'ai' && analysisPending && (
                <p className="text-xs leading-5 text-muted-foreground" role="status">正在生成草稿；完成后仍需你确认，系统不会自动发送或改变数据。</p>
              )}
              {titleInvalid && planTitle.length > 0 && (
                <p className="text-sm leading-5 text-destructive" role="alert">计划名称不能超过 60 个字符。</p>
              )}
              {error && <p className="text-sm leading-5 text-destructive" role="alert">{error}</p>}
            </>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-t border-border px-4 py-4 md:px-6">
          {sent ? (
            <Button type="button" variant="outline" onClick={closeDialog} className="w-full sm:w-auto">完成</Button>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="ghost" onClick={closeDialog} disabled={saving} className="w-full sm:w-auto">暂不发送</Button>
              <Button type="button" onClick={() => void submit()} disabled={!canSubmit} className="w-full sm:w-auto sm:min-w-44">
                {saving ? '正在保存并发送…' : mode === 'ai' && analysisPending ? 'AI 正在生成计划…' : '保存计划并发送到 Words'}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
