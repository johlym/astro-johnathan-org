/**
 * Raindrop.io proxy — previously served by Payload at /api/raindrop.
 * Same-origin so the frontend can fetch without a separate CMS host.
 */

import type { APIRoute } from 'astro'

export const prerender = false

const BASE = 'https://api.raindrop.io/rest/v1'

type Collection = { _id: number; title: string; count: number }
type Raindrop = { _id: number; title: string; link: string; domain: string; tags: string[] }
type Section = { _id: number; title: string; links: Raindrop[] }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

async function resolveToken(): Promise<string | undefined> {
  // Prefer process.env — available on Workers with nodejs_compat, and in local Node.
  // Do not use Astro.locals.runtime.env (removed in Astro 6; the getter throws).
  if (typeof process !== 'undefined' && process.env?.RAINDROP_API_TEST_TOKEN) {
    return process.env.RAINDROP_API_TEST_TOKEN
  }
  try {
    const { env } = await import('cloudflare:workers')
    const fromWorker = (env as { RAINDROP_API_TEST_TOKEN?: string }).RAINDROP_API_TEST_TOKEN
    if (fromWorker) return fromWorker
  } catch {
    // Local `astro dev` may not provide cloudflare:workers
  }
  return import.meta.env.RAINDROP_API_TEST_TOKEN
}

async function raindropFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Raindrop API ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

async function getAllRaindrops(collectionId: number, token: string): Promise<Raindrop[]> {
  const all: Raindrop[] = []
  let page = 0
  while (true) {
    const data = await raindropFetch<{ items: Raindrop[]; count: number }>(
      `/raindrops/${collectionId}?sort=-created&perpage=50&page=${page}`,
      token,
    )
    all.push(...data.items)
    if (all.length >= data.count || data.items.length < 50) break
    page++
  }
  return all
}

async function getSections(token: string): Promise<Section[]> {
  const colData = await raindropFetch<{ items: Collection[] }>('/collections', token)
  const populated = colData.items.filter((c) => c.count > 0)
  const withLinks = await Promise.all(
    populated.map(async (col) => ({
      _id: col._id,
      title: col.title,
      links: await getAllRaindrops(col._id, token),
    })),
  )
  return withLinks.sort((a, b) => a.title.localeCompare(b.title))
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export const GET: APIRoute = async ({ cache }) => {
  // Edge caching for this route is declared in experimental.routeRules.
  // Keep errors out of the shared cache.
  const token = await resolveToken()

  if (!token) {
    console.error('[/api/raindrop] RAINDROP_API_TEST_TOKEN is not set')
    if (cache.enabled) cache.set(false)
    return Response.json([], { status: 500, headers: CORS_HEADERS })
  }

  try {
    const sections = await getSections(String(token))
    return Response.json(sections, { headers: CORS_HEADERS })
  } catch (err) {
    console.error('[/api/raindrop]', err)
    if (cache.enabled) cache.set(false)
    return Response.json([], { status: 500, headers: CORS_HEADERS })
  }
}
