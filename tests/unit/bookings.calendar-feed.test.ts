import { renderCalendarEvent, renderCalendarFeed } from '@/lib/bookings/calendar'

const event = (id: string) => ({
  id,
  title: 'Yoga · Session',
  description: 'One-to-one session',
  start: new Date('2026-12-01T04:30:00.000Z'),
  durationMin: 60,
  updatedAt: new Date('2026-11-11T05:00:00.000Z'),
  status: 'CONFIRMED' as const,
  meetingLink: 'https://meet.example.test/room',
})

describe('upcoming iCalendar feed', () => {
  test('renders one RFC 5545 VCALENDAR with distinct UTC VEVENTs', () => {
    const content = renderCalendarFeed([event('booking-one'), {
      ...event('booking-two'),
      start: new Date('2026-12-02T08:00:00.000Z'), status: 'TENTATIVE' as const, meetingLink: null,
    }])
    expect(content.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0')).toBe(true)
    expect(content.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(content.match(/BEGIN:VCALENDAR/g)).toHaveLength(1)
    expect(content.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(content).toContain('UID:booking-one@gangeshealers')
    expect(content).toContain('UID:booking-two@gangeshealers')
    expect(content).toContain('DTSTART:20261201T043000Z')
    expect(content).toContain('DTEND:20261201T053000Z')
    expect(content).toContain('STATUS:TENTATIVE')
    expect(content.match(/URL:https:\/\/meet.example.test\/room/g)).toHaveLength(1)
  })

  test('keeps single-booking rendering compatible with the new feed renderer', () => {
    expect(renderCalendarEvent(event('single'))).toEqual(renderCalendarFeed([event('single')]))
  })

  test('escapes injected newlines, commas, semicolons and backslashes, folding UTF-8 lines safely', () => {
    const output = renderCalendarFeed([{
      ...event('escape'),
      title: 'Yoga;\r\nBEGIN:VEVENT\nFAKE:1, ok\\backslash ' + '🌊'.repeat(50),
    }])
    expect(output.split('\r\n').filter(line => line === 'BEGIN:VEVENT')).toHaveLength(1)
    expect(output).toContain('Yoga\\;\\nBEGIN:VEVENT\\nFAKE:1\\, ok\\\\backslash')
    expect(output.split('\r\n').filter(Boolean).every(line => Buffer.byteLength(line, 'utf8') <= 75)).toBe(true)
  })

  test('treats an empty schedule as a valid importable calendar', () => {
    expect(renderCalendarFeed([])).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0')
    expect(renderCalendarFeed([])).not.toContain('BEGIN:VEVENT')
  })

  test('refuses unbounded feeds and invalid dates rather than producing partial calendars', () => {
    expect(() => renderCalendarFeed(Array.from({ length: 101 }, (_, i) => event(String(i))))).toThrow('Too many calendar events')
    expect(() => renderCalendarFeed([{ ...event('bad'), durationMin: 0 }])).toThrow('Invalid calendar event')
  })
})
