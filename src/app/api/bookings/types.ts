import { z } from 'zod'

export const CreateBookingBody = z.object({
  healerId: z.string().min(1),
  serviceId: z.string().min(1),
  expectedPricePaise: z.number().int().nonnegative().max(2_147_483_647).optional(),
  scheduledAt: z.string().datetime(),
})
export type CreateBookingBody = z.infer<typeof CreateBookingBody>

export const RescheduleBody = z.object({
  scheduledAt: z.string().datetime(),
})
export type RescheduleBody = z.infer<typeof RescheduleBody>
