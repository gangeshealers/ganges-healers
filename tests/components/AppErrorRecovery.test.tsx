import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorPage from '@/app/error'
import * as Sentry from '@sentry/nextjs'

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))

test('route errors show a safe retry and homepage recovery without exposing internal details', async () => {
  const reset = jest.fn()
  const err = new Error('postgresql://private:secret@hidden.example/db')
  render(<ErrorPage error={err} reset={reset} />)

  expect(screen.getByRole('alert')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'This page couldn’t load' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Return to homepage' })).toHaveAttribute('href', '/')
  expect(screen.queryByText(/postgresql:\/\//)).not.toBeInTheDocument()
  expect(screen.queryByText(/team has been notified/i)).not.toBeInTheDocument()

  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Try loading again' }))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(Sentry.captureException).toHaveBeenCalledWith(err)
})
