import type { SupabaseClient } from '@supabase/supabase-js'

import { requireSupabase } from '@/lib/supabase'

export type RegistrationMode = 'open' | 'invite_only' | 'closed'

export type RegistrationAccessPolicy = {
  mode: RegistrationMode
}

const inviteAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const invitePayloadLength = 24
const invitePrefix = 'LEXI'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function parseRegistrationAccessPolicy(value: unknown): RegistrationAccessPolicy {
  const mode = asRecord(value).mode
  if (mode !== 'open' && mode !== 'invite_only' && mode !== 'closed') {
    throw new Error('Registration access policy is unavailable')
  }
  return { mode }
}

export async function getRegistrationAccessPolicy(
  client: SupabaseClient = requireSupabase(),
): Promise<RegistrationAccessPolicy> {
  const { data, error } = await client.rpc('get_registration_access_mode')
  if (error) throw new Error('LEXI_REGISTRATION_POLICY_UNAVAILABLE')
  return parseRegistrationAccessPolicy(data)
}

export function normalizeInviteCode(value: string): string | null {
  const compact = value.trim().toUpperCase().replace(/[\s-]+/g, '')
  const payload = compact.startsWith(invitePrefix) ? compact.slice(invitePrefix.length) : compact
  if (payload.length !== invitePayloadLength) return null
  if ([...payload].some((character) => !inviteAlphabet.includes(character))) return null
  return `${invitePrefix}${payload}`
}

function requireSecureCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器不支持安全邀请码处理')
  return globalThis.crypto
}

export async function hashInviteCode(value: string): Promise<string> {
  const canonical = normalizeInviteCode(value)
  if (!canonical) throw new Error('邀请码格式无效')
  const digest = await requireSecureCrypto().subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
