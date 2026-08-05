/**
 * Runtime entry for the Workers Caching Astro cache provider.
 *
 * Do not import this from `astro.config.mjs` — use `workersCache()` from
 * `./workers-cache.ts` instead.
 */

import type { CacheProviderFactory } from 'astro'
import type { WorkersCacheConfig } from './workers-cache'

const factory: CacheProviderFactory<WorkersCacheConfig> = (config) => {
  const browserMaxAge = config?.browserMaxAge ?? 60

  return {
    name: 'workers-cache',

    setHeaders(options) {
      const headers = new Headers()

      if (options.maxAge !== undefined) {
        // Short browser TTL so purge + navigation picks up fresh HTML quickly.
        headers.set('Cache-Control', `public, max-age=${browserMaxAge}`)

        // Long edge TTL — Workers Caching sits in front of the Worker and
        // serves HITs without invoking it. EmDash invalidates by Cache-Tag
        // on content writes, so this can be aggressive.
        let edge = `public, max-age=${options.maxAge}`
        if (options.swr !== undefined) {
          edge += `, stale-while-revalidate=${options.swr}`
        }
        headers.set('Cloudflare-CDN-Cache-Control', edge)
      }

      if (options.tags?.length) {
        headers.set('Cache-Tag', options.tags.join(','))
      }

      if (options.lastModified) {
        headers.set('Last-Modified', options.lastModified.toUTCString())
      }

      if (options.etag) {
        headers.set('ETag', options.etag)
      }

      return headers
    },

    async invalidate(options) {
      const tags = options.tags
        ? Array.isArray(options.tags)
          ? options.tags
          : [options.tags]
        : []
      const pathPrefixes = options.path ? [options.path] : []

      if (tags.length === 0 && pathPrefixes.length === 0) return

      // Dynamic import so local Node tooling that accidentally loads this
      // module does not fail on the cloudflare:workers specifier.
      const { cache } = await import('cloudflare:workers')

      const result = await cache.purge({
        ...(tags.length > 0 ? { tags } : {}),
        ...(pathPrefixes.length > 0 ? { pathPrefixes } : {}),
      })

      if (result && typeof result === 'object' && 'success' in result && result.success === false) {
        const errors =
          'errors' in result && Array.isArray(result.errors)
            ? JSON.stringify(result.errors)
            : 'unknown error'
        throw new Error(`[workers-cache] cache.purge failed: ${errors}`)
      }
    },
  }
}

export default factory
