import { createServiceSchema, serviceFieldsSchema, serviceFormSchema } from '@/lib/services/catalog-schema'

const fields = {
  name: 'Restorative Yoga',
  description: 'A guided wellness session',
  category: 'YOGA',
  price: '799',
  duration: '60',
  mode: 'ONLINE',
}
const trusted = 'https://ganges-images.public.blob.vercel-storage.com/service-images/yoga.webp'

describe('service image publication validation', () => {
  test('accepts a trusted HTTPS image in both create and edit submissions', () => {
    expect(serviceFormSchema.parse({ ...fields, slug: 'restorative-yoga', image: trusted }).image).toBe(trusted)
    expect(serviceFieldsSchema.parse({ ...fields, image: trusted }).image).toBe(trusted)
    expect(createServiceSchema.parse({ ...fields, image: trusted }).image).toBe(trusted)
  })

  test('blank image removes the photo without creating an invalid URL', () => {
    expect(serviceFieldsSchema.parse({ ...fields, image: '' }).image).toBeNull()
    expect(serviceFormSchema.parse({ ...fields, slug: 'restorative-yoga' }).image).toBeUndefined()
    expect(serviceFieldsSchema.parse({ ...fields, image: null }).image).toBeNull()
  })

  test.each([
    'http://example.com/photo.png',
    'https://untrusted.example.com/photo.webp',
    'https://user:secret@ganges-images.public.blob.vercel-storage.com/image.png',
    'javascript:alert(1)',
  ])('rejects unapproved or unsafe image URL %s', url => {
    expect(serviceFieldsSchema.safeParse({ ...fields, image: url }).success).toBe(false)
  })

  test('rejects URLs larger than the maximum supported field size', () => {
    expect(serviceFieldsSchema.safeParse({ ...fields, image: 'a'.repeat(2001) }).success).toBe(false)
  })
})
