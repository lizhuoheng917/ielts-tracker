/**
 * A calendar date in the user's current local timezone, formatted as YYYY-MM-DD.
 *
 * Learning activity is grouped by the learner's calendar day. Using
 * `Date#toISOString()` for that purpose converts to UTC first and can therefore
 * move records made around midnight to the previous or next day.
 */
export type LocalDate = string

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

export function toLocalDate(date: Date = new Date()): LocalDate {
  return `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}-${padTwoDigits(date.getDate())}`
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false

  const match = LOCAL_DATE_PATTERN.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(year, month - 1, day)

  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  )
}

export function parseLocalDate(value: LocalDate): Date {
  if (!isLocalDate(value)) {
    throw new Error(`Invalid local date: ${String(value)}`)
  }

  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addLocalDays(value: LocalDate, amount: number): LocalDate {
  const date = parseLocalDate(value)
  date.setDate(date.getDate() + amount)
  return toLocalDate(date)
}
