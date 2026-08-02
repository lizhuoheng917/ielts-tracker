import { useEffect, useMemo, useRef, useState } from 'react'
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
import { executeReadOnlyAi } from '@/ai/readOnlyExecution'
import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import { aiArtifactToMarkdown, createWritingFeedbackArtifactV2 } from '@/ai/artifactRepository'
import {
  buildWritingContextSnapshot,
  calculateWritingOverallBand,
  countWritingWords,
  createWritingSubmissionV2,
  type WritingBand,
  type WritingFeedbackV2,
  type WritingModule,
  type WritingSubmissionV2,
  type WritingTask,
} from '@/ai/writingFeedback'
import { useAccountDialog } from '@/components/account/accountDialogContext'
import { AILoadingState } from '@/components/ai/AILoadingState'
import { WritingFeedbackContent } from '@/components/ai/StructuredAIContent'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useAIStore } from '@/stores/aiStore'
import { useAiArtifactStore } from '@/stores/aiArtifactStore'

const WRITING_DRAFT_VERSION = 2 as const
const WRITING_DRAFT_PREFIX = 'ielts-tracker:writingDraftV2'
const GENERATION_TIMEOUT_MS = 45_000

interface WritingDraftV2 {
  version: typeof WRITING_DRAFT_VERSION
  module: WritingModule
  task: WritingTask
  promptText: string
  sourceMaterialDescription: string
  essayText: string
  updatedAt: string
}

interface FeedbackPreview {
  submission: WritingSubmissionV2
  feedback: WritingFeedbackV2
  overallBand: WritingBand | null
  snapshot: ReturnType<typeof buildWritingContextSnapshot>
  source: 'managed' | 'custom'
  runId?: string
  providerArtifactId?: string
  generatedAt: string
  dataAsOf: string
  contextHash: string
  warnings: string[]
}

type WorkspaceStatus = 'editing' | 'generating' | 'preview' | 'saving' | 'saved' | 'error'

export interface WritingWorkspaceState {
  generating: boolean
  hasUnsavedResult: boolean
}

interface WritingCorrectionProps {
  onWorkspaceStateChange?: (state: WritingWorkspaceState) => void
}

function isWritingModule(value: unknown): value is WritingModule {
  return value === 'academic' || value === 'general_training'
}

function isWritingTask(value: unknown): value is WritingTask {
  return value === 'task1' || value === 'task2'
}

function loadDraft(storageKey: string): WritingDraftV2 | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const draft = value as Record<string, unknown>
    if (
      draft.version !== WRITING_DRAFT_VERSION
      || !isWritingModule(draft.module)
      || !isWritingTask(draft.task)
      || typeof draft.promptText !== 'string'
      || typeof draft.sourceMaterialDescription !== 'string'
      || typeof draft.essayText !== 'string'
      || typeof draft.updatedAt !== 'string'
    ) return null
    return draft as unknown as WritingDraftV2
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

export function WritingCorrection({ onWorkspaceStateChange }: WritingCorrectionProps = {}) {
  const access = useAiArtifactAccess()
  const routeMode = useAIStore((state) => state.routeMode)
  const saveWritingFeedback = useAiArtifactStore((state) => state.saveWritingFeedback)
  const { openAccountDialog } = useAccountDialog()

  const [module, setModule] = useState<WritingModule>('academic')
  const [task, setTask] = useState<WritingTask>('task2')
  const [promptText, setPromptText] = useState('')
  const [sourceMaterialDescription, setSourceMaterialDescription] = useState('')
  const [essayText, setEssayText] = useState('')
  const [status, setStatus] = useState<WorkspaceStatus>('editing')
  const [preview, setPreview] = useState<FeedbackPreview | null>(null)
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null)
  const [loadedDraftStorageKey, setLoadedDraftStorageKey] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const abortReasonRef = useRef<'user' | 'timeout' | null>(null)
  const requestSequenceRef = useRef(0)

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
    requestSequenceRef.current += 1
    abortReasonRef.current = 'user'
    controllerRef.current?.abort()
    controllerRef.current = null
    setModule('academic')
    setTask('task2')
    setPromptText('')
    setSourceMaterialDescription('')
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
      setPromptText(draft.promptText)
      setSourceMaterialDescription(draft.sourceMaterialDescription)
      setEssayText(draft.essayText)
    }
    setLoadedDraftStorageKey(draftStorageKey)
  }, [draftStorageKey])

  useEffect(() => {
    if (!draftStorageKey || loadedDraftStorageKey !== draftStorageKey || savedRecordId) return
    const draft: WritingDraftV2 = {
      version: WRITING_DRAFT_VERSION,
      module,
      task,
      promptText,
      sourceMaterialDescription,
      essayText,
      updatedAt: new Date().toISOString(),
    }
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(draft))
    } catch {
      // The editor remains usable. A save error is shown only when the user
      // explicitly saves a generated report.
    }
  }, [draftStorageKey, essayText, loadedDraftStorageKey, module, promptText, savedRecordId, sourceMaterialDescription, task])

  useEffect(() => () => {
    requestSequenceRef.current += 1
    abortReasonRef.current = 'user'
    controllerRef.current?.abort()
  }, [])

  useEffect(() => {
    onWorkspaceStateChange?.({
      generating: status === 'generating',
      hasUnsavedResult: preview !== null && status !== 'saved',
    })
  }, [onWorkspaceStateChange, preview, status])

  const clearDraft = () => {
    if (!draftStorageKey) return
    try {
      localStorage.removeItem(draftStorageKey)
    } catch {
      // The saved artifact is already durable; a stale editor draft is harmless.
    }
  }

  const validateBeforeGenerate = (): string | null => {
    if (!promptText.trim()) return '请先填写原始写作题目。'
    if (!essayText.trim()) return '请先粘贴或输入作文正文。'
    if (promptText.length > 2_000) return '题目内容过长，请控制在 2,000 个字符以内。'
    if (sourceMaterialDescription.length > 4_000) return '图表材料描述过长，请控制在 4,000 个字符以内。'
    if (essayText.length > 12_000) return '作文内容过长，请控制在 12,000 个字符以内。'
    return null
  }

  const handleGenerate = async () => {
    const inputError = validateBeforeGenerate()
    if (inputError) {
      setError({ message: inputError, code: 'INPUT_INVALID' })
      setStatus('error')
      return
    }

    let submission: WritingSubmissionV2
    try {
      submission = createWritingSubmissionV2({
        module,
        task,
        promptText,
        sourceMaterial: needsTaskOneMaterial && sourceMaterialDescription.trim()
          ? { kind: 'text_description', description: sourceMaterialDescription }
          : { kind: 'none' },
        essayText,
      })
    } catch {
      setError({ message: '请检查题目、材料和作文内容后再试。', code: 'SUBMISSION_INVALID' })
      setStatus('error')
      return
    }

    const snapshot = buildWritingContextSnapshot(submission)
    const controller = new AbortController()
    const requestSequence = requestSequenceRef.current + 1
    requestSequenceRef.current = requestSequence
    controllerRef.current = controller
    abortReasonRef.current = null
    const timeout = window.setTimeout(() => {
      if (requestSequenceRef.current !== requestSequence) return
      abortReasonRef.current = 'timeout'
      controller.abort()
    }, GENERATION_TIMEOUT_MS)

    setStatus('generating')
    setPreview(null)
    setSavedRecordId(null)
    setError(null)

    try {
      const result = await executeReadOnlyAi({
        purpose: 'writing_feedback',
        snapshot,
        // The complete writing request lives in the purpose-scoped snapshot.
        // Managed wire keeps userInput empty so no second instruction channel
        // can contradict the submission contract.
        userInput: '',
        signal: controller.signal,
      })
      if (requestSequenceRef.current !== requestSequence) return
      const feedback = result.content
      const generatedAt = result.artifact?.createdAt ?? new Date().toISOString()
      setPreview({
        submission,
        feedback,
        overallBand: calculateWritingOverallBand(feedback),
        snapshot,
        source: result.source,
        runId: result.run?.runId,
        providerArtifactId: result.artifact?.artifactId,
        generatedAt,
        dataAsOf: result.artifact?.dataAsOf ?? snapshot.dataAsOf,
        contextHash: result.artifact?.contextHash ?? snapshot.contextHash,
        warnings: result.warnings,
      })
      setStatus('preview')
    } catch (caught) {
      if (requestSequenceRef.current !== requestSequence) return
      if (controller.signal.aborted && abortReasonRef.current === 'user') {
        setStatus('editing')
        setError(null)
        return
      }
      const gatewayError = caught instanceof AiGatewayError ? caught : null
      setError({
        message: abortReasonRef.current === 'timeout'
          ? '写作批改等待超时，作文草稿已经保留，请稍后重试。'
          : gatewayError?.message ?? '暂时无法生成写作反馈，作文草稿已经保留。',
        code: abortReasonRef.current === 'timeout' ? 'TIMEOUT' : gatewayError?.code ?? 'UNKNOWN',
      })
      setStatus('error')
    } finally {
      window.clearTimeout(timeout)
      if (controllerRef.current === controller) {
        controllerRef.current = null
        abortReasonRef.current = null
      }
    }
  }

  const handleCancel = () => {
    requestSequenceRef.current += 1
    abortReasonRef.current = 'user'
    controllerRef.current?.abort()
    setStatus('editing')
    setError(null)
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
        promptVersion: 'writing-feedback-v2',
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
      promptVersion: 'writing-feedback-v2',
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
    setPreview(null)
    setSavedRecordId(null)
    setError(null)
    setStatus('editing')
  }

  if (preview && (status === 'preview' || status === 'saving' || status === 'saved')) {
    return (
      <div className="space-y-4" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
          <Button type="button" variant="ghost" size="sm" onClick={returnToEditor} disabled={status === 'saving'}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            返回修改
          </Button>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{preview.source === 'managed' ? 'Lexi 内置 AI' : '自定义 AI'}</Badge>
            <Badge variant="secondary">{preview.submission.wordCount} 词</Badge>
            {status === 'saved' && <Badge className="gap-1"><CheckCircle2 className="size-3" />已保存</Badge>}
          </div>
        </div>

        <WritingFeedbackContent
          submission={preview.submission}
          feedback={preview.feedback}
          overallBand={preview.overallBand}
        />

        {preview.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {preview.warnings.map((warning) => <p key={warning}>· {warning}</p>)}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2" role="alert">
            <p className="text-sm text-destructive">{error.message}</p>
            <details className="mt-1 text-[11px] text-muted-foreground">
              <summary className="cursor-pointer">技术详情</summary>
              <p className="mt-1">错误代码：{error.code ?? 'UNKNOWN'}</p>
            </details>
          </div>
        )}

        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-popover/95 px-4 py-3 backdrop-blur sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={handleExport}>
            <Download className="size-4" aria-hidden="true" />
            导出 Markdown
          </Button>
          <Button type="button" onClick={handleSave} disabled={status === 'saving' || status === 'saved'}>
            {status === 'saving' ? <AILoadingState text="保存中" /> : <Save className="size-4" aria-hidden="true" />}
            {status === 'saving' ? '保存中…' : status === 'saved' ? '已保存到 AI 内容库' : '保存报告'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5" aria-busy={status === 'generating'}>
      {access.status === 'locked' && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">请先确认这台设备的账号归属</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">作文草稿不会发送；处理后才能使用内置 AI 并安全保存报告。</p>
          </div>
          <Button type="button" size="sm" onClick={(event) => openAccountDialog(event.currentTarget)}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            查看账号状态
          </Button>
        </div>
      )}

      <section className="space-y-3">
        <div>
          <p className="text-sm font-semibold">1. 选择考试类型</p>
          <p className="mt-0.5 text-xs text-muted-foreground">用于选择对应的 Task Achievement / Task Response 评分标准。</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={module === 'academic' ? 'default' : 'outline'}
            onClick={() => setModule('academic')}
            disabled={inputLocked}
          >
            Academic
          </Button>
          <Button
            type="button"
            variant={module === 'general_training' ? 'default' : 'outline'}
            onClick={() => setModule('general_training')}
            disabled={inputLocked}
          >
            General Training
          </Button>
          <Button
            type="button"
            variant={task === 'task1' ? 'secondary' : 'outline'}
            onClick={() => setTask('task1')}
            disabled={inputLocked}
          >
            <FileText className="size-4" aria-hidden="true" />Task 1
          </Button>
          <Button
            type="button"
            variant={task === 'task2' ? 'secondary' : 'outline'}
            onClick={() => setTask('task2')}
            disabled={inputLocked}
          >
            <FileText className="size-4" aria-hidden="true" />Task 2
          </Button>
        </div>
      </section>

      <section className="space-y-2 border-t border-border/70 pt-4">
        <div className="flex items-end justify-between gap-3">
          <Label htmlFor="writing-task-prompt" className="text-sm font-semibold">2. 原始题目</Label>
          <span className="text-[11px] tabular-nums text-muted-foreground">{promptText.length} / 2000</span>
        </div>
        <Textarea
          id="writing-task-prompt"
          value={promptText}
          onChange={(event) => setPromptText(event.target.value)}
          disabled={inputLocked}
          maxLength={2_000}
          rows={4}
          className="min-h-24 resize-y"
          placeholder={task === 'task1' ? '粘贴完整 Task 1 题目、说明和要点…' : '粘贴完整 Task 2 题目…'}
        />
      </section>

      {needsTaskOneMaterial && (
        <section className="space-y-2 border-t border-border/70 pt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <Label htmlFor="writing-source-material" className="text-sm font-semibold">3. 图表材料</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">首版请用文字写明图表类型、时间范围、单位和关键数据。</p>
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground">{sourceMaterialDescription.length} / 4000</span>
          </div>
          <Textarea
            id="writing-source-material"
            value={sourceMaterialDescription}
            onChange={(event) => setSourceMaterialDescription(event.target.value)}
            disabled={inputLocked}
            maxLength={4_000}
            rows={5}
            className="min-h-28 resize-y"
            placeholder="例如：折线图显示 2000–2020 年三座城市公共交通使用率，纵轴单位为百分比…"
          />
          {!sourceMaterialDescription.trim() && (
            <p className="flex items-start gap-1.5 text-xs leading-5 text-amber-700 dark:text-amber-300">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              缺少图表材料时，AI 只能给语言反馈，不会显示精确 Task Achievement 分数。
            </p>
          )}
        </section>
      )}

      <section className="space-y-2 border-t border-border/70 pt-4">
        <div className="flex items-end justify-between gap-3">
          <Label htmlFor="writing-essay" className="text-sm font-semibold">{needsTaskOneMaterial ? '4' : '3'}. 作文正文</Label>
          <span className={cn('text-xs tabular-nums', belowMinimum ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
            {wordCount} 词
          </span>
        </div>
        <Textarea
          id="writing-essay"
          value={essayText}
          onChange={(event) => setEssayText(event.target.value)}
          disabled={inputLocked}
          maxLength={12_000}
          rows={14}
          className="min-h-72 resize-y font-mono text-[13px] leading-6"
          placeholder="粘贴或输入你的英文作文…"
        />
        <p className={cn('text-xs leading-5', belowMinimum ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
          {belowMinimum
            ? `当前少于 IELTS ${task === 'task1' ? 'Task 1' : 'Task 2'} 的 ${minimumWords} 词最低要求；仍可批改，但报告会说明这一局限。`
            : `IELTS ${task === 'task1' ? 'Task 1' : 'Task 2'} 建议不少于 ${minimumWords} 词。`}
        </p>
      </section>

      {error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2" role="alert">
          <p className="text-sm text-destructive">{error.message}</p>
          <details className="mt-1 text-[11px] text-muted-foreground">
            <summary className="cursor-pointer">技术详情</summary>
            <p className="mt-1">错误代码：{error.code ?? 'UNKNOWN'}</p>
          </details>
        </div>
      )}

      {status === 'generating' && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-subject-writing-border bg-subject-writing-soft px-3 py-2.5" role="status" aria-live="polite">
          <div className="flex min-w-0 items-center gap-2">
            <AILoadingState text="正在对照题目和评分标准" />
            <span className="truncate text-xs text-muted-foreground">作文草稿已保留</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
            <Square className="size-3" fill="currentColor" aria-hidden="true" />停止
          </Button>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-popover/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-4 text-muted-foreground">
          {routeMode === 'managed' ? '作文仅用于本次 Lexi 内置 AI 请求，服务端默认不保存正文。' : '作文会发送到你在高级设置中配置的自定义 AI 服务商。'}
        </p>
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={status === 'generating' || access.status === 'locked' || !promptText.trim() || !essayText.trim()}
          className="shrink-0 bg-subject-writing text-white hover:bg-subject-writing/90"
        >
          {status === 'error' ? <RefreshCcw className="size-4" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          {status === 'error' ? '重新生成' : '生成写作反馈'}
        </Button>
      </div>
    </div>
  )
}
