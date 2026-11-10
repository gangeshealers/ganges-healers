import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/healers/route'

const token = randomUUID(), users: string[] = [], services: string[] = []
let activeSlug = '', inactiveSlug = ''
const read = async (extra = '') => {
  const response = await GET(new NextRequest(`http://localhost/api/healers?q=${token}&serviceSlug=${activeSlug}${extra}`))
  expect(response.status).toBe(200)
  return response.json() as Promise<{ items: Array<{ id: string; services: Array<{ slug: string }> }>; nextCursor: string | null }>
}
beforeAll(async () => {
  for (const isActive of [true, false]) {
    const service = await prisma.service.create({ data: { name: `Directory ${isActive} ${token}`, slug: `directory-${isActive}-${token}`, description: 'Isolated discovery fixture', category: 'Fixture', price: 100, duration: 60, isActive } })
    services.push(service.id)
    if (isActive) activeSlug = service.slug; else inactiveSlug = service.slug
  }
  for (let index = 0; index < 23; index++) {
    const row = await prisma.healer.create({ data: { isActive: index !== 22, specializations: [`Directory ${index !== 21} ${token}`], user: { create: { name: `Directory ${token} ${index}`, email: `directory-${token}-${index}@example.test`, role: 'HEALER' } } } })
    users.push(row.userId)
  }
})
afterAll(async () => {
  try {
    await prisma.user.deleteMany({ where: { id: { in: users } } })
    await prisma.service.deleteMany({ where: { id: { in: services } } })
  } finally { await prisma.$disconnect() }
})

test.each(['', '&limit=', '&limit=%20'])('omitted/blank page size uses twenty visible rows with a real continuation (%s)', async query => {
  const first = await read(query)
  expect(first.items).toHaveLength(20); expect(first.nextCursor).toBe(first.items[19].id)
  const second = await read(`${query}&cursor=${first.nextCursor}`)
  expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull()
  expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(21)
  expect([...first.items, ...second.items].every(row => row.services.some(service => service.slug === activeSlug))).toBe(true)
})

test('an exact last page and a bounded oversized request advertise no empty continuation', async () => {
  const exact = await read('&limit=21')
  expect(exact.items).toHaveLength(21); expect(exact.nextCursor).toBeNull()
  expect((await read('&limit=999')).items).toEqual(exact.items)
})

test.each([['2.8', 2], ['0', 1], ['-3', 1], ['Infinity', 20], ['invalid', 20]])('limit %s remains a finite bounded database integer', async (limit, expected) => {
  const result = await read(`&limit=${limit}`)
  expect(result.items).toHaveLength(expected)
  expect(result.nextCursor).toBe(result.items[result.items.length - 1].id)
})

test.each(['missing', 'inactive'])('a %s service cannot silently return the broader healer directory', async state => {
  const response = await GET(new NextRequest(`http://localhost/api/healers?q=${token}&serviceSlug=${state === 'inactive' ? inactiveSlug : `missing-${token}`}`))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ items: [], nextCursor: null })
})

test('deactivation is visible on the next request without a stale service-option cache', async () => {
  expect((await read()).items).toHaveLength(20)
  try {
    await prisma.service.update({ where: { slug: activeSlug }, data: { isActive: false } })
    expect(await read()).toEqual({ items: [], nextCursor: null })
  } finally { await prisma.service.update({ where: { slug: activeSlug }, data: { isActive: true } }) }
})
