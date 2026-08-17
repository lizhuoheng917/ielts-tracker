import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  RefreshCcw,
  Sparkles,
  Square,
  TriangleAlert,
} from 'lucide-react'

import { AiGatewayError } from '@/ai/gateway'
import {
  learnerAiTaskCoordinator,
  learnerAiTaskKey,
  learnerAiTaskScopeKey,
  useLearnerAiTaskState,
} from '@/ai/learnerAiTaskCoordinator'
import {
  managedAiQuotaActionState,
  type ManagedAiQuotaState,
} from '@/ai/managedAiQuota'
import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import {
  buildWritingRevisionSnapshot,
  createWritingRevisionFocuses,
  createWritingRevisionFocusOptions,
  parseWritingRevisionCoachV2,
  parseWritingRevisionInputV1,
  WRITING_REVISION_INPUT_SCHEMA_VERSION,
  type WritingRevisionCoachV2,
  type WritingRevisionFocus,
  type WritingRevisionInputV1,
} from '@/ai/writingRevision'
import { countWritingWords, type WritingFeedbackV2, type WritingSubmission } from '@/ai/writingFeedback'
import { AILoadingState } from '@/components/ai/AILoadingState'
import { AiQuotaNotice } from '@/components/ai/AiQuotaNotice'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const REVISION_LOCAL_VERSION = 1 as const
const REVISION_LOCAL_PREFIX = 'ielts-tracker:writingRevisionCoachV1'

interface WritingRevisionCoachProps {
  submission: WritingSubmission
  feedback: WritingFeedbackV2
  contextHash: string
  quotaActive?: boolean
}

interface RevisionTaskContext {
  input: WritingRevisionInputV1
}

interface StoredRevisionState {
  version: typeof REVISION_LOCAL_VERSION
  selectedKeys: string[]
  revisedEssay: string
  result?: unknown
  updatedAt: string
}

type RevisionStatus = 'idle' | 'generating' | 'result' | 'error'

function loadStoredRevisionState(
  storageKey: string,
  options: ReturnType<typeof createWritingRevisionFocusOptions>,
  submission: WritingSubmission,
): { selectedKeys: string[]; revisedEssay: string; result: WritingRevisionCoachV2 | null; input: WritingRevisionInputV1 | null } | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const stored = value as Record<string, unknown>
    if (
      stored.version !== REVISION_LOCAL_VERSION
      || !Array.isArray(stored.selectedKeys)
      || typeof stored.revisedEssay !== 'string'
      || stored.revisedEssay.length > 12_000
    ) return null
    const optionKeys = new Set(options.map(option => option.key))
    const selectedKeys = stored.selectedKeys
      .filter((key): key is string => typeof key === 'string' && optionKeys.has(key))
      .slice(0, 3)
    if (selectedKeys.length < 1) return null
    const revisedEssay = stored.revisedEssay
    if (!revisedEssay.trim()) return null
    if (stored.result === undefined || revisedEssay.trim() === submission.essayText.trim()) {
      return { selectedKeys, revisedEssay, result: null, input: null }
    }
    const input = parseWritingRevisionInputV1({
      schemaVersion: WRITING_REVISION_INPUT_SCHEMA_VERSION,
      submission,
      revisedEssay,
      revisedWordCount: countWritingWords(revisedEssay),
      focuses: createWritingRevisionFocuses(options, selectedKeys),
    })
    const result = parseWritingRevisionCoachV2(stored.result, input)
    return { selectedKeys, revisedEssay, result, input }
  } catch {
    return null
  }
}

function focusByIndex(focuses: readonly WritingRevisionFocus[], index: number): WritingRevisionFocus | undefined {
  return focuses.find(focus => focus.index === index)
}

export function WritingRevisionCoach({
  submission,
  feedback,
  contextHash,
  quotaActive = true,
}: WritingRevisionCoachProps) {
  const access = useAiArtifactAccess()
  const scopeKey = learnerAiTaskScopeKey(access)
  const options = useMemo(() => createWritingRevisionFocusOptions(feedback), [feedback])
  const defaultSelectedKeys = useMemo(() => options.slice(0, 2).map(option => option.key), [options])
  const taskKey = scopeKey
    ? learnerAiTaskKey('writing_revision_coach', scopeKey, `writing-revision-${contextHash}`)
    : null
  const storageKey = scopeKey
    ? `${REVISION_LOCAL_PREFIX}:${scopeKey}:${contextHash}`
    : null
  const { tasks } = useLearnerAiTaskState()
  const revisionTask = taskKey ? tasks[taskKey] : undefined

  const [expanded, setExpanded] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<string[]>(defaultSelectedKeys)
  const [revisedEssay, setRevisedEssay] = useState(submission.essayText)
  const [status, setStatus] = useState<RevisionStatus>('idle')
  const [result, setResult] = useState<WritingRevisionCoachV2 | null>(null)
  const [resultInput, setResultInput] = useState<WritingRevisionInputV1 | null>(null)
  const [error, setError] = useState<string>('')
  const [quotaState, setQuotaState] = useState<ManagedAiQuotaState>({ status: 'idle', quota: null })
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null)

  const quotaAction = managedAiQuotaActionState(quotaState)
  const revisedWordCount = useMemo(() => countWritingWords(revisedEssay), [revisedEssay])
  const hasChanged = revisedEssay.trim() !== submission.essayText.trim()
  const selectedFocuses = useMemo(() => {
    try {
      return createWritingRevisionFocuses(options, selectedKeys)
    } catch {
      return []
    }
  }, [options, selectedKeys])

  useEffect(() => {
    setLoadedStorageKey(null)
    setExpanded(false)
    setSelectedKeys(defaultSelectedKeys)
    setRevisedEssay(submission.essayText)
    setStatus('idle')
    setResult(null)
    setResultInput(null)
    setError('')
    if (!storageKey) return
    const stored = loadStoredRevisionState(
      storageKey,
      options,
      submission,
    )
    if (stored) {
      setSelectedKeys(stored.selectedKeys)
      setRevisedEssay(stored.revisedEssay)
      setResult(stored.result)
      setResultInput(stored.input)
      setStatus(stored.result ? 'result' : 'idle')
    }
    setLoadedStorageKey(storageKey)
  }, [defaultSelectedKeys, options, storageKey, submission])

  useEffect(() => {
    if (!storageKey || loadedStorageKey !== storageKey || selectedKeys.length < 1) return
    try {
      if (!hasChanged && !result) {
        localStorage.removeItem(storageKey)
        return
      }
      const stored: StoredRevisionState = {
        version: REVISION_LOCAL_VERSION,
        selectedKeys,
        revisedEssay,
        ...(result ? { result } : {}),
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(storageKey, JSON.stringify(stored))
    } catch {
      // Local persistence is a convenience; the editor and generation remain usable.
    }
  }, [hasChanged, loadedStorageKey, result, revisedEssay, selectedKeys, storageKey])

  useEffect(() => {
    if (!revisionTask) return
    if (revisionTask.status === 'running' || revisionTask.status === 'stopping') {
      setStatus('generating')
      setError('')
      return
    }
    if (revisionTask.status === 'succeeded') {
      const taskContext = revisionTask.context as RevisionTaskContext | undefined
      if (!taskContext || !revisionTask.result) {
        setStatus('error')
        setError('未生成可用的改写复查结果，本次不会计入额度。')
      } else {
        try {
          const parsed = parseWritingRevisionCoachV2(revisionTask.result.content, taskContext.input)
          setResult(parsed)
          setResultInput(taskContext.input)
          setStatus('result')
          setError('')
        } catch {
          setStatus('error')
          setError('AI 返回的复查结果无法使用，本次不会计入额度。')
        }
      }
    } else {
      setStatus('error')
      setError(revisionTask.failure?.message ?? '未生成可用的改写复查结果，本次不会计入额度。')
    }
    if (taskKey) learnerAiTaskCoordinator.clearTerminalTask(taskKey)
  }, [revisionTask, taskKey])

  const toggleFocus = (key: string, checked: boolean) => {
    setError('')
    setResult(null)
    setResultInput(null)
    setStatus('idle')
    setSelectedKeys(current => {
      if (!checked) return current.length === 1 ? current : current.filter(item => item !== key)
      if (current.includes(key) || current.length >= 3) return current
      return [...current, key]
    })
  }

  const handleGenerate = () => {
    if (!scopeKey || !taskKey || access.status !== 'ready') {
      setStatus('error')
      setError('请先确认这台设备的账号归属。')
      return
    }
    if (quotaAction.blocked) {
      setStatus('error')
      setError(quotaAction.reason === 'loading' ? '正在读取今日 AI 额度，请稍候。' : '今日改写复查额度不足，请在重置后再试。')
      return
    }
    if (selectedKeys.length < 1 || selectedKeys.length > 3) {
      setStatus('error')
      setError('请选择 1–3 个最想改善的重点。')
      return
    }
    if (!revisedEssay.trim()) {
      setStatus('error')
      setError('请先填写改写后的作文。')
      return
    }
    if (!hasChanged) {
      setStatus('error')
      setError('请先根据报告修改至少一处内容，再进行复查。')
      return
    }

    let input: WritingRevisionInputV1
    try {
      input = parseWritingRevisionInputV1({
        schemaVersion: WRITING_REVISION_INPUT_SCHEMA_VERSION,
        submission,
        revisedEssay,
        revisedWordCount,
        focuses: createWritingRevisionFocuses(options, selectedKeys),
      })
    } catch {
      setStatus('error')
      setError('改写内容或复查重点无效，请检查后再试。')
      return
    }

    const snapshot = buildWritingRevisionSnapshot(input)
    setStatus('generating')
    setError('')
    void learnerAiTaskCoordinator.start({
      key: taskKey,
      purpose: 'writing_revision_coach',
      scopeKey,
      label: '写作改写复查',
      returnPath: '/exam',
      context: { input } satisfies RevisionTaskContext,
      request: {
        purpose: 'writing_revision_coach',
        snapshot,
        userInput: '',
      },
      onSuccess: (executionResult) => {
        try {
          parseWritingRevisionCoachV2(executionResult.content, input)
        } catch {
          throw new AiGatewayError('INVALID_RESPONSE', '未生成可用的改写复查结果，本次不会计入额度。', true)
        }
      },
    })
  }

  const resetRevision = () => {
    if (taskKey) learnerAiTaskCoordinator.clearTerminalTask(taskKey)
    setSelectedKeys(defaultSelectedKeys)
    setRevisedEssay(submission.essayText)
    setResult(null)
    setResultInput(null)
    setStatus('idle')
    setError('')
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey)
      } catch {
        // A stale local draft is harmless if storage cleanup is unavailable.
      }
    }
  }

  if (options.length === 0) return null

  const displayFocuses = resultInput?.focuses ?? selectedFocuses

  return (
    <section className="overflow-hidden rounded-xl border border-subject-writing-border/70 bg-subject-writing-soft/35">
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">根据报告改写</h3>
            {result && <Badge variant="secondary"><CheckCircle2 className="size-3" />已有复查结果</Badge>}
            {!result && hasChanged && <Badge variant="outline">草稿已保留</Badge>}
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">选择重点并修改原文，AI 只复查这些变化，不重新估分。</p>
        </div>
        <Button type="button" variant={expanded ? 'ghost' : 'outline'} size="sm" onClick={() => setExpanded(current => !current)} className="w-full shrink-0 sm:w-auto">
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {expanded ? '收起' : result ? '查看结果' : hasChanged ? '继续改写' : '开始改写'}
        </Button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-subject-writing-border/60 bg-background/75 p-3.5 sm:p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-semibold">本次复查重点</Label>
              <span className="text-xs text-muted-foreground">已选 {selectedKeys.length} / 3</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map(option => {
                const checked = selectedKeys.includes(option.key)
                const disabled = status === 'generating' || (!checked && selectedKeys.length >= 3)
                return (
                  <label key={option.key} className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors',
                    checked ? 'border-subject-writing-border bg-subject-writing-soft/60' : 'border-border/70 bg-background',
                    disabled && 'cursor-not-allowed opacity-55',
                  )}>
                    <Checkbox checked={checked} disabled={disabled} onCheckedChange={value => toggleFocus(option.key, value === true)} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-5 text-foreground">{option.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">{option.guidance}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <Label htmlFor={`writing-revision-${contextHash}`} className="text-sm font-semibold">改写后的作文</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">已放入原文；直接在下方修改即可。</p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{revisedWordCount} 词</span>
            </div>
            <Textarea
              id={`writing-revision-${contextHash}`}
              value={revisedEssay}
              onChange={event => {
                setRevisedEssay(event.target.value)
                setResult(null)
                setResultInput(null)
                setStatus('idle')
                setError('')
              }}
              disabled={status === 'generating'}
              maxLength={12_000}
              rows={10}
              className="min-h-56 w-full resize-y font-mono text-sm leading-6"
            />
            <p className={cn('text-xs', hasChanged ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>
              {hasChanged ? '已检测到修改，可以提交复查。' : '请先修改至少一处内容。'}
            </p>
          </div>

          <AiQuotaNotice
            purpose="writing_revision_coach"
            active={quotaActive && expanded}
            pending={status === 'generating'}
            onStateChange={setQuotaState}
            className="text-sm"
          />

          {status === 'generating' && (
            <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between" role="status">
              <div>
                <AILoadingState text={revisionTask?.status === 'stopping' ? '正在停止等待' : '正在复查改写'} />
                <p className="mt-1 text-xs leading-5 text-muted-foreground">只核对选中的重点；失败不会计入额度。</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => taskKey && learnerAiTaskCoordinator.stopWaiting(taskKey)} disabled={revisionTask?.status === 'stopping'}>
                <Square className="size-3" fill="currentColor" />停止
              </Button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive" role="alert">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-3 rounded-xl border border-border/70 bg-background p-3.5" aria-live="polite">
              <div>
                <div className="flex items-center gap-2"><Sparkles className="size-4 text-subject-writing" /><h4 className="font-semibold">改写复查结果</h4></div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{result.summary}</p>
              </div>

              {result.improved.map(item => (
                <div key={`improved-${item.focusIndex}`} className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.045] p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-200"><CheckCircle2 className="size-4" />已改善 · {focusByIndex(displayFocuses, item.focusIndex)?.title ?? `重点 ${item.focusIndex}`}</p>
                  <p className="mt-1 text-sm leading-6 text-foreground">{item.finding}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">改写稿证据：“{item.evidence}”</p>
                </div>
              ))}

              {result.remaining.map(item => (
                <div key={`remaining-${item.focusIndex}`} className="rounded-lg border border-amber-500/20 bg-amber-500/[0.045] p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-200"><RefreshCcw className="size-4" />还需调整 · {focusByIndex(displayFocuses, item.focusIndex)?.title ?? `重点 ${item.focusIndex}`}</p>
                  <p className="mt-1 text-sm leading-6 text-foreground">{item.finding}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">改写稿证据：“{item.evidence}”</p>
                  <p className="mt-1 text-sm leading-6 text-foreground">下一步：{item.nextStep}</p>
                </div>
              ))}

              {result.newIssues.map((item, index) => (
                <div key={`new-${index}`} className="rounded-lg border border-border bg-muted/35 p-3">
                  <p className="text-sm font-semibold">改写中出现的新问题</p>
                  <p className="mt-1 text-sm leading-6">{item.finding}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">证据：“{item.evidence}” · {item.nextStep}</p>
                </div>
              ))}

              {result.limitations.length > 0 && (
                <p className="text-xs leading-5 text-muted-foreground">复查边界：{result.limitations.join('；')}</p>
              )}

              <div className="flex items-start gap-2 rounded-lg bg-subject-writing-soft px-3 py-2.5">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-subject-writing" />
                <div><p className="text-sm font-semibold">现在只做这一件事</p><p className="mt-0.5 text-sm leading-6 text-muted-foreground">{result.nextAction}</p></div>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={resetRevision} disabled={status === 'generating'} className="w-full sm:w-auto">恢复原文</Button>
            <Button type="button" size="sm" onClick={handleGenerate} disabled={status === 'generating' || quotaAction.blocked || !hasChanged || selectedKeys.length < 1} className="w-full bg-subject-writing text-white hover:bg-subject-writing/90 sm:w-auto">
              {result ? <RefreshCcw className="size-4" /> : <Sparkles className="size-4" />}
              {result ? '重新复查' : '复查改写'}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
