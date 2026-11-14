CREATE TYPE "SupportMessageRole" AS ENUM ('MEMBER', 'STAFF');

CREATE TABLE "SupportMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorId" TEXT,
  "authorRole" "SupportMessageRole" NOT NULL,
  "body" TEXT NOT NULL,
  "requestId" VARCHAR(80) NOT NULL,
  "statusAfter" "SupportTicketStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportMessage_ticketId_requestId_key" ON "SupportMessage"("ticketId", "requestId");
CREATE INDEX "SupportMessage_ticketId_createdAt_id_idx" ON "SupportMessage"("ticketId", "createdAt", "id");
CREATE INDEX "SupportMessage_authorId_createdAt_idx" ON "SupportMessage"("authorId", "createdAt");
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the existing visible staff response without inventing its author.
-- Original ticket fields and timestamps remain byte-for-byte unchanged.
INSERT INTO "SupportMessage" ("id", "ticketId", "authorRole", "body", "requestId", "statusAfter", "createdAt")
SELECT 'legacy_' || "id", "id", 'STAFF'::"SupportMessageRole", "response", 'legacy-response', "status",
  COALESCE("respondedAt", "createdAt")
FROM "SupportTicket" WHERE "response" IS NOT NULL AND "response" <> '';
