export const TRACKER_SUPPORT_PRODUCT_ID = 'tracker' as const

export type SupportTicketCategory =
  | 'bug'
  | 'sync'
  | 'learning'
  | 'content'
  | 'suggestion'
  | 'privacy'
  | 'other'

export type SupportTicketImpact = 'blocked' | 'major' | 'minor' | 'suggestion'
export type SupportTicketStatus = 'new' | 'triaged' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed'
export type SupportTicketPriority = 'p0' | 'p1' | 'p2' | 'p3'
export type SupportMessageRole = 'user' | 'admin' | 'system'

/**
 * A deliberately small, opt-in diagnostic snapshot. It contains environment
 * signals only and never reads account identifiers, study records, cookies,
 * storage values, free-text notes or the full user agent.
 */
export type SupportDiagnostics = {
  appVersion: string
  buildSha: string
  page: string
  theme: 'light' | 'dark'
  online: boolean
  viewport: { width: number; height: number }
  browser: string
  os: string
  locale: string
  timezone: string
  syncStatus: string
  syncPending: number
  currentFlow: string
}

export type SupportTicketDraft = {
  category: SupportTicketCategory
  impact: SupportTicketImpact
  title: string
  description: string
  reproduction: string
  expected: string
  actual: string
  includeDiagnostics: boolean
  clientRequestId: string
  savedAt: string
}

export type ProductSupportTicketInput = {
  category: SupportTicketCategory
  impact: SupportTicketImpact
  title: string
  description: string
  reproduction?: string
  expected?: string
  actual?: string
  includeDiagnostics: boolean
  diagnostics?: SupportDiagnostics | null
  sourcePage: string
  buildSha: string
  clientRequestId: string
}

export type SupportTicket = {
  id: string
  displayNo: string
  productId: typeof TRACKER_SUPPORT_PRODUCT_ID
  category: SupportTicketCategory
  impact: SupportTicketImpact
  title: string
  description: string
  reproduction: string
  expected: string
  actual: string
  status: SupportTicketStatus
  ownStatus: SupportTicketStatus
  isDuplicate: boolean
  priority: SupportTicketPriority | null
  resolutionCode: string | null
  diagnosticsIncluded: boolean
  diagnostics: SupportDiagnostics | null
  sourcePage: string
  buildSha: string
  createdAt: string
  updatedAt: string
  lastActivityAt: string
  resolvedAt: string | null
  closedAt: string | null
  version: number
  publicMessageCount: number
  unreadByUser: boolean
}

export type SupportTicketMessage = {
  id: string
  ticketId: string
  authorRole: SupportMessageRole
  body: string
  createdAt: string
}

export type SupportTicketEvent = {
  id: string
  kind: string
  summary: string
  createdAt: string
}

export type SupportTicketDetail = {
  ticket: SupportTicket
  messages: SupportTicketMessage[]
  events: SupportTicketEvent[]
}

export type SupportTicketListResult = {
  tickets: SupportTicket[]
  nextCursor: { lastActivityAt: string; id: string } | null
}

export const supportCategoryOptions: Array<{ id: SupportTicketCategory; label: string }> = [
  { id: 'bug', label: '功能故障' },
  { id: 'sync', label: '账号与同步' },
  { id: 'learning', label: '学习功能' },
  { id: 'content', label: '内容纠错' },
  { id: 'suggestion', label: '体验建议' },
  { id: 'privacy', label: '安全与隐私' },
  { id: 'other', label: '其他问题' },
]

export const supportImpactOptions: Array<{ id: SupportTicketImpact; label: string }> = [
  { id: 'blocked', label: '无法使用' },
  { id: 'major', label: '影响主要功能' },
  { id: 'minor', label: '轻微问题' },
  { id: 'suggestion', label: '建议' },
]

export const supportStatusLabels: Record<SupportTicketStatus, string> = {
  new: '已提交',
  triaged: '已受理',
  in_progress: '处理中',
  waiting_user: '等待补充',
  resolved: '待你确认',
  closed: '已关闭',
}

export function emptySupportTicketDraft(clientRequestId: string): SupportTicketDraft {
  return {
    category: 'bug',
    impact: 'minor',
    title: '',
    description: '',
    reproduction: '',
    expected: '',
    actual: '',
    includeDiagnostics: false,
    clientRequestId,
    savedAt: new Date().toISOString(),
  }
}
