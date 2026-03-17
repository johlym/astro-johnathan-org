export const prerender = false

import type { APIRoute } from 'astro'

const TOKEN = import.meta.env.RAINDROP_API_TEST_TOKEN
const BASE = 'https://api.raindrop.io/rest/v1'

type Collection = { _id: number; title: string; count: number }
type Raindrop = { _id: number; title: string; link: string; domain: string; tags: string[] }

async function raindropFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Raindrop API ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

async function getAllRaindrops(collectionId: number): Promise<Raindrop[]> {
  const all: Raindrop[] = []
  let page = 0
  while (true) {
    const data = await raindropFetch<{ items: Raindrop[]; count: number }>(
      `/raindrops/${collectionId}?sort=-created&perpage=50&page=${page}`,
    )
    all.push(...data.items)
    if (all.length >= data.count || data.items.length < 50) break
    page++
  }
  return all
}

export const GET: APIRoute = async () => {
  try {
    if (!TOKEN) throw new Error('RAINDROP_API_TEST_TOKEN is not set')
    const colData = await raindropFetch<{ items: Collection[] }>('/collections')
    const populated = colData.items.filter((c) => c.count > 0)
    const withLinks = await Promise.all(
      populated.map(async (col) => ({
        _id: col._id,
        title: col.title,
        links: await getAllRaindrops(col._id),
      })),
    )
    const sections = withLinks.sort((a, b) => a.title.localeCompare(b.title))
    return new Response(JSON.stringify(sections), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[/api/links.json]', err)
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
