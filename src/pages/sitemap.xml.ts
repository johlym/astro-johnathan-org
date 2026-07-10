import type { APIContext } from 'astro'
import { getPosts, getAllPageSlugs } from '../lib/payload'
import { getMdPosts } from '../lib/mdposts'

export async function GET(context: APIContext) {
  const site = context.site?.origin ?? 'https://johnathan.org'

  const [payloadResult, mdPosts, pagesResult] = await Promise.all([
    getPosts(1, 1000).catch(() => ({ docs: [] })),
    getMdPosts().catch(() => []),
    getAllPageSlugs().catch(() => ({ docs: [] })),
  ])

  const urls: { loc: string; lastmod?: string }[] = []

  // Static pages
  urls.push({ loc: `${site}/` })
  urls.push({ loc: `${site}/blog/` })
  urls.push({ loc: `${site}/links/` })

  // Payload blog posts
  for (const post of payloadResult.docs) {
    urls.push({
      loc: `${site}/blog/${post.slug}/`,
      lastmod: post.createdAt ? new Date(post.createdAt).toISOString() : undefined,
    })
  }

  // Markdown blog posts
  for (const post of mdPosts) {
    urls.push({
      loc: `${site}/blog/${post.slug}/`,
      lastmod: post.data.date ? post.data.date.toISOString() : undefined,
    })
  }

  // Payload pages
  for (const page of pagesResult.docs) {
    // Skip pages already covered by explicit static routes
    if (['links'].includes(page.slug)) continue
    urls.push({ loc: `${site}/${page.slug}/` })
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
  </url>`
  )
  .join('\n')}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
