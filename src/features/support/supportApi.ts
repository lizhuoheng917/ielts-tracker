import type {
  ProductSupportTicketInput,
  SupportDiagnostics,
  SupportMessageRole,
  SupportTicket,
  SupportTicketCategory,
  SupportTicketDetail,
  SupportTicketEvent,
  SupportTicketImpact,
  SupportTicketListResult,
  SupportTicketMessage,
  SupportTicketPriority,
  SupportTicketStatus,
} from './supportTypes'
import { TRACKER_SUPPORT_PRODUCT_ID } from './supportTypes'

type JsonRecord = Record<string, unknown>

export type ProductSupportApiErrorKind =
  | 'authentication'
  | 'network'
  | 'rate_limited'
  | 'validation'
  | 'not_found'
  | 'unavailable'

export class ProductSupportApiError extends Error {
  readonly kind: ProductSupportApiErrorKind

  constructor(message: string, kind: ProductSupportApiErrorKind) {
    super(message)
    this.name = 'ProductSupportApiError'
    this.kind = kind
  }
}

const categories = new Set<SupportTicketCategory>([
  'bug', 'sync', 'learning', 'content', 'suggestion', 'privacy', 'other',
])
const impacts = new Set<SupportTicketImpact>(['blocked', 'major', 'minor', 'suggestion'])
const statuses = new Set<SupportTicketStatus>([
  'new', 'triaged', 'in_progress', 'waiting_user', 'resolved', 'closed',
])
const priorities = new Set<SupportTicketPriority>(['p0', 'p1', 'p2', 'p3'])
const messageRoles = new Set<SupportMessageRole>(['user', 'admin', 'system'])

function record(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord
  return {}
}

function maybeParsed(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback
}

function optionalText(value: unknown): string | null {
  const valueText = text(value).trim()
  return valueText || null
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || value === 'true'
}

function valueAt(source: JsonRecord, snake: string, camel: string): unknown {
  return source[snake] ?? source[camel]
}

function arrayAt(source: JsonRecord, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const candidate = maybeParsed(source[key])
    if (Array.isArray(candidate)) return candidate
  }
  return []
}

function diagnosticsFrom(value: unknown): SupportDiagnostics | null {
  const source = record(maybeParsed(value))
  if (!Object.keys(source).length) return null
  const viewport = record(source.viewport)
  const sync = record(source.sync)
  return {
    appVersion: text(source.appVersion ?? source.app_version, '未知'),
    buildSha: text(source.buildSha ?? source.build_sha, '未知'),
    page: text(source.page, 'unknown'),
    theme: source.theme === 'dark' ? 'dark' : 'light',
    online: booleanValue(source.online),
    viewport: {
      width: numberValue(viewport.width),
      height: numberValue(viewport.height),
    },
    browser: text(source.browser, '未知'),
    os: text(source.os, '未知'),
    locale: text(source.locale, '未知'),
    timezone: text(source.timezone, '未知'),
    syncStatus: text(source.syncStatus ?? source.sync_status ?? sync.status, 'unknown'),
    syncPending: numberValue(source.syncPending ?? source.sync_pending ?? sync.pending),
    currentFlow: text(source.currentFlow ?? source.current_flow ?? source.flow, 'normal'),
  }
}

function assertTrackerTicket(source: JsonRecord): void {
  const reportedProductId = optionalText(valueAt(source, 'product_id', 'productId'))
  if (reportedProductId && reportedProductId !== TRACKER_SUPPORT_PRODUCT_ID) {
    throw new ProductSupportApiError('反馈服务返回了不属于 Lexi Tracker 的内容，请刷新后重试。', 'unavailable')
  }
}

function ticketFrom(value: unknown): SupportTicket {
  const source = record(maybeParsed(value))
  assertTrackerTicket(source)
  const categoryValue = text(valueAt(source, 'category', 'category')) as SupportTicketCategory
  const impactValue = text(valueAt(source, 'impact', 'impact')) as SupportTicketImpact
  const statusValue = text(valueAt(source, 'status', 'status')) as SupportTicketStatus
  const ownStatusValue = text(valueAt(source, 'own_status', 'ownStatus'), statusValue) as SupportTicketStatus
  const priorityValue = optionalText(valueAt(source, 'priority', 'priority')) as SupportTicketPriority | null
  const diagnostics = diagnosticsFrom(valueAt(source, 'diagnostics', 'diagnostics'))
  const id = text(source.id)
  if (!id) throw new ProductSupportApiError('反馈服务没有返回有效的工单编号，请稍后重试。', 'unavailable')

  return {
    id,
    displayNo: text(valueAt(source, 'display_no', 'displayNo'), id.slice(0, 8).toUpperCase()),
    productId: TRACKER_SUPPORT_PRODUCT_ID,
    category: categories.has(categoryValue) ? categoryValue : 'other',
    impact: impacts.has(impactValue) ? impactValue : 'minor',
    title: text(source.title, '未命名反馈'),
    description: text(source.description),
    reproduction: text(source.reproduction),
    expected: text(source.expected),
    actual: text(source.actual),
    status: statuses.has(statusValue) ? statusValue : 'new',
    ownStatus: statuses.has(ownStatusValue) ? ownStatusValue : statuses.has(statusValue) ? statusValue : 'new',
    isDuplicate: booleanValue(valueAt(source, 'is_duplicate', 'isDuplicate')),
    priority: priorityValue && priorities.has(priorityValue) ? priorityValue : null,
    resolutionCode: optionalText(valueAt(source, 'resolution_code', 'resolutionCode')),
    diagnosticsIncluded: booleanValue(
      source.diagnostics_consent ?? source.diagnosticsConsent ?? source.diagnosticsIncluded,
    ) || Boolean(diagnostics),
    diagnostics,
    sourcePage: text(valueAt(source, 'source_page', 'sourcePage')),
    buildSha: text(valueAt(source, 'build_sha', 'buildSha')),
    createdAt: text(valueAt(source, 'created_at', 'createdAt')),
    updatedAt: text(valueAt(source, 'updated_at', 'updatedAt')),
    lastActivityAt: text(valueAt(source, 'last_activity_at', 'lastActivityAt')),
    resolvedAt: optionalText(valueAt(source, 'resolved_at', 'resolvedAt')),
    closedAt: optionalText(valueAt(source, 'closed_at', 'closedAt')),
    version: Math.max(1, numberValue(source.version, 1)),
    publicMessageCount: Math.max(0, numberValue(valueAt(source, 'public_message_count', 'publicMessageCount'))),
    unreadByUser: booleanValue(valueAt(source, 'unread_by_user', 'unreadByUser')),
  }
}

function messageFrom(value: unknown): SupportTicketMessage {
  const source = record(maybeParsed(value))
  const roleValue = text(valueAt(source, 'author_role', 'authorRole')) as SupportMessageRole
  return {
    id: text(source.id),
    ticketId: text(valueAt(source, 'ticket_id', 'ticketId')),
    authorRole: messageRoles.has(roleValue) ? roleValue : 'system',
    body: text(source.body),
    createdAt: text(valueAt(source, 'created_at', 'createdAt')),
  }
}

function eventFrom(value: unknown): SupportTicketEvent {
  const source = record(maybeParsed(value))
  return {
    id: text(source.id),
    kind: text(valueAt(source, 'event_kind', 'kind'), text(source.type, 'status')),
    summary: text(source.summary, text(source.message)),
    createdAt: text(valueAt(source, 'created_at', 'createdAt')),
  }
}

function errorEvidence(error: unknown): string {
  const source = record(error)
  const errorMessage = error instanceof Error ? error.message : ''
  return `${errorMessage} ${text(source.message)} ${text(source.details)} ${text(source.hint)} ${text(source.code)}`.trim()
}

/** Maps database and transport failures to messages safe to show in the learner UI. */
export function mapProductSupportError(error: unknown): ProductSupportApiError {
  if (error instanceof ProductSupportApiError) return error
  const evidence = errorEvidence(error)
  if (/rate|too many|5 tickets|24 hours?|P0001/i.test(evidence)) {
    return new ProductSupportApiError('今天提交的反馈较多，请明天再试。', 'rate_limited')
  }
  if (/not authenticated|authentication|required|jwt|session|28000|401|403/i.test(evidence)) {
    return new ProductSupportApiError('登录状态已失效，请重新登录后再试。', 'authentication')
  }
  if (/offline|network|fetch|failed to fetch|timeout|503|504/i.test(evidence)) {
    return new ProductSupportApiError('网络连接失败，请检查网络后重试。', 'network')
  }
  if (/too long|length|size|16kb|8kb|22001/i.test(evidence)) {
    return new ProductSupportApiError('反馈内容过长，请精简后再提交。', 'validation')
  }
  if (/invalid|22023|product|category|impact/i.test(evidence)) {
    return new ProductSupportApiError('请检查反馈内容后重试。', 'validation')
  }
  if (/not found|P0002|permission|denied/i.test(evidence)) {
    return new ProductSupportApiError('无法读取这条反馈，请刷新后重试。', 'not_found')
  }
  return new ProductSupportApiError('暂时无法连接反馈服务，请稍后重试。', 'unavailable')
}

async function rpc(name: string, args: JsonRecord): Promise<unknown> {
  try {
    const { supabase } = await import('@/lib/supabase')
    if (!supabase) {
      throw new ProductSupportApiError('当前环境尚未连接 Lexi 账号服务。', 'unavailable')
    }
    const { data, error } = await supabase.rpc(name, args)
    if (error) throw mapProductSupportError(error)
    return maybeParsed(data)
  } catch (error) {
    throw mapProductSupportError(error)
  }
}

/**
 * Constructs the stable submission contract. Product identity is deliberately
 * not caller-configurable so a Tracker UI cannot accidentally submit a Words
 * ticket while both products share one Supabase project.
 */
export function buildSubmitProductSupportTicketArgs(input: ProductSupportTicketInput): JsonRecord {
  return withTrackerSupportProduct({
    p_client_request_id: input.clientRequestId,
    p_category: input.category,
    p_impact: input.impact,
    p_title: input.title,
    p_description: input.description,
    p_reproduction: input.reproduction || null,
    p_expected: input.expected || null,
    p_actual: input.actual || null,
    p_include_diagnostics: input.includeDiagnostics,
    p_diagnostics: input.includeDiagnostics ? input.diagnostics : null,
    p_source_page: input.sourcePage,
    p_build_sha: input.buildSha,
  })
}

/** Adds the product selector required by every shared support RPC call. */
export function withTrackerSupportProduct<T extends JsonRecord>(args: T): T & {
  p_product_id: typeof TRACKER_SUPPORT_PRODUCT_ID
} {
  return {
    ...args,
    p_product_id: TRACKER_SUPPORT_PRODUCT_ID,
  }
}

export async function submitProductSupportTicket(input: ProductSupportTicketInput): Promise<SupportTicketDetail> {
  const data = await rpc('submit_support_ticket', buildSubmitProductSupportTicketArgs(input))
  const source = record(data)
  const candidate = record(source.ticket ?? (Array.isArray(data) ? data[0] : data))
  const ticketId = text(candidate.id ?? source.id)
  if (!ticketId) {
    throw new ProductSupportApiError('反馈服务没有返回有效的工单编号，请稍后重试。', 'unavailable')
  }
  return getMyProductSupportTicket(ticketId)
}

export async function listMyProductSupportTickets(options: {
  limit?: number
  beforeActivityAt?: string | null
  beforeId?: string | null
} = {}): Promise<SupportTicketListResult> {
  const data = await rpc('list_my_support_tickets', withTrackerSupportProduct({
    p_limit: Math.max(1, Math.min(50, options.limit || 20)),
    p_before_activity_at: options.beforeActivityAt || null,
    p_before_id: options.beforeId || null,
  }))
  const source = record(data)
  const rows = Array.isArray(data) ? data : arrayAt(source, 'tickets', 'items', 'data')
  const tickets = rows.map(ticketFrom)
  const cursorRecord = record(source.next_cursor ?? source.nextCursor)
  const cursorActivity = text(
    cursorRecord.last_activity_at ?? cursorRecord.lastActivityAt ?? cursorRecord.beforeActivityAt,
  )
  const cursorId = text(cursorRecord.id ?? cursorRecord.beforeId)
  const inferredLast = tickets[tickets.length - 1]
  const hasMore = booleanValue(source.has_more ?? source.hasMore)
  return {
    tickets,
    nextCursor: cursorActivity && cursorId
      ? { lastActivityAt: cursorActivity, id: cursorId }
      : hasMore && inferredLast
        ? { lastActivityAt: inferredLast.lastActivityAt, id: inferredLast.id }
        : null,
  }
}

export async function getMyProductSupportTicket(ticketId: string): Promise<SupportTicketDetail> {
  const data = await rpc('get_my_support_ticket', withTrackerSupportProduct({
    p_ticket_id: ticketId,
  }))
  const source = record(data)
  const ticketValue = source.ticket ?? (Array.isArray(data) ? data[0] : data)
  return {
    ticket: ticketFrom(ticketValue),
    messages: arrayAt(source, 'messages', 'public_messages', 'publicMessages').map(messageFrom),
    events: arrayAt(source, 'events', 'timeline').map(eventFrom),
  }
}

export async function replyToMyProductSupportTicket(ticketId: string, body: string): Promise<SupportTicketDetail> {
  await rpc('reply_to_my_support_ticket', withTrackerSupportProduct({
    p_ticket_id: ticketId,
    p_body: body,
  }))
  return getMyProductSupportTicket(ticketId)
}

export async function confirmProductSupportTicketResolved(ticketId: string): Promise<SupportTicketDetail> {
  await rpc('confirm_support_ticket_resolved', withTrackerSupportProduct({
    p_ticket_id: ticketId,
  }))
  return getMyProductSupportTicket(ticketId)
}

export async function reopenProductSupportTicket(ticketId: string, body: string): Promise<SupportTicketDetail> {
  await rpc('reopen_support_ticket', withTrackerSupportProduct({
    p_ticket_id: ticketId,
    p_body: body,
  }))
  return getMyProductSupportTicket(ticketId)
}
