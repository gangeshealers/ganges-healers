import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HelpCenter from '@/components/help/HelpCenter'

test('help center has accessible search, FAQ disclosure and member support action', async () => {
  const user = userEvent.setup()
  render(<HelpCenter />)
  expect(screen.getByRole('heading', { name: 'How can we help?' })).toBeVisible()
  const results = screen.getByRole('region', { name: 'Frequently asked questions' })
  expect(within(results).getByText('How do I book a healing session?')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Open support center' })).toHaveAttribute('href', '/dashboard/support')

  await user.type(screen.getByRole('searchbox', { name: 'Search help topics' }), 'cancellation')
  expect(within(results).getByText('What happens if I cancel a paid session?')).toBeVisible()
  expect(within(results).queryByText('How do I book a healing session?')).not.toBeInTheDocument()
})

test('topic chips narrow help and empty search can be cleared', async () => {
  const user = userEvent.setup()
  render(<HelpCenter />)
  await user.click(screen.getByRole('button', { name: 'Account' }))
  expect(screen.getByRole('button', { name: 'Account' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('How do I update my account details?')).toBeVisible()
  expect(screen.queryByText('How do I book a healing session?')).not.toBeInTheDocument()

  await user.type(screen.getByRole('searchbox', { name: 'Search help topics' }), 'nowhere-near-this')
  expect(screen.getByText('No matching answers')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Clear help filters' }))
  expect(screen.getByRole('searchbox', { name: 'Search help topics' })).toHaveValue('')
  expect(screen.getByText('How do I book a healing session?')).toBeVisible()
})
