import { signOutCurrentSession } from '@/lib/auth/client-session'
jest.mock('next-auth/react', () => ({ signOut: jest.fn() }))
const signOut = jest.requireMock<{ signOut: jest.Mock }>('next-auth/react').signOut
beforeEach(() => { jest.clearAllMocks(); signOut.mockResolvedValue({ url: 'http://another-configured-host.example/' }) })
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

test.each([null, {}])('confirms an empty session without using a configured-host redirect (%j)', async session => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(session)))
  await expect(signOutCurrentSession('/auth/signin')).resolves.toBeUndefined()
  expect(signOut).toHaveBeenCalledWith({ redirect: false, redirectTo: '/auth/signin' })
  expect(fetch).toHaveBeenCalledWith('/api/auth/session', { cache: 'no-store' })
})

test('waits for a transient stale session to clear after a successful sign-out', async () => {
  const read = jest.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 'signed-out-user' } })))
    .mockResolvedValueOnce(new Response('null'))
  await expect(signOutCurrentSession('/')).resolves.toBeUndefined()
  expect(read).toHaveBeenCalledTimes(2)
  expect(signOut).toHaveBeenCalledTimes(1)
})

test('allows a later empty session after six stale observations without prematurely confirming logout', async () => {
  jest.useFakeTimers()
  let observations = 0
  const read = jest.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(++observations <= 6 ? JSON.stringify({ user: { id: 'stale-user' } }) : 'null'))
  const completion = signOutCurrentSession('/')
  await jest.advanceTimersByTimeAsync(4_000)
  await expect(completion).resolves.toBeUndefined()
  expect(read).toHaveBeenCalledTimes(7)
  expect(signOut).toHaveBeenCalledTimes(1)
})

test.each([{ user: { id: 'still-active' } }, [], false, 'not-a-session'])('refuses an unconfirmed signed-out state after bounded retries (%j)', async session => {
  jest.useFakeTimers()
  const read = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(session)))
  const rejected = expect(signOutCurrentSession('/')).rejects.toThrow('session is still active')
  await jest.advanceTimersByTimeAsync(6_000)
  await rejected
  expect(read).toHaveBeenCalledTimes(9)
})

test('refuses a failed session check even when the sign-out request returned a URL', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('null', { status: 503 }))
  await expect(signOutCurrentSession('/')).rejects.toThrow('Session could not be checked')
})

test('requires an explicit authentication response before checking state', async () => {
  signOut.mockResolvedValue(undefined)
  const fetch = jest.spyOn(globalThis, 'fetch')
  await expect(signOutCurrentSession('/')).rejects.toThrow('Sign-out was not confirmed')
  expect(fetch).not.toHaveBeenCalled()
})
