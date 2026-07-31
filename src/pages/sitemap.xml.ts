import type { APIContext } from 'astro'
import { getPosts, getPages } from '../lib/content'

export const prerender = false

export async function GET(context: APIContext) {
  const site = context.site?.origin ?? 'https://johnathan.org'

  const [posts, pages] = await Promise.all([
    getPosts(1000).catch(() => []),
    getPages().catch(() => []),
  ])

  const urls: { loc: string; lastmod?: string }[] = []

  urls.push({ loc: `${site}/` })
  urls.push({ loc: `${site}/blog/` })
  urls.push({ loc: `${site}/links/` })

  for (const post of posts) {
    urls.push({
      loc: `${site}/blog/${post.slug}/`,
      lastmod: post.publishedAt
        ? new Date(post.publishedAt).toISOString()
        : post.createdAt
          ? new Date(post.createdAt).toISOString()
          : undefined,
    })
  }

  for (const page of pages) {
    if (['links'].includes(page.slug)) continue
    urls.push({ loc: `${site}/${page.slug}/` })
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
  </url>`,
  )
  .join('\n')}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
