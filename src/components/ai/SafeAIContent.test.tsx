import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SafeAIContent } from './SafeAIContent'
import { sanitizeAIExternalUrl } from './safeAIUrl'

describe('sanitizeAIExternalUrl', () => {
  it('only permits absolute HTTP and HTTPS links', () => {
    expect(sanitizeAIExternalUrl('https://example.com/guide?q=1')).toBe(
      'https://example.com/guide?q=1',
    )
    expect(sanitizeAIExternalUrl('http://example.com/path')).toBe('http://example.com/path')

    expect(sanitizeAIExternalUrl('/internal')).toBeUndefined()
    expect(sanitizeAIExternalUrl('//example.com/path')).toBeUndefined()
    expect(sanitizeAIExternalUrl('mailto:hello@example.com')).toBeUndefined()
    expect(sanitizeAIExternalUrl('javascript:alert(1)')).toBeUndefined()
    expect(sanitizeAIExternalUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(sanitizeAIExternalUrl('file:///etc/passwd')).toBeUndefined()
    expect(sanitizeAIExternalUrl('https:\n//example.com')).toBeUndefined()
  })
})

describe('SafeAIContent', () => {
  it('isolates safe external links', () => {
    const html = renderToStaticMarkup(
      <SafeAIContent content="[官方说明](https://example.com/docs)" />,
    )

    expect(html).toContain('href="https://example.com/docs"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('keeps unsafe-link labels readable without creating links', () => {
    const html = renderToStaticMarkup(
      <SafeAIContent content="[不要点击](javascript:alert(1)) [本地文件](file:///tmp/private)" />,
    )

    expect(html).toContain('不要点击')
    expect(html).toContain('本地文件')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('file:///')
  })

  it('never loads images and only retains their alternative text', () => {
    const html = renderToStaticMarkup(
      <SafeAIContent content="![进度图](https://tracker.example/pixel.png) ![内嵌图](data:image/svg+xml,test)" />,
    )

    expect(html).not.toContain('<img')
    expect(html).not.toContain('tracker.example')
    expect(html).not.toContain('data:image')
    expect(html).toContain('图片已隐藏：进度图')
    expect(html).toContain('图片已隐藏：内嵌图')
  })

  it('discards raw HTML while preserving common Markdown', () => {
    const html = renderToStaticMarkup(
      <SafeAIContent
        content={'<script>alert(1)</script>\n<div onclick="alert(2)">危险</div>\n\n## 建议\n\n- 练习阅读\n- 复习单词\n\n`focus`'}
      />,
    )

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<div onclick')
    expect(html).not.toContain('alert(1)')
    expect(html).not.toContain('危险')
    expect(html).toContain('<h2')
    expect(html).toContain('<ul')
    expect(html).toContain('<code')
    expect(html).toContain('练习阅读')
    expect(html).toContain('focus')
  })

  it('also discards raw HTML images and links before they can load or navigate', () => {
    const html = renderToStaticMarkup(
      <SafeAIContent
        content={'<img src="https://tracker.example/raw-pixel.png" alt="跟踪图">\n<a href="javascript:alert(1)">危险链接</a>'}
      />,
    )

    expect(html).not.toContain('<img')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('tracker.example')
    expect(html).not.toContain('javascript:')
  })
})
