import { getVercelOidcToken } from '@vercel/oidc'

/**
 * Reuse the already deployed product-catalog image store for public service images.
 * In Vercel, an OIDC identity for the dedicated image store is preferred; its
 * dedicated token is the fallback. An ordinary BLOB_READ_WRITE_TOKEN is used only
 * when no dedicated store is configured, preserving the existing product policy.
 */
export async function resolveCatalogImageStorageAuth(env: NodeJS.ProcessEnv = process.env):
  Promise<{ storeId: string; oidcToken: string } | { token: string } | null> {
  const storeId = env.PRODUCT_IMAGES_BLOB_STORE_ID?.trim()
  const dedicatedToken = env.PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN?.trim()
  if (storeId) {
    try {
      const oidcToken = (await getVercelOidcToken()).trim()
      if (oidcToken) return { storeId, oidcToken }
    } catch {
      // Explicit dedicated-token fallback; never reveal the provider failure.
    }
    return dedicatedToken ? { token: dedicatedToken } : null
  }
  const token = dedicatedToken || env.BLOB_READ_WRITE_TOKEN?.trim()
  return token ? { token } : null
}
