import { z } from 'zod'

export const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export type WeekDay = typeof WEEK_DAYS[number]
export type DayWindow = { start: string; end: string }
export type WeeklySchedule = Record<WeekDay, DayWindow | null>
export const DAY_LABELS: Record<WeekDay, string> = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' }
export const START_TIMES = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`)
export const END_TIMES = [...START_TIMES.slice(1), '24:00']
const storedTime = /^([01]\d|2[0-3]):[0-5]\d$/
const halfHourTime = /^([01]\d|2[0-3]):(00|30)$/
function windowSchema(aligned: boolean) {
  const time = aligned ? halfHourTime : storedTime
  return z.object({
    start: z.string().regex(time, aligned ? 'Choose a 30-minute start time' : 'Invalid start time'),
    end: z.string().refine(value => value === '24:00' || time.test(value), aligned ? 'Choose a 30-minute end time' : 'Invalid end time'),
  }).strict().refine(window => window.start < window.end, { message: 'start time must be before end time for each day' }).nullable()
}
function weeklySchema(aligned: boolean) {
  const day = windowSchema(aligned).optional()
  return z.object({ monday: day, tuesday: day, wednesday: day, thursday: day, friday: day, saturday: day, sunday: day }).strict()
    .transform(value => Object.fromEntries(WEEK_DAYS.map(key => [key, value[key] ?? null])) as WeeklySchedule)
}
/** New writes use the same half-hour choices as the editor; omitted days remain days off. */
export const weeklyAvailabilitySchema = weeklySchema(true)
const storedAvailabilitySchema = weeklySchema(false)

/** Preserve valid legacy minute-based windows; malformed stored data fails closed. */
export function readWeeklyAvailability(value: unknown): WeeklySchedule | null {
  const parsed = storedAvailabilitySchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : null
}
/** Convert a validated time or midnight end boundary to minutes since midnight. */
export function timeToMinutes(time: string) { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes }

/** A session must fit completely inside one day's window; 24:00 is an end boundary. */
export function fitsWorkingWindow(window: DayWindow | null | undefined, time: string, duration: number) {
  if (!window || !Number.isSafeInteger(duration) || duration <= 0) return false
  const start = timeToMinutes(time)
  return start >= timeToMinutes(window.start) && start + duration <= timeToMinutes(window.end)
}
/** Generate aligned starts from the saved window instead of a fixed clinic-hour range. */
export function workingWindowSlots(window: DayWindow | null | undefined): string[] {
  if (!window) return []
  const start = Math.ceil(timeToMinutes(window.start) / 30) * 30
  const end = timeToMinutes(window.end)
  return START_TIMES.filter(time => timeToMinutes(time) >= start && timeToMinutes(time) < end)
}
/**
 * A schedule cue for public healer cards, not a claim of bookable slots.
 * Working hours are in Asia/Kolkata; actual availability must still come from
 * the booking endpoint, which checks conflicts and session duration.
 */
export function getWeeklyScheduleCue(availability: unknown, now = new Date()): string | null {
  const schedule = readWeeklyAvailability(availability)
  if (!schedule) return null

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  const day = get('weekday').toLowerCase() as WeekDay
  const dayIndex = WEEK_DAYS.indexOf(day)
  if (dayIndex < 0) return null

  const minuteOfDay = Number(get('hour')) * 60 + Number(get('minute'))
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = WEEK_DAYS[(dayIndex + offset) % 7]
    const window = schedule[candidate]
    if (!window || (offset === 0 && minuteOfDay >= timeToMinutes(window.end))) continue

    const label = offset === 0
      ? "Today's regular hours"
      : offset === 1
        ? "Tomorrow's regular hours"
        : 'Next regular hours (' + DAY_LABELS[candidate] + ')'
    return label + ': ' + window.start + '–' + window.end + ' IST'
  }
  return null
}
