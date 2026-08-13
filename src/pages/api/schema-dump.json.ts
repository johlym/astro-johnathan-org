import type { APIRoute } from 'astro'
import { getEmDashCollection, getEmDashEntry } from 'emdash'
import { resolveMediaUrl } from '../../lib/content'

export const prerender = false

export const GET: APIRoute = async ({ url }) => {
  if (url.searchParams.get('key') !== '3cff-schema-dump') {
    return new Response(null, { status: 404 })
  }

  const slug = url.searchParams.get('slug') || '01KZY5FJQ80F6CQPHKX7G0ERET'
  const { entries, error } = await getEmDashCollection('projects', { limit: 5 }).catch((err) => ({
    entries: [],
    error: err instanceof Error ? err.message : String(err),
  }))
  const { entry } = await getEmDashEntry('projects', slug).catch(() => ({ entry: null }))

  const summarize = (item: { id: string; data: Record<string, unknown> } | null) => {
    if (!item) return null
    const screenshot = item.data.screenshot
    return {
      id: item.id,
      dataKeys: Object.keys(item.data ?? {}),
      project_name: item.data.project_name,
      project_url: item.data.project_url,
      stack: item.data.stack,
      screenshot,
      screenshotType: screenshot === null ? 'null' : typeof screenshot,
      resolvedScreenshot: resolveMediaUrl(screenshot),
      descriptionType: Array.isArray(item.data.description) ? 'array' : typeof item.data.description,
      seo: item.data.seo ?? null,
      slug: item.data.slug,
    }
  }

  return new Response(
    JSON.stringify(
      {
        collectionError: error ?? null,
        entries: entries?.map((item) => summarize(item)),
        bySlug: summarize(entry),
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
