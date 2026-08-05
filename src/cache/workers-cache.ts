/**
 * Astro route-cache provider config for Cloudflare Workers Caching.
 *
 * Safe to import from `astro.config.mjs` — the runtime module (which imports
 * `cloudflare:workers`) is only loaded inside the Worker bundle.
 *
 * Pair with `"cache": { "enabled": true }` in `wrangler.jsonc`. EmDash already
 * calls `cache.invalidate({ tags })` on publish/update/delete; this provider
 * maps that to `cache.purge()` so full-page edge entries are evicted.
 */

import type { CacheProviderConfig } from 'astro'
import { fileURLToPath } from 'node:url'

export interface WorkersCacheConfig {
  /**
   * Browser-facing max-age (seconds). Edge TTL comes from Astro `maxAge` via
   * `Cloudflare-CDN-Cache-Control`. Defaults to 60.
   */
  browserMaxAge?: number
}

/**
 * Cloudflare Workers Caching provider for Astro route caching.
 */
export function workersCache(
  config: WorkersCacheConfig = {},
): CacheProviderConfig<WorkersCacheConfig> {
  return {
    name: 'workers-cache',
    entrypoint: fileURLToPath(new URL('./workers-cache-runtime.ts', import.meta.url)),
    config,
  }
}
