/** Fail closed before creating a Prisma client for sample-catalog writes. */
export function validateCatalogSeedTarget(
  databaseUrl: string | undefined,
  options: { apply: boolean; confirmedHost?: string; nodeEnv?: string; vercel?: string },
) {
  if (options.nodeEnv === 'production' || options.vercel) {
    throw new Error('Catalog sample seeding is disabled in production and Vercel runtimes.')
  }
  if (!databaseUrl) throw new Error('DATABASE_URL is required.')
  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.')
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('DATABASE_URL must specify a PostgreSQL host and database.')
  }
  // Do not accept URL options that can silently redirect a validated host/database.
  const routing = new Set(['host', 'hostaddr', 'dbname', 'database', 'service', 'port', 'user', 'password'])
  if ([...parsed.searchParams.keys()].some(key => routing.has(key.toLowerCase()))) {
    throw new Error('Database routing overrides in URL parameters are not supported.')
  }
  const hostname = parsed.hostname.toLowerCase()
  const databaseName = decodeURIComponent(parsed.pathname.slice(1))
  if (options.apply && options.confirmedHost?.trim().toLowerCase() !== hostname) {
    throw new Error('Writes require --confirm-host=<exact DATABASE_URL hostname>. Verify it is a disposable development branch first.')
  }
  return { hostname, databaseName }
}
