import { useAIStore } from '@/stores/aiStore'
import { useStreakStore } from '@/stores/streakStore'
import { useWordStore } from '@/stores/wordStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useTimerStore } from '@/stores/timerStore'
import { usePlanStore } from '@/stores/planStore'
import { useDiaryStore } from '@/stores/diaryStore'
import { useAchievementStore } from '@/stores/achievementStore'

// ===== AI 工具：获取用户全部学习数据 =====
export function getAllLearningData() {
  const streak = useStreakStore.getState()
  const words = useWordStore.getState()
  const practice = usePracticeStore.getState()
  const timer = useTimerStore.getState()
  const plans = usePlanStore.getState()
  const diary = useDiaryStore.getState()
  const achievement = useAchievementStore.getState()

  // 汇总统计
  const totalPractice = practice.records.length
  const totalTimer = timer.records.length
  const totalWords = words.records.reduce((sum, r) => sum + r.count, 0)
  const totalDiary = diary.entries.length

  // 模考按科目分组统计
  const practiceByType: Record<string, { count: number; avgScore: number; avgDuration: number }> = {}
  for (const type of ['reading', 'listening', 'writing', 'speaking'] as const) {
    const records = practice.records.filter((r) => r.type === type)
    const scored = records.filter((r) => r.score && r.score > 0)
    practiceByType[type] = {
      count: records.length,
      avgScore: scored.length > 0 ? scored.reduce((s, r) => s + (r.score || 0), 0) / scored.length : 0,
      avgDuration: records.length > 0 ? records.reduce((s, r) => s + r.duration, 0) / records.length : 0,
    }
  }

  // 计时练习按科目分组
  const timerBySubject: Record<string, { count: number; totalDuration: number }> = {}
  for (const subject of ['reading', 'listening', 'writing', 'speaking'] as const) {
    const records = timer.records.filter((r) => r.subject === subject)
    timerBySubject[subject] = {
      count: records.length,
      totalDuration: records.reduce((s, r) => s + r.duration, 0),
    }
  }

  // 连续打卡天数
  const today = new Date().toISOString().split('T')[0]
  const streakDays = streak.currentStreak
  const activeDates = Object.keys(streak.heatmapData).filter((k) => streak.heatmapData[k] > 0).sort()

  // 最近 30 天数据
  const last30Days: Record<string, { activity: boolean; wordCount: number; practiceCount: number }> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    last30Days[dateStr] = {
      activity: (streak.heatmapData[dateStr] ?? 0) > 0,
      wordCount: words.records.filter((r) => r.date === dateStr).reduce((s, r) => s + r.count, 0),
      practiceCount: practice.records.filter((r) => r.date === dateStr).length + timer.records.filter((r) => r.date === dateStr).length,
    }
  }

  return {
    today,
    streakDays,
    totalActiveDays: activeDates.length,
    totalPractice,
    totalTimer,
    totalWords,
    totalDiary,
    currentLevel: achievement.getCurrentLevel(),
    totalXP: achievement.totalXP,
    practiceByType,
    timerBySubject,
    last30Days,
    plans: plans.plans.map((p) => ({ title: p.title, category: p.category, isActive: p.isActive })),
    recentDiaries: diary.entries.slice(0, 5).map((d) => ({ date: d.date, mood: d.mood, content: d.content.substring(0, 80) + (d.content.length > 80 ? '...' : '') })),
    recentPractice: practice.records.slice(0, 5).map((r) => ({ date: r.date, type: r.type, score: r.score, duration: r.duration })),
    recentTimer: timer.records.slice(0, 5).map((r) => ({ date: r.date, subject: r.subject, duration: r.duration })),
  }
}

// ===== AI 对话消息类型 =====
export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface AIStreamCallbacks {
  onContent?: (content: string) => void
  onToolCall?: (toolCall: ToolCall) => void
  onError?: (error: string) => void
  onDone?: () => void
}

// ===== 调用 Agnes AI API（流式） =====
export async function streamAIChat(
  messages: AIMessage[],
  callbacks: AIStreamCallbacks,
  options?: { temperature?: number; max_tokens?: number; signal?: AbortSignal }
) {
  const { apiKey, baseURL, model } = useAIStore.getState()

  if (!apiKey) {
    callbacks.onError?.('请先配置 AI API Key')
    return
  }

  try {
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: options?.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 4096,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      callbacks.onError?.(`API 错误 (${response.status}): ${err}`)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError?.('无法读取响应')
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let currentContent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue

        try {
          const data = JSON.parse(trimmed.slice(6))
          const delta = data.choices?.[0]?.delta
          if (!delta) continue

          // 文本内容
          if (delta.content) {
            currentContent += delta.content
            callbacks.onContent?.(currentContent)
          }

          // Tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.function?.name) {
                callbacks.onToolCall?.({
                  id: tc.id || '',
                  type: 'function',
                  function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments || '',
                  },
                })
              }
            }
          }
        } catch {
          // 忽略解析错误
        }
      }
    }

    callbacks.onDone?.()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      callbacks.onError?.('流式生成已中断')
      return
    }
    callbacks.onError?.(error instanceof Error ? error.message : '网络请求失败')
  }
}

// ===== 非流式调用（用于简单请求） =====
export async function chatAI(messages: AIMessage[], options?: { temperature?: number; max_tokens?: number }) {
  const { apiKey, baseURL, model } = useAIStore.getState()

  if (!apiKey) {
    throw new Error('请先配置 AI API Key')
  }

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 4096,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API 错误 (${response.status}): ${err}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message
}

// ===== 检测 API 连接 =====
export async function testAIConnection(): Promise<{ ok: boolean; message: string }> {
  const { apiKey, baseURL, model } = useAIStore.getState()

  if (!apiKey) {
    return { ok: false, message: '未配置 API Key' }
  }

  try {
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
    })

    if (response.ok) {
      return { ok: true, message: '连接成功' }
    } else {
      const err = await response.text()
      return { ok: false, message: `连接失败: ${err}` }
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '网络错误' }
  }
}
