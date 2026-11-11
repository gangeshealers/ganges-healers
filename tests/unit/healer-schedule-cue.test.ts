import { getWeeklyScheduleCue } from '@/lib/bookings/availability-rules'

describe('public healer working-hour cue', () => {
  const mondayEarlyInIndia = new Date('2026-11-08T23:00:00.000Z') // Monday, 04:30 IST
  const mondayAfterHoursInIndia = new Date('2026-11-09T12:00:00.000Z') // Monday, 17:30 IST

  it('uses Asia/Kolkata instead of the visitor/server weekday and reads lowercase saved days', () => {
    const schedule = { monday: { start: '09:00', end: '17:00' } }
    expect(getWeeklyScheduleCue(schedule, mondayEarlyInIndia))
      .toBe("Today's regular hours: 09:00–17:00 IST")
  })

  it('does not imply that a finished working window is still available today', () => {
    const schedule = {
      monday: { start: '09:00', end: '17:00' },
      tuesday: { start: '10:00', end: '18:00' },
    }
    expect(getWeeklyScheduleCue(schedule, mondayAfterHoursInIndia))
      .toBe("Tomorrow's regular hours: 10:00–18:00 IST")
    expect(getWeeklyScheduleCue({ monday: schedule.monday }, mondayAfterHoursInIndia))
      .toBe('Next regular hours (Monday): 09:00–17:00 IST')
  })

  it('supports valid midnight endings and upcoming different weekdays', () => {
    const schedule = { thursday: { start: '20:00', end: '24:00' } }
    expect(getWeeklyScheduleCue(schedule, mondayEarlyInIndia))
      .toBe('Next regular hours (Thursday): 20:00–24:00 IST')
  })

  it('does not show a cue for missing or malformed working hours', () => {
    expect(getWeeklyScheduleCue(null, mondayEarlyInIndia)).toBeNull()
    expect(getWeeklyScheduleCue({}, mondayEarlyInIndia)).toBeNull()
    expect(getWeeklyScheduleCue({ monday: { start: 'bad', end: '17:00' } }, mondayEarlyInIndia))
      .toBeNull()
  })
})
