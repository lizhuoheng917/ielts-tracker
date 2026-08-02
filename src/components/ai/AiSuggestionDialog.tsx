import { useEffect, useRef, useState } from 'react'
import { Sparkles, RefreshCw, AlertCircle, Loader2, Calendar, Lightbulb, ShieldCheck, Library } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { executeReadOnlyAi } from '@/ai/readOnlyExecution'
import { createCurrentLearningContext } from '@/ai/runtimeContext'
import { AiGatewayError, type AiGatewayErrorCode } from '@/ai/gateway'
import { isDailySuggestionV2, type DailySuggestionV2 } from '@/ai/structuredOutputs'
import { useAccountDialog } from '@/components/account/accountDialogContext'
import { DailySuggestionContent } from '@/components/ai/StructuredAIContent'
import { SafeAIContent } from '@/components/ai/SafeAIContent'
import { useAiArtifactStore } from '@/stores/aiArtifactStore'
import { latestAiArtifactForAccess } from '@/ai/artifactRepository'
import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import { useAIPrivacyStore } from '@/stores/aiPrivacyStore'
import { useAIStore } from '@/stores/aiStore'

interface AiSuggestionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface UnsavedDailySuggestionPreview {
  outputSchemaVersion: 2
  kind: 'daily_suggestion'
  content: DailySuggestionV2
  createdAt: string
  source: 'custom'
}

export function AiSuggestionDialog({ open: _open, onOpenChange: _onOpenChange }: AiSuggestionDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState<AiGatewayErrorCode | null>(null)
  const [previewSuggestion, setPreviewSuggestion] = useState<UnsavedDailySuggestionPreview | null>(null)
  const { openAccountDialog } = useAccountDialog()
  const navigate = useNavigate()
  const artifactAccess = useAiArtifactAccess()
  const artifacts = useAiArtifactStore((state) => state.artifacts)
  const saveDailySuggestion = useAiArtifactStore((state) => state.saveDailySuggestion)
  const suggestion = latestAiArtifactForAccess(artifacts, artifactAccess, 'daily_suggestion')
  const defaultRangeDays = useAIPrivacyStore((state) => state.defaultRangeDays)
  const includeDiaryExcerpts = useAIPrivacyStore((state) => state.includeDiaryExcerpts)
  const aiRouteMode = useAIStore((state) => state.routeMode)
  const requestSequenceRef = useRef(0)
  const currentExecutionKey = `${JSON.stringify(artifactAccess)}|${aiRouteMode}`
  const currentExecutionKeyRef = useRef(currentExecutionKey)
  currentExecutionKeyRef.current = currentExecutionKey
  const displaySuggestion = previewSuggestion ?? suggestion

  useEffect(() => {
    requestSequenceRef.current += 1
    setPreviewSuggestion(null)
    setIsLoading(false)
  }, [currentExecutionKey])

  useEffect(() => {
    if (_open) return
    requestSequenceRef.current += 1
    setPreviewSuggestion(null)
    setIsLoading(false)
  }, [_open])

  const generateSuggestion = async () => {
    const requestSequence = ++requestSequenceRef.current
    const requestExecutionKey = currentExecutionKey
    setIsLoading(true)
    setError('')
    setErrorCode(null)

    if (artifactAccess.status === 'locked' && aiRouteMode === 'managed') {
      const code: AiGatewayErrorCode = artifactAccess.reason === 'account-mismatch'
        ? 'LOCAL_DATA_ACCOUNT_MISMATCH'
        : 'LOCAL_DATA_BINDING_UNAVAILABLE'
      setErrorCode(code)
      setError(code === 'LOCAL_DATA_ACCOUNT_MISMATCH'
        ? '本机 AI 内容属于另一个 Lexi 账号，当前账号不能读取或写入。'
        : '无法安全确认本机 AI 内容归属，请先处理账号安全状态。')
      setIsLoading(false)
      return
    }

    const snapshot = createCurrentLearningContext({ purpose: 'daily_suggestion' })
    let responseReceived = false
    try {
      const result = await executeReadOnlyAi({
        purpose: 'daily_suggestion',
        snapshot,
        userInput: '生成建议',
      })
      if (!isDailySuggestionV2(result.content)) {
        throw new AiGatewayError('INVALID_RESPONSE', 'AI 返回的建议格式不完整，请重新生成。', true)
      }
      if (
        requestSequence !== requestSequenceRef.current
        || requestExecutionKey !== currentExecutionKeyRef.current
      ) return
      responseReceived = true
      if (artifactAccess.status === 'locked') {
        setPreviewSuggestion({
          outputSchemaVersion: 2,
          kind: 'daily_suggestion',
          content: result.content,
          createdAt: result.artifact?.createdAt ?? result.run?.completedAt ?? new Date().toISOString(),
          source: 'custom',
        })
      } else {
        saveDailySuggestion({
          content: result.content,
          recordId: result.artifact?.artifactId,
          providerArtifactId: result.artifact?.artifactId,
          createdAt: result.artifact?.createdAt,
          dataAsOf: result.artifact?.dataAsOf ?? snapshot.dataAsOf,
          source: result.source,
          snapshotId: result.run?.snapshotId ?? snapshot.snapshotId,
          contextHash: result.artifact?.contextHash ?? snapshot.contextHash,
          rangeDays: defaultRangeDays,
          quality: snapshot.quality.status,
          runId: result.artifact?.runId ?? result.run?.runId,
          warnings: result.warnings,
        }, artifactAccess)
      }
    } catch (caughtError) {
      if (
        requestSequence !== requestSequenceRef.current
        || requestExecutionKey !== currentExecutionKeyRef.current
      ) return
      setErrorCode(caughtError instanceof AiGatewayError ? caughtError.code : null)
      setError(caughtError instanceof AiGatewayError
        ? caughtError.message
        : responseReceived
          ? '建议已生成，但无法保存到当前设备。请先导出或删除部分本机数据后重试。'
          : '未收到 AI 响应，请稍后重试。')
    } finally {
      if (
        requestSequence === requestSequenceRef.current
        && requestExecutionKey === currentExecutionKeyRef.current
      ) setIsLoading(false)
    }
  }

  const needsAccountAction = errorCode === 'UNAUTHORIZED'
    || errorCode === 'LOCAL_DATA_UNBOUND'
    || errorCode === 'LOCAL_DATA_ACCOUNT_MISMATCH'
    || errorCode === 'LOCAL_DATA_BINDING_UNAVAILABLE'

  const openAccountRecovery = () => {
    _onOpenChange(false)
    window.setTimeout(() => openAccountDialog(null), 0)
  }

  return (
    <div className="space-y-4">
      {/* 加载状态 */}
      {isLoading && (
        <Card size="sm" className="border-indigo-200 dark:border-indigo-800">
          <CardContent className="py-6">
            <div className="flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
              <p className="text-sm font-medium text-muted-foreground">正在生成学习建议...</p>
            </div>
            {/* 警告提示 */}
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/30 px-3 py-2 mt-4">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="text-[12px] text-amber-700 dark:text-amber-400">
                请勿关闭弹窗或切换页面，以免生成中断
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="space-y-3 rounded-lg bg-destructive/10 px-3 py-3 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          {needsAccountAction && (
            <Button type="button" size="sm" variant="outline" onClick={openAccountRecovery}>
              <ShieldCheck className="h-4 w-4" />
              {errorCode === 'UNAUTHORIZED' ? '登录 Lexi 账号' : '查看账号安全状态'}
            </Button>
          )}
        </div>
      )}

      {/* 建议报告 */}
      {!isLoading && displaySuggestion && (
        <Card size="sm" className="overflow-hidden border-primary/15 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-primary/[0.045] py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
              </div>
              今日学习建议
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 pb-3">
            {displaySuggestion.outputSchemaVersion === 2 && displaySuggestion.kind === 'daily_suggestion' ? (
              <DailySuggestionContent value={displaySuggestion.content} />
            ) : (
              <SafeAIContent content={displaySuggestion.markdownProjection} variant="compact" />
            )}
            <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {new Date(displaySuggestion.createdAt).toLocaleDateString('zh-CN')} 生成
                {` · ${displaySuggestion.source === 'managed' ? 'Lexi 内置 AI' : displaySuggestion.source === 'custom' ? '自定义 AI' : '旧版内容'}`}
                {previewSuggestion ? ' · 仅预览' : ''}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    _onOpenChange(false)
                    navigate('/stats#ai-content-library')
                  }}
                  className="h-7 px-2 text-xs text-muted-foreground"
                >
                  <Library className="h-3 w-3" />
                  内容库
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generateSuggestion}
                  disabled={isLoading}
                  className="h-7 text-xs text-muted-foreground hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  换一批
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {previewSuggestion && (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
          当前账号归属未确认，这次自定义 AI 建议不会保存到内容库。
        </p>
      )}

      {/* 空状态 */}
      {!isLoading && !displaySuggestion && !error && (
        <Card size="sm" className="border-dashed border-indigo-200 dark:border-indigo-800">
          <CardContent className="py-10">
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="relative">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/50 dark:to-violet-900/50">
                  <Sparkles className="h-7 w-7 text-indigo-500 dark:text-indigo-400" />
                </div>
                <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-400 animate-pulse" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">获取个性化学习建议</p>
                <p className="text-xs text-muted-foreground mt-1">AI 将根据你的学习数据生成建议</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 生成按钮 */}
      {!displaySuggestion && (
        <Button 
          onClick={generateSuggestion} 
          disabled={isLoading} 
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white shadow-md hover:shadow-lg transition-all"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              生成中...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              生成今日建议
            </span>
          )}
        </Button>
      )}

      <p className="flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        生成时会重新读取近 {defaultRangeDays} 天结构化记录
        {includeDiaryExcerpts ? '、日记摘要' : ''}
        ，并发送到{aiRouteMode === 'managed' ? ' Lexi 内置 AI' : '你选择的自定义服务商'}；建议生成后自动更新在当前设备。
      </p>
    </div>
  )
}
