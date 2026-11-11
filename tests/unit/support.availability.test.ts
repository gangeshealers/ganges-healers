import { isSupportDeskEnabled } from '@/lib/support/availability'

const original = process.env.SUPPORT_DESK_ENABLED
afterEach(() => {
  if (original === undefined) delete process.env.SUPPORT_DESK_ENABLED
  else process.env.SUPPORT_DESK_ENABLED = original
})

test('support defaults off until the database migration has been verified', () => {
  delete process.env.SUPPORT_DESK_ENABLED
  expect(isSupportDeskEnabled()).toBe(false)
  process.env.SUPPORT_DESK_ENABLED = 'false'
  expect(isSupportDeskEnabled()).toBe(false)
  process.env.SUPPORT_DESK_ENABLED = 'TRUE'
  expect(isSupportDeskEnabled()).toBe(false)
  process.env.SUPPORT_DESK_ENABLED = 'true'
  expect(isSupportDeskEnabled()).toBe(true)
})
