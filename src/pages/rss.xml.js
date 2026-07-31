import rss from '@astrojs/rss'
import { getPosts } from '../lib/content'

export const prerender = false

export async function GET(context) {
  const posts = await getPosts(1000).catch(() => [])

  const items = posts.map((post) => ({
    title: post.title,
    description: post.excerpt ?? '',
    pubDate: new Date(post.publishedAt ?? post.createdAt ?? Date.now()),
    link: `/blog/${post.slug}/`,
  }))

  return rss({
    title: 'Johnathan.org',
    description: 'An Internet property by Johnathan Lyman',
    site: context.site ?? 'https://johnathan.org',
    items,
  })
}
