import rss from '@astrojs/rss';
import { getMdPosts } from '../lib/mdposts';
import { getPosts } from '../lib/payload';

export const prerender = false;

export async function GET(context) {
  const [payloadResult, mdPosts] = await Promise.all([
    getPosts(1, 1000).catch(() => ({ docs: [] })),
    getMdPosts().catch(() => []),
  ]);

  const payloadItems = payloadResult.docs.map((post) => ({
    title: post.title,
    description: post.excerpt ?? '',
    pubDate: new Date(post.createdAt),
    link: `/blog/${post.slug}/`,
  }));

  const mdItems = mdPosts.map((post) => ({
    title: post.data.title,
    description: post.data.excerpt ?? post.data.description ?? '',
    pubDate: post.data.date,
    link: `/blog/${post.slug}/`,
  }));

  const items = [...payloadItems, ...mdItems].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
  );

  return rss({
    title: 'Johnathan.org',
    description: 'An Internet property by Johnathan Lyman',
    site: context.site ?? 'https://johnathan.org',
    items,
  });
}