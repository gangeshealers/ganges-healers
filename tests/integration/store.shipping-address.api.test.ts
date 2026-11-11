import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/store/shipping-address/route'

let mockActor: string | null = null
jest.mock('@/lib/auth', () => ({
  auth: async () => mockActor ? { user: { id: mockActor, role: 'USER' } } : null,
}))

const owners: string[] = []
let buyerId = ''
let otherId = ''
const address = (name: string) => ({
  name, line1: 'First lane', city: 'Dehradun', state: 'Uttarakhand',
  postalCode: '248001', phone: '1234567890',
})

beforeAll(async () => {
  buyerId = (await prisma.user.create({ data: {
    email: 'shipping-reuse-owner-' + randomUUID() + '@example.test',
  } })).id
  otherId = (await prisma.user.create({ data: {
    email: 'shipping-reuse-other-' + randomUUID() + '@example.test',
  } })).id
  owners.push(buyerId, otherId)
  const create = async (userId: string, status: string, shippingAddress: unknown) =>
    prisma.order.create({ data: {
      userId, status, totalPaise: 12000,
      shippingAddress: shippingAddress as Record<string, string>,
    } })
  await create(buyerId, 'paid', address('Owner First'))
  await create(otherId, 'paid', address('Private Other Account'))
  await create(buyerId, 'pending_payment', address('Unpaid Draft'))
  await create(buyerId, 'shipped', { name: 'Invalid incomplete saved address' })
})
beforeEach(() => { mockActor = buyerId })
afterAll(async () => {
  try { if (owners.length) await prisma.user.deleteMany({ where: { id: { in: owners } } }) }
  finally { await prisma.$disconnect() }
})

test('authentication happens before reading any previous shipping address', async () => {
  mockActor = null
  const response = await GET()
  expect(response.status).toBe(401)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})

test('selects only valid addresses from this buyer’s paid/fulfilled orders, not unpaid drafts or other accounts', async () => {
  const response = await GET()
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  const body = await response.json()
  expect(body).toEqual({ address: address('Owner First') })
  expect(JSON.stringify(body)).not.toMatch(/Private Other Account|Unpaid Draft|Invalid incomplete saved address/)
  mockActor = otherId
  const other = await GET()
  expect(other.status).toBe(200)
  expect(await other.json()).toEqual({ address: address('Private Other Account') })
})

test('closed accounts cannot retrieve previously saved addresses on an old session', async () => {
  await prisma.user.update({ where: { id: buyerId }, data: { closedAt: new Date() } })
  try {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ address: null })
  } finally {
    await prisma.user.update({ where: { id: buyerId }, data: { closedAt: null } })
  }
})
