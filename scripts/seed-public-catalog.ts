/**
 * Safe catalog-only example seed. Unlike prisma/seed.ts this never inserts
 * users, payments, refunds, memberships, orders or marketing data.
 *
 * Usage:
 *   pnpm seed:catalog
 *   pnpm seed:catalog --apply --confirm-host=localhost
 *   pnpm seed:catalog --apply --confirm-host=<dev-branch-db-host>
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { sampleCourses, samplePrograms, sampleServices } from '../src/lib/catalog/sample-data'
import { seedPublicSampleCatalog } from '../src/lib/catalog/seed-public-samples'
import { validateCatalogSeedTarget } from '../src/lib/catalog/seed-guard'

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const hostArgs = args.filter(arg => arg.startsWith('--confirm-host='))
  if (hostArgs.length > 1 || args.some(arg => arg !== '--apply' && !arg.startsWith('--confirm-host='))) {
    throw new Error('Usage: pnpm seed:catalog [--apply --confirm-host=<hostname>]')
  }
  const target = validateCatalogSeedTarget(process.env.DATABASE_URL, {
    apply,
    confirmedHost: hostArgs[0]?.slice('--confirm-host='.length),
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
  })
  // Never print DATABASE_URL, its password, username or search parameters.
  console.log(`[catalog-seed] Target host: ${target.hostname}; database: ${target.databaseName}`)
  console.log(`[catalog-seed] Catalog examples: ${sampleServices.length} services, ${samplePrograms.length} programs, ${sampleCourses.length} courses, ${sampleCourses.reduce((n, c) => n + c.lessons.length, 0)} lesson outlines`)
  if (!apply) {
    console.log('[catalog-seed] Dry run. No database connection or write made. Pass --apply and --confirm-host to insert missing records.')
    return
  }
  const prisma = new PrismaClient()
  try {
    const result = await seedPublicSampleCatalog(prisma)
    console.log(`[catalog-seed] Completed. Checked ${result.sampleServices} services, ${result.samplePrograms} programs, ${result.sampleCourses} courses and ${result.sampleLessons} lesson outlines. Existing catalog rows were preserved.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(() => {
  // Avoid printing driver exceptions: they may contain connection details.
  console.error('[catalog-seed] Refused or failed. Check development target and database access; no credentials were logged.')
  process.exitCode = 1
})
