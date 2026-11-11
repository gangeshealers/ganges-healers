import { safeMeetingLink } from './session-delivery'

export interface CalendarEvent {
  id: string
  title: string
  description: string
  start: Date
  durationMin: number
  updatedAt: Date
  status: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED'
  meetingLink?: string | null
}
function calendarText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/;/g, '\\;').replace(/,/g, '\\,')
}
function utc(value: Date) { return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') }
function fold(value: string) {
  const lines: string[] = []
  let current = ''
  for (const point of value) {
    if (Buffer.byteLength(current + point, 'utf8') > 75) { lines.push(current); current = ' ' }
    current += point
  }
  lines.push(current)
  return lines.join('\r\n')
}
function eventLines(event: CalendarEvent) {
  if (!Number.isFinite(event.start.getTime()) || !Number.isFinite(event.updatedAt.getTime()) ||
    !Number.isSafeInteger(event.durationMin) || event.durationMin < 1 || event.durationMin > 1440) {
    throw new Error('Invalid calendar event')
  }
  const meeting = safeMeetingLink(event.meetingLink)
  return [
    'BEGIN:VEVENT', 'UID:' + calendarText(event.id) + '@gangeshealers',
    'DTSTAMP:' + utc(event.updatedAt), 'LAST-MODIFIED:' + utc(event.updatedAt),
    'SEQUENCE:' + Math.max(0, Math.min(2147483647, Math.floor(event.updatedAt.getTime() / 1000) - 1577836800)),
    'DTSTART:' + utc(event.start), 'DTEND:' + utc(new Date(event.start.getTime() + event.durationMin * 60000)),
    'SUMMARY:' + calendarText(event.title), 'DESCRIPTION:' + calendarText(event.description), 'STATUS:' + event.status,
    ...(meeting ? ['URL:' + calendarText(meeting)] : []), 'END:VEVENT',
  ]
}

/** RFC 5545 snapshot; imports do not create remote meetings or automatic calendar subscriptions. */
export function renderCalendarFeed(events: CalendarEvent[]) {
  if (events.length > 100) throw new Error('Too many calendar events')
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ganges Healers//Appointments//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...events.flatMap(eventLines),
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Preserve the individual-booking endpoint using the shared renderer. */
export function renderCalendarEvent(event: CalendarEvent) { return renderCalendarFeed([event]) }

export function calendarResponse(event: CalendarEvent) {
  return new Response(renderCalendarEvent(event), { headers: {
    'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="ganges-healers-appointment.ics"',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } })
}
export function calendarFeedResponse(events: CalendarEvent[]) {
  return new Response(renderCalendarFeed(events), { headers: {
    'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="ganges-healers-upcoming.ics"',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } })
}
