-- Additive: existing bookings, payments and customer data remain unchanged.
CREATE TYPE "BookingEmailKind" AS ENUM ('REQUESTED', 'CONFIRMED');
CREATE TYPE "BookingEmailStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'REVIEW');

CREATE TABLE "BookingEmail" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" "BookingEmailKind" NOT NULL,
    "status" "BookingEmailStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "firstAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "claimToken" TEXT,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookingEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingEmail_bookingId_kind_key" ON "BookingEmail"("bookingId", "kind");
CREATE INDEX "BookingEmail_status_nextAttemptAt_idx" ON "BookingEmail"("status", "nextAttemptAt");
ALTER TABLE "BookingEmail" ADD CONSTRAINT "BookingEmail_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
