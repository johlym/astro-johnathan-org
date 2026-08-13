import type { APIRoute } from 'astro'
import { getEmDashCollection, getRequestContext, SchemaRegistry } from 'emdash'

export const prerender = false

export const GET: APIRoute = async ({ url }) => {
  if (url.searchParams.get('key') !== '3cff-schema-dump') {
    return new Response(null, { status: 404 })
  }

  const db = getRequestContext()?.db as ConstructorParameters<typeof SchemaRegistry>[0] | undefined
  if (!db) {
    return new Response(JSON.stringify({ error: 'no db' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const registry = new SchemaRegistry(db)
  const collections = await registry.listCollectionsWithFields()
  const projects = collections.find((c) => c.slug === 'projects') ?? null
  const { entries, error } = await getEmDashCollection('projects', { limit: 3 }).catch((err) => ({
    entries: [],
    error: err instanceof Error ? err.message : String(err),
  }))

  return new Response(
    JSON.stringify(
      {
        projects,
        sampleEntries: entries?.map((entry) => ({
          id: entry.id,
          slug: (entry as { slug?: string }).slug,
          dataKeys: Object.keys(entry.data ?? {}),
          data: entry.data,
        })),
        sampleError: error ?? null,
        allCollectionSlugs: collections.map((c) => c.slug),
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
