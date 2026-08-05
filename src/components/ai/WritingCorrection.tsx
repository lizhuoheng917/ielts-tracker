import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Square,
} from 'lucide-react'

import { AiGatewayError } from '@/ai/gateway'
import {
  learnerAiTaskCoordinator,
  learnerAiTaskKey,
  learnerAiTaskScopeKey,
  useLearnerAiTaskState,
} from '@/ai/learnerAiTaskCoordinator'
import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import { aiArtifactToMarkdown, createWritingFeedbackArtifactV2 } from '@/ai/artifactRepository'
import {
  buildWritingContextSnapshot,
  calculateWritingOverallBand,
  countWritingWords,
  createWritingSubmissionV3,
  parseWritingFeedbackV2,
  type WritingBand,
  type WritingFeedbackV2,
  type WritingModule,
  type WritingSubmission,
  type WritingTask,
} from '@/ai/writingFeedback'
import { useAccountDialog } from '@/components/account/accountDialogContext'
import { AILoadingState } from '@/components/ai/AILoadingState'
import { AiQuotaNotice } from '@/components/ai/AiQuotaNotice'
import { WritingFeedbackContent } from '@/components/ai/StructuredAIContent'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useAiArtifactStore } from '@/stores/aiArtifactStore'

const WRITING_DRAFT_VERSION = 3 as const
// Keep the existing storage key so a V2 editor draft can be migrated in place.
const WRITING_DRAFT_PREFIX = 'ielts-tracker:writingDraftV2'

interface WritingDraftV3 {
  version: typeof WRITING_DRAFT_VERSION
  module: WritingModule
  task: WritingTask
  bookNumber: string
  testNumber: string
  essayText: string
  updatedAt: string
}

interface LegacyWritingDraftV2 {
  version: 2
  module: WritingModule
  task: WritingTask
  promptText: string
  sourceMaterialDescription: string
  essayText: string
  updatedAt: string
}

interface FeedbackPreview {
  submission: WritingSubmission
  feedback: WritingFeedbackV2
  overallBand: WritingBand | null
  snapshot: ReturnType<typeof buildWritingContextSnapshot>
  source: 'managed'
  runId?: string
  providerArtifactId?: string
  generatedAt: string
  dataAsOf: string
  contextHash: string
  warnings: string[]
}

interface WritingTaskContext {
  submission: WritingSubmission
  snapshot: ReturnType<typeof buildWritingContextSnapshot>
}

type WorkspaceStatus = 'editing' | 'generating' | 'preview' | 'saving' | 'saved' | 'error'

export interface WritingWorkspaceState {
  generating: boolean
  hasUnsavedResult: boolean
}

interface WritingCorrectionProps {
  onWorkspaceStateChange?: (state: WritingWorkspaceState) => void
  quotaActive?: boolean
}

function isWritingModule(value: unknown): value is WritingModule {
  return value === 'academic' || value === 'general_training'
}

function isWritingTask(value: unknown): value is WritingTask {
  return value === 'task1' || value === 'task2'
}

function loadDraft(storageKey: string): WritingDraftV3 | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const draft = value as Record<string, unknown>
    if (!isWritingModule(draft.module) || !isWritingTask(draft.task) || typeof draft.essayText !== 'string' || typeof draft.updatedAt !== 'string') {
      return null
    }
    if (
      draft.version === WRITING_DRAFT_VERSION
      && typeof draft.bookNumber === 'string'
      && typeof draft.testNumber === 'string'
    ) {
      return draft as unknown as WritingDraftV3
    }
    // Manual V2 prompt/material fields are intentionally retired. Preserve the
    // learner's essay plus the selected module/task when migrating the draft.
    if (
      draft.version === 2
      && typeof draft.promptText === 'string'
      && typeof draft.sourceMaterialDescription === 'string'
    ) {
      const legacy = draft as unknown as LegacyWritingDraftV2
      return {
        version: WRITING_DRAFT_VERSION,
        module: legacy.module,
        task: legacy.task,
        bookNumber: '',
        testNumber: '',
        essayText: legacy.essayText,
        updatedAt: legacy.updatedAt,
      }
    }
    return null
  } catch {
    return null
  }
}

function downloadMarkdown(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'report'
}

export function WritingCorrection({ onWorkspaceStateChange, quotaActive = true }: WritingCorrectionProps = {}) {
  const access = useAiArtifactAccess()
  const scopeKey = learnerAiTaskScopeKey(access)
  const taskKey = scopeKey
    ? learnerAiTaskKey('writing_feedback', scopeKey, 'practice-writing')
    : null
  const { tasks } = useLearnerAiTaskState()
  const writingTask = taskKey ? tasks[taskKey] : undefined
  const saveWritingFeedback = useAiArtifactStore((state) => state.saveWritingFeedback)
  const { openAccountDialog } = useAccountDialog()

  const [module, setModule] = useState<WritingModule>('academic')
  const [task, setTask] = useState<WritingTask>('task2')
  const [bookNumber, setBookNumber] = useState('')
  const [testNumber, setTestNumber] = useState('')
  const [essayText, setEssayText] = useState('')
  const [status, setStatus] = useState<WorkspaceStatus>('editing')
  const [preview, setPreview] = useState<FeedbackPreview | null>(null)
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null)
  const [loadedDraftStorageKey, setLoadedDraftStorageKey] = useState<string | null>(null)

  const draftStorageKey = useMemo(() => {
    if (access.status !== 'ready') return null
    return access.mode === 'account'
      ? `${WRITING_DRAFT_PREFIX}:account:${access.accountUserId}`
      : `${WRITING_DRAFT_PREFIX}:local`
  }, [access])

  const wordCount = useMemo(() => countWritingWords(essayText), [essayText])
  const minimumWords = task === 'task1' ? 150 : 250
  const belowMinimum = wordCount > 0 && wordCount < minimumWords
  const needsTaskOneMaterial = module === 'academic' && task === 'task1'
  const inputLocked = status === 'generating' || status === 'saving'

  useEffect(() => {
    setLoadedDraftStorageKey(null)
    setModule('academic')
    setTask('task2')
    setBookNumber('')
    setTestNumber('')
    setEssayText('')
    setPreview(null)
    setSavedRecordId(null)
    setError(null)
    setStatus('editing')
    if (!draftStorageKey) return
    const draft = loadDraft(draftStorageKey)
    if (draft) {
      setModule(draft.module)
      setTask(draft.task)
      setBookNumber(draft.bookNumber)
      setTestNumber(draft.testNumber)
      setEssayText(draft.essayText)
    }
    setLoadedDraftStorageKey(draftStorageKey)
  }, [draftStorageKey])

  useEffect(() => {
    if (!draftStorageKey || loadedDraftStorageKey !== draftStorageKey || savedRecordId) return
    const draft: WritingDraftV3 = {
      version: WRITING_DRAFT_VERSION,
      module,
      task,
      bookNumber,
      testNumber,
      essayText,
      updatedAt: new Date().toISOString(),
    }
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(draft))
    } catch {
      // The editor remains usable. A save error is shown only when the user
      // explicitly saves a generated report.
    }
  }, [bookNumber, draftStorageKey, essayText, loadedDraftStorageKey, module, savedRecordId, task, testNumber])

  useEffect(() => {
    onWorkspaceStateChange?.({
      generating: status === 'generating',
      hasUnsavedResult: preview !== null && status !== 'saved',
    })
  }, [onWorkspaceStateChange, preview, status])

  useEffect(() => {
    if (!writingTask) return
    if (writingTask.status === 'running' || writingTask.status === 'stopping') {
      setStatus('generating')
      setError(null)
      return
    }
    if (writingTask.status === 'succeeded') {
      const taskContext = writingTask.context as WritingTaskContext | undefined
      const result = writingTask.result
      if (!taskContext || !result) {
        setError({ message: '未生成写作反馈，作文草稿已保留，你可以重新生成。', code: 'INVALID_RESPONSE' })
        setStatus('error')
        return
      }
      try {
        const feedback = parseWritingFeedbackV2(result.content, taskContext.submission)
        const generatedAt = result.artifact?.createdAt ?? writingTask.completedAt ?? new Date().toISOString()
        setPreview({
          submission: taskContext.submission,
          feedback,
          overallBand: calculateWritingOverallBand(feedback),
          snapshot: taskContext.snapshot,
          source: result.source,
          runId: result.run?.runId,
          providerArtifactId: result.artifact?.artifactId,
          generatedAt,
          dataAsOf: result.artifact?.dataAsOf ?? taskContext.snapshot.dataAsOf,
          contextHash: result.artifact?.contextHash ?? taskContext.snapshot.contextHash,
          warnings: [...new Set([
            ...taskContext.snapshot.quality.warnings,
            ...result.warnings,
          ])],
        })
        setError(null)
        setStatus('preview')
      } catch {
        setError({ message: '未生成写作反馈，作文草稿已保留，你可以重新生成。', code: 'INVALID_RESPONSE' })
        setStatus('error')
      }
      return
    }
    const suffix = writingTask.status === 'outcome_unknown' ? '请求状态尚未确认。' : ''
    setError({
      message: ['未生成写作反馈，作文草稿已保留，你可以重新生成。', suffix].filter(Boolean).join(' '),
      code: writingTask.failure?.code ?? 'UNKNOWN',
    })
    setStatus('error')
  }, [writingTask])

  const clearDraft = () => {
    if (!draftStorageKey) return
    try {
      localStorage.removeItem(draftStorageKey)
    } catch {
      // The saved artifact is already durable; a stale editor draft is harmless.
    }
  }

  const validateBeforeGenerate = (): string | null => {
    if (!bookNumber.trim()) return '请填写剑雅书号。'
    if (!testNumber.trim()) return '请填写 Test。'
    if (!essayText.trim()) return '请先粘贴或输入作文正文。'
    const parsedBookNumber = Number(bookNumber)
    if (!Number.isInteger(parsedBookNumber) || parsedBookNumber < 1 || parsedBookNumber > 99) {
      return '剑雅书号请填写 1 到 99 的整数。'
    }
    const parsedTestNumber = Number(testNumber)
    if (!Number.isInteger(parsedTestNumber) || parsedTestNumber < 1 || parsedTestNumber > 4) {
      return 'Test 请填写 1 到 4 的整数。'
    }
    if (essayText.length > 12_000) return '作文内容过长，请控制在 12,000 个字符以内。'
    return null
  }

  const handleGenerate = () => {
    if (access.status === 'locked' || !scopeKey || !taskKey) {
      setError({ message: '请先确认这台设备的账号归属。', code: 'ARTIFACT_ACCESS_LOCKED' })
      setStatus('error')
      return
    }
    const inputError = validateBeforeGenerate()
    if (inputError) {
      setError({ message: inputError, code: 'INPUT_INVALID' })
      setStatus('error')
      return
    }

    let submission: WritingSubmission
    try {
      submission = createWritingSubmissionV3({
        module,
        task,
        sourceReference: {
          collection: 'cambridge_ielts',
          bookNumber: Number(bookNumber),
          testNumber: Number(testNumber),
        },
        essayText,
      })
    } catch {
      setError({ message: '请检查剑雅书号、Test 和作文内容后再试。', code: 'SUBMISSION_INVALID' })
      setStatus('error')
      return
    }

    const snapshot = buildWritingContextSnapshot(submission)
    setStatus('generating')
    setPreview(null)
    setSavedRecordId(null)
    setError(null)

    void learnerAiTaskCoordinator.start({
      key: taskKey,
      purpose: 'writing_feedback',
      scopeKey,
      label: '写作反馈',
      returnPath: '/exam',
      context: { submission, snapshot } satisfies WritingTaskContext,
      request: {
        purpose: 'writing_feedback',
        snapshot,
        // The complete writing request lives in the purpose-scoped snapshot.
        // Managed wire keeps userInput empty so no second instruction channel
        // can contradict the submission contract.
        userInput: '',
      },
      onSuccess: (result) => {
        try {
          parseWritingFeedbackV2(result.content, submission)
        } catch {
          throw new AiGatewayError('INVALID_RESPONSE', '未生成写作反馈，作文草稿已保留，你可以重新生成。', true)
        }
      },
    })
  }

  const handleCancel = () => {
    if (!taskKey) return
    learnerAiTaskCoordinator.stopWaiting(taskKey)
  }

  const handleSave = () => {
    if (!preview || access.status !== 'ready') {
      setError({ message: '当前账号状态无法安全保存这份报告，请先处理账号归属。', code: 'ARTIFACT_ACCESS_LOCKED' })
      return
    }
    setStatus('saving')
    setError(null)
    try {
      const artifact = saveWritingFeedback({
        recordId: preview.providerArtifactId ?? `writing-${preview.snapshot.snapshotId}`,
        providerArtifactId: preview.providerArtifactId,
        runId: preview.runId,
        snapshotId: preview.snapshot.snapshotId,
        contextHash: preview.contextHash,
        promptVersion: 'writing-feedback-v3-reference',
        rubricVersion: preview.feedback.rubricVersion,
        createdAt: preview.generatedAt,
        dataAsOf: preview.dataAsOf,
        source: preview.source,
        warnings: preview.warnings,
        submission: preview.submission,
        feedback: preview.feedback,
      }, access)
      setSavedRecordId(artifact.recordId)
      clearDraft()
      setStatus('saved')
      if (taskKey) learnerAiTaskCoordinator.clearTerminalTask(taskKey)
    } catch {
      setError({
        message: '报告已经生成，但没有成功写入当前设备。你可以重试保存或先导出 Markdown。',
        code: 'LOCAL_SAVE_FAILED',
      })
      setStatus('preview')
    }
  }

  const handleExport = () => {
    if (!preview) return
    const taskLabel = `${preview.submission.module}-${preview.submission.task}`
    const portableReport = createWritingFeedbackArtifactV2({
      recordId: preview.providerArtifactId ?? `writing-${preview.snapshot.snapshotId}`,
      providerArtifactId: preview.providerArtifactId,
      runId: preview.runId,
      snapshotId: preview.snapshot.snapshotId,
      contextHash: preview.contextHash,
      promptVersion: 'writing-feedback-v3-reference',
      createdAt: preview.generatedAt,
      savedAt: preview.generatedAt,
      dataAsOf: preview.dataAsOf,
      source: preview.source,
      warnings: preview.warnings,
      submission: preview.submission,
      feedback: preview.feedback,
    }, { status: 'ready', mode: 'device' })
    downloadMarkdown(
      `lexi-writing-${safeFilePart(taskLabel)}-${new Date().toISOString().slice(0, 10)}.md`,
      aiArtifactToMarkdown(portableReport),
    )
  }

  const returnToEditor = () => {
    if (taskKey) learnerAiTaskCoordinator.clearTerminalTask(taskKey)
    setPreview(null)
    setSavedRecordId(null)
    setError(null)
    setStatus('editing')
  }

  if (preview && (status === 'preview' || status === 'saving' || status === 'saved')) {
    return (
      <div className="flex min-h-full flex-col" aria-live="polite">
        <div className="space-y-5 pb-4">
          <AiQuotaNotice purpose="writing_feedback" active={quotaActive} className="text-sm" />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/25 px-3 py-2.5">
            <Button type="button" variant="ghost" size="sm" onClick={returnToEditor} disabled={status === 'saving'}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              修改作文
            </Button>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-sm">英文 {preview.submission.wordCount} 词</Badge>
              {status === 'saved' && <Badge className="gap-1"><CheckCircle2 className="size-3" />已保存</Badge>}
            </div>
          </div>

          <WritingFeedbackContent
            submission={preview.submission}
            feedback={preview.feedback}
            overallBand={preview.overallBand}
          />

          {preview.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-sm leading-6 text-muted-foreground">
              {preview.warnings.map((warning) => <p key={warning}>· {warning}</p>)}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5" role="alert">
              <p className="text-sm text-destructive">{error.message}</p>
              <details className="mt-2 text-sm text-muted-foreground">
                <summary className="cursor-pointer">技术详情</summary>
                <p className="mt-1">错误代码：{error.code ?? 'UNKNOWN'}</p>
              </details>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t border-border/80 bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={handleExport} className="w-full sm:w-auto">
              <Download className="size-4" aria-hidden="true" />
              导出 Markdown
            </Button>
            <Button type="button" onClick={handleSave} disabled={status === 'saving' || status === 'saved'} className="w-full sm:w-auto">
              {status === 'saving' ? <AILoadingState text="保存中" /> : <Save className="size-4" aria-hidden="true" />}
              {status === 'saving' ? '保存中…' : status === 'saved' ? '已保存到 AI 内容库' : '保存报告'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col" aria-busy={status === 'generating'}>
      <div className="space-y-4 pb-4">
        <AiQuotaNotice purpose="writing_feedback" active={quotaActive} pending={status === 'generating'} className="text-sm" />
        {access.status === 'locked' && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold">请先确认这台设备的账号归属</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">确认后即可生成并保存写作反馈。</p>
          </div>
          <Button type="button" size="sm" onClick={(event) => openAccountDialog(event.currentTarget)}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            查看账号状态
          </Button>
        </div>
        )}

        <section className="space-y-4 rounded-xl border border-border/70 bg-muted/[0.18] p-3.5 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-foreground">本次作文</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">选择题型，填入剑雅书号与 Test；无需再粘贴题目。</p>
          </div>
          <Badge variant="outline" className="border-primary/25 bg-primary/5 text-sm font-medium text-primary">题目参考</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">考试类型</legend>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant={module === 'academic' ? 'default' : 'outline'}
                onClick={() => setModule('academic')}
                disabled={inputLocked}
              >
                Academic
              </Button>
              <Button
                type="button"
                size="sm"
                variant={module === 'general_training' ? 'default' : 'outline'}
                onClick={() => setModule('general_training')}
                disabled={inputLocked}
              >
                General Training
              </Button>
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">写作任务</legend>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant={task === 'task1' ? 'secondary' : 'outline'}
                onClick={() => setTask('task1')}
                disabled={inputLocked}
              >
                <FileText className="size-4" aria-hidden="true" />Task 1
              </Button>
              <Button
                type="button"
                size="sm"
                variant={task === 'task2' ? 'secondary' : 'outline'}
                onClick={() => setTask('task2')}
                disabled={inputLocked}
              >
                <FileText className="size-4" aria-hidden="true" />Task 2
              </Button>
            </div>
          </fieldset>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1.5">
            <Label htmlFor="writing-cambridge-book" className="text-sm">剑雅书号</Label>
            <Input
              id="writing-cambridge-book"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              step={1}
              value={bookNumber}
              onChange={(event) => setBookNumber(event.target.value)}
              disabled={inputLocked}
              placeholder="例如 19"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="writing-cambridge-test" className="text-sm">Test</Label>
            <Input
              id="writing-cambridge-test"
              type="number"
              inputMode="numeric"
              min={1}
              max={4}
              step={1}
              value={testNumber}
              onChange={(event) => setTestNumber(event.target.value)}
              disabled={inputLocked}
              placeholder="例如 2"
            />
          </div>
        </div>
        {needsTaskOneMaterial && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 px-3 py-2.5 text-sm leading-6 text-amber-800 dark:text-amber-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>未提供原图，Task Achievement 仅供参考；本次会重点反馈语言、结构和表达。</p>
          </div>
        )}
        </section>

        <section className="space-y-3 rounded-xl border border-border/70 p-3.5 sm:p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Label htmlFor="writing-essay" className="text-base font-semibold">作文正文</Label>
            <p className="mt-1 text-sm text-muted-foreground">粘贴或直接输入你的英文作文。</p>
          </div>
          <span className={cn('shrink-0 text-sm font-medium tabular-nums', belowMinimum ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
            {wordCount} 词
          </span>
        </div>
        <Textarea
          id="writing-essay"
          value={essayText}
          onChange={(event) => setEssayText(event.target.value)}
          disabled={inputLocked}
          maxLength={12_000}
          rows={10}
          className="min-h-56 resize-y font-mono text-sm leading-6"
          placeholder="粘贴或输入你的英文作文…"
        />
        <p className={cn('text-sm leading-6', belowMinimum ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
          {belowMinimum
            ? `当前英文词数少于 IELTS ${task === 'task1' ? 'Task 1' : 'Task 2'} 的 ${minimumWords} 词最低要求；仍可批改，但报告会说明这一局限。`
            : `IELTS ${task === 'task1' ? 'Task 1' : 'Task 2'} 建议不少于 ${minimumWords} 个英文词；中文不会计入英文词数。`}
        </p>
        </section>

        {error && (
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5" role="alert">
            <p className="text-sm text-destructive">{error.message}</p>
            <details className="mt-2 text-sm text-muted-foreground">
              <summary className="cursor-pointer">技术详情</summary>
              <p className="mt-1">错误代码：{error.code ?? 'UNKNOWN'}</p>
            </details>
          </div>
        )}

        {status === 'generating' && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-subject-writing-border bg-subject-writing-soft px-3.5 py-3" role="status" aria-live="polite">
            <div className="min-w-0 space-y-1">
              <AILoadingState text={writingTask?.status === 'stopping' ? '正在停止等待结果' : '正在生成写作反馈'} />
              <p className="text-sm leading-5 text-muted-foreground">
                {writingTask?.status === 'stopping'
                  ? '已停止等待，最终结果状态会在同步后显示。'
                  : '这次请求可能需要接近一分钟；作文草稿已保留。完成后会在这里显示结果。'}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={writingTask?.status === 'stopping'}>
              <Square className="size-3" fill="currentColor" aria-hidden="true" />停止
            </Button>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t border-border/80 bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-5 text-muted-foreground">作文正文只用于本次批改。</p>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={status === 'generating' || access.status === 'locked' || !bookNumber.trim() || !testNumber.trim() || !essayText.trim()}
            className="w-full shrink-0 bg-subject-writing text-white hover:bg-subject-writing/90 sm:w-auto"
          >
            {status === 'error' ? <RefreshCcw className="size-4" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
            {status === 'error' ? '重新生成' : '生成写作反馈'}
          </Button>
        </div>
      </div>
    </div>
  )
}
