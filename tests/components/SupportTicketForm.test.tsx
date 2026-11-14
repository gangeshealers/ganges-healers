import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SupportTicketForm from '@/components/support/SupportTicketForm'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

beforeEach(() => {
  refresh.mockReset()
  global.fetch = jest.fn()
})

test('members can submit a validated support request and see confirmation', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true, json: async () => ({ id: 'ticket-123', status: 'OPEN' }),
  })
  const user = userEvent.setup()
  render(<SupportTicketForm />)
  await user.type(screen.getByRole('textbox', { name: 'Subject' }), 'Help with booking')
  await user.type(screen.getByRole('textbox', { name: 'Message' }), 'I need help checking my appointment details.')
  await user.click(screen.getByRole('button', { name: 'Send support request' }))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  expect(screen.getByRole('status')).toHaveTextContent('Your support request was received')
  expect(global.fetch).toHaveBeenCalledWith('/api/support/tickets', expect.objectContaining({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: 'Help with booking',
      message: 'I need help checking my appointment details.',
    }),
  }))
})

test('rate limits display a retryable member-facing message', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false, json: async () => ({ error: 'Please try again later.' }),
  })
  const user = userEvent.setup()
  render(<SupportTicketForm />)
  await user.type(screen.getByRole('textbox', { name: 'Subject' }), 'Course enrollment')
  await user.type(screen.getByRole('textbox', { name: 'Message' }), 'I cannot open my enrolled course and need help.')
  await user.click(screen.getByRole('button', { name: 'Send support request' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Please try again later.')
  expect(refresh).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Send support request' })).not.toBeDisabled()
})
