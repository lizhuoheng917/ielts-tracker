import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/auth/authContext', () => ({
  useAuth: () => ({
    status: 'signed-in',
    user: { id: 'learner-1', email: 'learner@example.com' },
    managedAiDataBinding: { status: 'bound' },
    confirmManagedAiDataBinding: vi.fn(),
    sendPasswordReset: vi.fn(),
    signOut: vi.fn(),
    deleteAccount: vi.fn(),
  }),
}))

vi.mock('@/auth/devicePresence', () => ({
  useDevicePresence: () => ({
    devices: [],
    activeDevices: [],
    loading: false,
    error: '',
    refresh: vi.fn(),
  }),
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
}))

import { LexiAccountDialog } from './AccountDialogProvider'

describe('Tracker account information architecture', () => {
  it('keeps Tracker-local state separate from shared Lexi Account security', () => {
    const html = renderToStaticMarkup(<LexiAccountDialog open onOpenChange={vi.fn()} />)

    expect(html).toContain('Lexi Account')
    expect(html).toContain('当前产品 · Lexi Tracker')
    expect(html).toContain('Tracker 数据与同步')
    expect(html).toContain('Tracker 最近活跃设备')
    expect(html).toContain('退出当前 Tracker 设备')
    expect(html).toContain('Lexi Account 安全')
    expect(html).toContain('Lexi Account 账户中心')
    expect(html).toContain('打开账户中心')
    expect(html).toContain('跨产品登录会话')
    expect(html).toContain('退出其他 Lexi 设备')
    expect(html).toContain('永久注销共享账号')
    expect(html).not.toContain('最近登录设备')
    expect(html.indexOf('data-account-scope="tracker"')).toBeLessThan(html.indexOf('data-account-scope="lexi-account"'))
  })
})
