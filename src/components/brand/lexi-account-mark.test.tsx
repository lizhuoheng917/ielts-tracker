import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { LexiAccountMark } from './lexi-account-mark'

describe('Lexi Account mark', () => {
  it('renders the parent-brand geometry without replacing product marks', () => {
    const html = renderToStaticMarkup(<LexiAccountMark className="size-10" />)

    expect(html).toContain('data-lexi-account-mark="true"')
    expect(html).toContain('viewBox="0 0 64 64"')
    expect(html).toContain('size-10')
    expect(html).toContain('linearGradient')
  })

  it('uses unique gradient definitions when more than one mark appears', () => {
    const html = renderToStaticMarkup(<><LexiAccountMark /><LexiAccountMark /></>)
    const ids = [...html.matchAll(/id="(lexi-account-(?:left|right)-[^"]+)"/g)].map((match) => match[1])

    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
