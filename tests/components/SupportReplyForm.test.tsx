import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { randomUUID } from 'node:crypto'
import SupportReplyForm from '@/components/support/SupportReplyForm'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated', data: { user: { id: 'current-member' } } }),
}))

const initial = {
  ticketId: 'support-ticket',
  actorId: 'current-member',
  scope: 'member' as const,
  updatedAt: '2026-11-12T12:00:00.000Z',
  status: 'OPEN' as const,
}

beforeEach(() => {
  global.fetch = jest.fn()
  refresh.mockClear()
  if (!crypto.randomUUID) Object.defineProperty(crypto, 'randomUUID', { value: randomUUID })
})

test('a retry after a lost acknowledgment sends the identical request', async () => {
  const fetchMock = global.fetch as jest.Mock
  fetchMock.mockRejectedValueOnce(new Error('Disconnected')).mockImplementationOnce(async (_, options) => ({
    ok: true,
    json: async () => ({
      success: true,
      id: initial.ticketId,
      requestId: JSON.parse(options.body).requestId,
      messageId: 'one',
    }),
  }))
  render(<SupportReplyForm {...initial} />)
  fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'Following up' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Retry same reply' }))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  expect(fetchMock.mock.calls[1][1].body).toEqual(fetchMock.mock.calls[0][1].body)
  expect(screen.getByLabelText('Your reply')).toHaveValue('')
})

test('reviewing a newer revision preserves the draft and adopts the current status', async () => {
  const fetchMock = global.fetch as jest.Mock
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 409,
    json: async () => ({ code: 'STALE_TICKET', error: 'Review the latest messages.' }),
  })
  const { rerender } = render(<SupportReplyForm {...initial} scope="staff" />)
  fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'My unsent reply' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Review latest conversation' }))
  rerender(
    <SupportReplyForm {...initial} scope="staff" status="IN_PROGRESS" updatedAt="2026-11-12T12:01:00.000Z" />,
  )
  expect(screen.getByLabelText('Your reply')).toHaveValue('My unsent reply')
  expect(screen.getByLabelText('Request status')).toHaveValue('IN_PROGRESS')
  expect(screen.getByRole('button', { name: 'Send reply' })).toBeEnabled()
})
