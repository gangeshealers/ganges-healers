import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ServiceImageField from '@/components/admin/ServiceImageField'

const originalFetch = global.fetch
const mockFetch = jest.fn()
const trusted = 'https://ganges-images.public.blob.vercel-storage.com/service-images/approved.png'

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as typeof fetch
})
afterAll(() => { global.fetch = originalFetch })

test('edit field preserves the saved URL and allows intentional removal', () => {
  render(<ServiceImageField id="service-photo" initialUrl={trusted} />)
  const input = screen.getByLabelText('Service image URL (optional)') as HTMLInputElement
  expect(input).toHaveAttribute('name', 'image')
  expect(input.value).toBe(trusted)
  fireEvent.change(input, { target: { value: '' } })
  expect(input.value).toBe('')
})

test('approved image upload fills the form field but does not publish before the service is saved', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ url: trusted }) })
  render(<ServiceImageField id="new-photo" />)
  const file = new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], 'photo.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('Upload service photo'), { target: { files: [file] } })
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Save the service to publish this image'))
  expect((screen.getByLabelText('Service image URL (optional)') as HTMLInputElement).value).toBe(trusted)
  expect(mockFetch).toHaveBeenCalledWith('/api/admin/services/image', expect.objectContaining({ method: 'POST' }))
})

test('invalid image type cannot reach the upload endpoint', async () => {
  render(<ServiceImageField id="new-photo" />)
  fireEvent.change(screen.getByLabelText('Upload service photo'), {
    target: { files: [new File(['hello'], 'bad.txt', { type: 'text/plain' })] },
  })
  expect(screen.getByRole('alert')).toHaveTextContent('JPEG, PNG or WebP')
  expect(mockFetch).not.toHaveBeenCalled()
})

test('failed image upload preserves the previously saved URL and presents a retryable error', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Image storage is not configured' }) })
  render(<ServiceImageField id="photo" initialUrl={trusted} />)
  fireEvent.change(screen.getByLabelText('Upload service photo'), {
    target: { files: [new File(['image'], 'photo.png', { type: 'image/png' })] },
  })
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Image storage is not configured'))
  expect((screen.getByLabelText('Service image URL (optional)') as HTMLInputElement).value).toBe(trusted)
})
