import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Library,
  Lightbulb,
  PenLine,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import {
  aiArtifactToMarkdown,
  listAiArtifactsForAccess,
  serializePortableAiArtifacts,
  type AiArtifactKindV2,
  type AiArtifactRecordV2,
} from '@/ai/artifactRepository'
import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import {
  DailySuggestionContent,
  LearningAnalysisContent,
  WritingFeedbackContent,
} from '@/components/ai/StructuredAIContent'
import { SafeAIContent } from '@/components/ai/SafeAIContent'
import { useAccountDialog } from '@/components/account/accountDialogContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toLocalDate } from '@/lib/localDate'
import { useAiArtifactStore } from '@/stores/aiArtifactStore'

type ArtifactFilter = 'all' | AiArtifactKindV2
const PAGE_SIZE = 6

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function artifactTypeLabel(kind: AiArtifactKindV2) {
  return kind === 'daily_suggestion'
    ? '每日建议'
    : kind === 'learning_analysis'
      ? '学习分析'
      : '写作批改'
}

function sourceLabel(artifact: AiArtifactRecordV2) {
  if (artifact.source === 'managed') return 'Lexi AI'
  if (artifact.source === 'custom') return '历史外部来源'
  return '旧版导入'
}

export function AiArtifactLibrary() {
  const access = useAiArtifactAccess()
  const artifacts = useAiArtifactStore((state) => state.artifacts)
  const integrity = useAiArtifactStore((state) => state.integrity)
  const deleteArtifact = useAiArtifactStore((state) => state.deleteArtifact)
  const { openAccountDialog } = useAccountDialog()
  const [filter, setFilter] = useState<ArtifactFilter>('all')
  const [page, setPage] = useState(1)
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [pendingDeleteRecordId, setPendingDeleteRecordId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const visible = useMemo(
    () => listAiArtifactsForAccess(artifacts, access, filter === 'all' ? undefined : filter),
    [access, artifacts, filter],
  )
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const pageItems = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  // Derive detail/delete targets from the currently authorized list. An auth
  // change therefore removes content synchronously instead of leaving a stale
  // artifact object inside an open dialog.
  const selected = selectedRecordId
    ? visible.find((artifact) => artifact.recordId === selectedRecordId) ?? null
    : null
  const pendingDelete = pendingDeleteRecordId
    ? visible.find((artifact) => artifact.recordId === pendingDeleteRecordId) ?? null
    : null

  useEffect(() => {
    setPage(1)
  }, [filter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    if (selectedRecordId && !selected) setSelectedRecordId(null)
    if (pendingDeleteRecordId && !pendingDelete) {
      setPendingDeleteRecordId(null)
      setDeleteError('')
    }
  }, [pendingDelete, pendingDeleteRecordId, selected, selectedRecordId])

  const exportAll = () => {
    if (visible.length === 0) return
    downloadText(
      `lexi-tracker-ai-content-${toLocalDate()}.json`,
      serializePortableAiArtifacts(visible),
      'application/json',
    )
  }

  const exportOne = (artifact: AiArtifactRecordV2) => {
    downloadText(
      `lexi-tracker-${artifact.kind}-${artifact.createdAt.slice(0, 10)}.md`,
      aiArtifactToMarkdown(artifact),
      'text/markdown;charset=utf-8',
    )
  }

  return (
    <Card id="ai-content-library" className="scroll-mt-24 ring-1 ring-primary/10">
      <CardHeader className="border-b border-border/70 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-[15px] md:text-base">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Library className="size-4" aria-hidden="true" />
              </span>
              AI 内容库
              {integrity.status === 'corrupt'
                ? <Badge variant="destructive">需恢复</Badge>
                : access.status === 'ready' && <Badge variant="secondary">{visible.length}</Badge>}
            </CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              保存重要报告，按需下载归档。
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={exportAll} disabled={visible.length === 0 || integrity.status !== 'ready'}>
            <Download className="size-3.5" aria-hidden="true" />
            下载当前报告
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {integrity.status === 'corrupt' ? (
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
            <p className="text-sm font-medium">本机 AI 内容需要恢复</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              系统已暂停读取、写入和报告下载，避免覆盖原始内容。请保留当前浏览器数据，等待恢复工具处理。
            </p>
          </div>
        ) : access.status === 'locked' ? (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">当前账号不能读取这台设备的 AI 内容</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">内容没有被删除；处理账号归属后会重新显示。</p>
            </div>
            <Button type="button" size="sm" onClick={(event) => openAccountDialog(event.currentTarget)}>
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              查看安全状态
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5" aria-label="筛选 AI 内容">
              {([
                ['all', '全部'],
                ['daily_suggestion', '每日建议'],
                ['learning_analysis', '学习分析'],
                ['writing_feedback', '写作批改'],
              ] as const).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={filter === value ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                >
                  {label}
                </Button>
              ))}
            </div>

            {pageItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <Library className="mx-auto size-6 text-muted-foreground/60" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium">还没有保存的 AI 内容</p>
                <p className="mt-1 text-xs text-muted-foreground">保存学习建议、分析或写作批改后会显示在这里。</p>
              </div>
            ) : (
              <div className="divide-y divide-border/70 rounded-xl border border-border/70">
                {pageItems.map((artifact) => {
                  const Icon = artifact.kind === 'daily_suggestion'
                    ? Lightbulb
                    : artifact.kind === 'writing_feedback'
                      ? PenLine
                      : FileText
                  return (
                    <div key={artifact.recordId} className="flex items-center gap-2.5 p-3">
                      <button
                        type="button"
                        onClick={() => setSelectedRecordId(artifact.recordId)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        aria-label={`查看${artifactTypeLabel(artifact.kind)}：${artifact.title}`}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{artifact.title}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {artifactTypeLabel(artifact.kind)} · {sourceLabel(artifact)} · {new Date(artifact.createdAt).toLocaleDateString('zh-CN')}
                          </span>
                        </span>
                      </button>
                      <Button type="button" variant="ghost" size="icon-sm" className="size-10 sm:size-7" onClick={() => exportOne(artifact)} aria-label={`导出${artifact.title}`}>
                        <Download className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-10 sm:size-7"
                        onClick={() => {
                          setDeleteError('')
                          setPendingDeleteRecordId(artifact.recordId)
                        }}
                        aria-label={`删除${artifact.title}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>第 {page} / {totalPages} 页</span>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="icon-sm" className="size-10 sm:size-7" disabled={page === 1} onClick={() => setPage((value) => value - 1)} aria-label="上一页">
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  <Button type="button" variant="outline" size="icon-sm" className="size-10 sm:size-7" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} aria-label="下一页">
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelectedRecordId(null) }}>
        <DialogContent className="max-h-[88dvh] max-w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:!h-[min(90dvh,60rem)] sm:!max-h-[90dvh] sm:!w-[min(94vw,72rem)] sm:!max-w-none">
          {selected && (
            <>
              <DialogHeader className="shrink-0 border-b bg-background/95 px-5 pb-3 pt-5 backdrop-blur sm:px-6">
                <DialogTitle className="pr-8">{selected.title}</DialogTitle>
                <DialogDescription>
                  {artifactTypeLabel(selected.kind)} · {sourceLabel(selected)} · {new Date(selected.createdAt).toLocaleString('zh-CN')}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
                {selected.outputSchemaVersion === 2 && selected.kind === 'daily_suggestion' ? (
                  <DailySuggestionContent value={selected.content} />
                ) : selected.outputSchemaVersion === 2 && selected.kind === 'learning_analysis' ? (
                  <LearningAnalysisContent value={selected.content} />
                ) : selected.outputSchemaVersion === 2 && selected.kind === 'writing_feedback' ? (
                  <>
                    <WritingFeedbackContent
                      submission={selected.content.submission}
                      feedback={selected.content.feedback}
                      overallBand={selected.content.overallBand}
                    />
                    <details className="mt-5 rounded-lg border border-border/70 px-3 py-2">
                      <summary className="cursor-pointer text-sm font-medium">查看原始作文</summary>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {selected.content.submission.essayText}
                      </p>
                    </details>
                  </>
                ) : (
                  <SafeAIContent content={selected.markdownProjection} variant="report" />
                )}
              </div>
              <DialogFooter className="mx-0 mb-0 shrink-0 px-5 py-3 sm:px-6">
                <Button type="button" variant="outline" onClick={() => exportOne(selected)}>
                  <Download className="size-4" />
                  导出 Markdown
                </Button>
                <Button type="button" onClick={() => setSelectedRecordId(null)}>关闭</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => {
        if (!open) {
          setPendingDeleteRecordId(null)
          setDeleteError('')
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除这条 AI 内容？</DialogTitle>
            <DialogDescription>删除不会影响学习记录，且无法撤销。</DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm leading-5 text-destructive" role="alert">{deleteError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDeleteRecordId(null)}>取消</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) return
                try {
                  const deleted = deleteArtifact(pendingDelete.recordId, access)
                  if (!deleted) {
                    setDeleteError('账号状态已经变化，这条内容没有被删除。')
                    return
                  }
                  if (selected?.recordId === pendingDelete.recordId) setSelectedRecordId(null)
                  setPendingDeleteRecordId(null)
                  setDeleteError('')
                } catch {
                  setDeleteError('无法保存删除结果，本机内容保持不变。请检查存储空间后重试。')
                }
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
