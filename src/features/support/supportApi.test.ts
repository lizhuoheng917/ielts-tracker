import { describe, expect, it } from 'vitest'

import {
  buildSubmitProductSupportTicketArgs,
  mapProductSupportError,
  withTrackerSupportProduct,
} from './supportApi'
import { TRACKER_SUPPORT_PRODUCT_ID } from './supportTypes'

describe('Tracker support RPC contract', () => {
  it('sends the shared submission contract with an explicit Tracker product tag', () => {
    const args = buildSubmitProductSupportTicketArgs({
      category: 'bug',
      impact: 'major',
      title: '新增计划后首页没有刷新',
      description: '在移动端新增一条计划后，返回首页仍然显示旧的待办数量。',
      reproduction: '1. 新建计划\n2. 返回首页',
      expected: '首页立即显示新待办。',
      actual: '首页保持旧数量。',
      includeDiagnostics: true,
      diagnostics: {
        appVersion: '1.0.0',
        buildSha: 'test-build',
        page: '/plans',
        theme: 'light',
        online: true,
        viewport: { width: 390, height: 844 },
        browser: 'Chrome',
        os: 'Android',
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        syncStatus: 'unavailable',
        syncPending: 0,
        currentFlow: 'support.submit',
      },
      sourcePage: '/plans',
      buildSha: 'test-build',
      clientRequestId: '11111111-1111-4111-8111-111111111111',
    })

    expect(args).toMatchObject({
      p_client_request_id: '11111111-1111-4111-8111-111111111111',
      p_category: 'bug',
      p_impact: 'major',
      p_title: '新增计划后首页没有刷新',
      p_include_diagnostics: true,
      p_product_id: TRACKER_SUPPORT_PRODUCT_ID,
    })
    expect(Object.keys(args).at(-1)).toBe('p_product_id')
  })

  it('keeps product identity fixed for every shared support RPC argument object', () => {
    const args = withTrackerSupportProduct({ p_ticket_id: 'ticket-1', p_body: '补充现象' })

    expect(args).toEqual({
      p_ticket_id: 'ticket-1',
      p_body: '补充现象',
      p_product_id: 'tracker',
    })
    expect(Object.keys(args).at(-1)).toBe('p_product_id')
  })

  it('does not send diagnostics unless the user explicitly opted in', () => {
    const args = buildSubmitProductSupportTicketArgs({
      category: 'suggestion',
      impact: 'suggestion',
      title: '希望计划列表更紧凑',
      description: '希望减少卡片之间的空白，便于在手机上查看当天待办。',
      includeDiagnostics: false,
      diagnostics: {
        appVersion: 'sensitive-only-for-test',
        buildSha: 'private-build',
        page: '/plans',
        theme: 'dark',
        online: true,
        viewport: { width: 390, height: 844 },
        browser: 'Chrome',
        os: 'Android',
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        syncStatus: 'unavailable',
        syncPending: 0,
        currentFlow: 'support.submit',
      },
      sourcePage: '/plans',
      buildSha: 'test-build',
      clientRequestId: '22222222-2222-4222-8222-222222222222',
    })

    expect(args.p_diagnostics).toBeNull()
    expect(args.p_product_id).toBe(TRACKER_SUPPORT_PRODUCT_ID)
  })

  it('maps backend and transport errors to stable learner-facing messages', () => {
    expect(mapProductSupportError(new Error('JWT expired'))).toMatchObject({
      kind: 'authentication',
      message: '登录状态已失效，请重新登录后再试。',
    })
    expect(mapProductSupportError(new Error('past 24 hours maximum 5 tickets'))).toMatchObject({
      kind: 'rate_limited',
      message: '今天提交的反馈较多，请明天再试。',
    })
    expect(mapProductSupportError(new Error('failed to fetch'))).toMatchObject({
      kind: 'network',
      message: '网络连接失败，请检查网络后重试。',
    })
    expect(mapProductSupportError(new Error('database internals should stay private'))).toMatchObject({
      kind: 'unavailable',
      message: '暂时无法连接反馈服务，请稍后重试。',
    })
  })
})
