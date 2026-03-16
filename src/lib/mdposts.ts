import { getCollection, type CollectionEntry } from 'astro:content'

export type MdPost = CollectionEntry<'posts'> & { slug: string }

export function getMdSlug(entry: CollectionEntry<'posts'>): string {
  return entry.data.slug ?? entry.id.replace(/^\d{4}-\d{2}-\d{2}-/, '')
}

export async function getMdPosts(): Promise<MdPost[]> {
  const entries = await getCollection('posts', ({ data }) => !data.draft)
  return entries
    .map((e) => ({ ...e, slug: getMdSlug(e) }))
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
}
