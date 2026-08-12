import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { WordsDailySummaryCard } from './WordsDailySummaryCard'
import { createWordsDailySummaryPreview } from './wordsDailySummary'

describe('Lexi Words daily summary card', () => {
  it('labels the source as cloud-only and keeps Words visually distinct', () => {
    const html = renderToStaticMarkup(
      <WordsDailySummaryCard
        state={{
          status: 'ready',
          summary: createWordsDailySummaryPreview('2026-08-12'),
          refreshedAt: '2026-08-12T05:30:00.000Z',
        }}
        wordsUrl="https://lexi-ielts.pages.dev/"
        onRefresh={() => undefined}
      />,
    )

    expect(html).toContain('/brand/lexi-words-icon.svg')
    expect(html).toContain('Lexi Words · 今日')
    expect(html).toContain('Words 云端记录')
    expect(html).toContain('今日练习')
    expect(html).toContain('待复习')
    expect(html).toContain('Tracker 本地记录保持独立')
    expect(html).toContain('href="https://lexi-ielts.pages.dev/"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('degrades without blocking Tracker when the summary is unavailable', () => {
    const html = renderToStaticMarkup(
      <WordsDailySummaryCard
        state={{ status: 'unavailable', summary: null, refreshedAt: null }}
        wordsUrl="https://lexi-ielts.pages.dev/"
        onRefresh={() => undefined}
      />,
    )

    expect(html).toContain('暂时无法读取 Words 摘要')
    expect(html).toContain('不会影响 Tracker 的本地学习记录和正常使用')
    expect(html).toContain('重试')
  })

  it('does not imply that local-only Words data is complete for an unsigned user', () => {
    const html = renderToStaticMarkup(
      <WordsDailySummaryCard
        state={{ status: 'idle', summary: null, refreshedAt: null }}
        wordsUrl={null}
        onRefresh={() => undefined}
      />,
    )

    expect(html).toContain('登录同一 Lexi 账号后查看')
    expect(html).toContain('本机未同步内容不会被误计入')
    expect(html).toContain('Words 地址待配置')
  })
})
