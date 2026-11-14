import { POST } from '@/app/api/admin/services/image/route'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { put } from '@vercel/blob'

jest.mock('@/lib/admin/auth', () => ({ requireCurrentAdmin: jest.fn() }))
jest.mock('@vercel/blob', () => ({ put: jest.fn() }))

const admin = requireCurrentAdmin as jest.Mock
const upload = put as jest.Mock
const stored = 'https://ganges-images.public.blob.vercel-storage.com/service-images/new.png'
const initialToken = process.env.BLOB_READ_WRITE_TOKEN
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])

const requestWith = (file?: File): Request => {
  const form = new FormData()
  if (file) form.set('image', file)
  return new Request('http://localhost/api/admin/services/image', { method: 'POST', body: form })
}

beforeEach(() => {
  jest.clearAllMocks()
  admin.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' })
  upload.mockResolvedValue({ url: stored })
  process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token'
})
afterAll(() => {
  if (initialToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
  else process.env.BLOB_READ_WRITE_TOKEN = initialToken
})

test('rejects unauthorized upload before reading or storing the image', async () => {
  admin.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { status: 403 }))
  const response = await POST(requestWith(new File([png], 'approved.png', { type: 'image/png' })))
  expect(response.status).toBe(403)
  expect(upload).not.toHaveBeenCalled()
})

test('fails closed when blob storage is not configured', async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN
  const response = await POST(requestWith(new File([png], 'approved.png', { type: 'image/png' })))
  expect(response.status).toBe(503)
  expect(upload).not.toHaveBeenCalled()
})

test('validates file type, size and contents before uploading', async () => {
  const badType = await POST(requestWith(new File(['plain'], 'bad.txt', { type: 'text/plain' })))
  expect(badType.status).toBe(400)
  const disguised = await POST(requestWith(new File(['not a png'], 'fake.png', { type: 'image/png' })))
  expect(disguised.status).toBe(400)
  const tooLarge = await POST(requestWith(new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })))
  expect(tooLarge.status).toBe(400)
  expect(upload).not.toHaveBeenCalled()
})

test('uploads a supported file to a random service-images path with no caching', async () => {
  const response = await POST(requestWith(new File([png], 'approved.png', { type: 'image/png' })))
  expect(response.status).toBe(201)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ url: stored })
  expect(upload).toHaveBeenCalledWith(
    expect.stringMatching(/^service-images\/[a-f0-9-]+\.png$/),
    expect.any(Buffer),
    expect.objectContaining({ access: 'public', contentType: 'image/png', token: 'test-blob-token' }),
  )
})

test('a storage provider returning an unapproved origin cannot publish the image', async () => {
  upload.mockResolvedValueOnce({ url: 'https://untrusted.example.com/private.png' })
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const response = await POST(requestWith(new File([png], 'approved.png', { type: 'image/png' })))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Image upload is temporarily unavailable' })
  } finally { spy.mockRestore() }
})
