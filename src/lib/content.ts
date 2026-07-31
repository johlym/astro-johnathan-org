import {
  getEmDashCollection,
  getEmDashEntry,
  getMenu,
  getSiteSettings as getEmDashSiteSettings,
  getEntryTerms,
} from 'emdash'

export type EmDashPost = {
  id: string
  slug: string
  title: string
  excerpt?: string
  body: unknown
  featuredImage?: { id?: string; url?: string; alt?: string } | null
  showTableOfContents?: boolean
  publishedAt?: string | null
  createdAt?: string
  updatedAt?: string
  category?: string
}

export type EmDashPage = {
  id: string
  slug: string
  title: string
  excerpt?: string
  body: unknown
}

export type WorkExperience = {
  id: string
  where: string
  title: string
  from: string
  to?: string | null
  current?: boolean
  details?: string | null
}

export type Certification = {
  id: string
  name: string
  issuingBody: string
  issued?: string | null
}

function entryData(entry: { id: string; data: Record<string, unknown> }) {
  return entry.data
}

function entrySlug(entry: { id: string; data: Record<string, unknown> }, fallback?: string) {
  const data = entry.data
  const fromData = data.slug
  if (typeof fromData === 'string' && fromData) return fromData
  // EmDash may expose slug on the entry object outside `data`
  const top = (entry as { slug?: unknown }).slug
  if (typeof top === 'string' && top) return top
  return fallback ?? entry.id
}

export async function getPosts(limit = 100) {
  const { entries, error } = await getEmDashCollection('posts', {
    status: 'published',
    limit,
  })
  if (error) throw error

  const posts: EmDashPost[] = []
  for (const entry of entries) {
    const data = entryData(entry)
    let category: string | undefined
    try {
      const terms = await getEntryTerms('posts', entry.id, 'category')
      category = terms?.[0]?.label ?? terms?.[0]?.slug
    } catch {
      // taxonomy optional
    }
    posts.push({
      id: entry.id,
      slug: entrySlug(entry),
      title: String(data.title ?? ''),
      excerpt: data.excerpt ? String(data.excerpt) : undefined,
      body: data.body,
      featuredImage: (data.featured_image as EmDashPost['featuredImage']) ?? null,
      showTableOfContents: Boolean(data.show_table_of_contents),
      publishedAt: (data.publishedAt as string | null | undefined) ?? null,
      createdAt: data.createdAt as string | undefined,
      updatedAt: data.updatedAt as string | undefined,
      category,
    })
  }

  posts.sort((a, b) => {
    const da = new Date(a.publishedAt ?? a.createdAt ?? 0).getTime()
    const db = new Date(b.publishedAt ?? b.createdAt ?? 0).getTime()
    return db - da
  })

  return posts
}

export async function getPost(slug: string) {
  const { entry, error } = await getEmDashEntry('posts', slug)
  if (error || !entry) return null

  const data = entryData(entry)
  let category: string | undefined
  try {
    const terms = await getEntryTerms('posts', entry.id, 'category')
    category = terms?.[0]?.label ?? terms?.[0]?.slug
  } catch {
    // optional
  }

  return {
    id: entry.id,
    slug: entrySlug(entry, slug),
    title: String(data.title ?? ''),
    excerpt: data.excerpt ? String(data.excerpt) : undefined,
    body: data.body,
    featuredImage: (data.featured_image as EmDashPost['featuredImage']) ?? null,
    showTableOfContents: Boolean(data.show_table_of_contents),
    publishedAt: (data.publishedAt as string | null | undefined) ?? null,
    createdAt: data.createdAt as string | undefined,
    updatedAt: data.updatedAt as string | undefined,
    category,
  } satisfies EmDashPost
}

export async function getPages() {
  const { entries, error } = await getEmDashCollection('pages', {
    status: 'published',
    limit: 1000,
  })
  if (error) throw error

  return entries.map((entry) => {
    const data = entryData(entry)
    return {
      id: entry.id,
      slug: entrySlug(entry),
      title: String(data.title ?? ''),
      excerpt: data.excerpt ? String(data.excerpt) : undefined,
      body: data.body,
    } satisfies EmDashPage
  })
}

export async function getPage(slug: string) {
  const { entry, error } = await getEmDashEntry('pages', slug)
  if (error || !entry) return null
  const data = entryData(entry)
  return {
    id: entry.id,
    slug: entrySlug(entry, slug),
    title: String(data.title ?? ''),
    excerpt: data.excerpt ? String(data.excerpt) : undefined,
    body: data.body,
  } satisfies EmDashPage
}

export async function getSiteSettings() {
  try {
    const settings = await getEmDashSiteSettings()
    return {
      siteTitle: String(settings?.title ?? 'Johnathan.org'),
      siteDescription: settings?.tagline ? String(settings.tagline) : '',
    }
  } catch {
    return { siteTitle: 'Johnathan.org', siteDescription: '' }
  }
}

export async function getPrimaryNav() {
  try {
    const menu = await getMenu('primary')
    if (!menu?.items?.length) return []
    return menu.items
      .map((item) => ({
        href: item.url || '/',
        label: item.label || '',
      }))
      .filter((l) => l.label)
  } catch {
    return []
  }
}

export async function getWorkExperience(ids?: string[]) {
  const { entries, error } = await getEmDashCollection('work_experience', {
    status: 'published',
    limit: 100,
  })
  if (error) throw error

  let docs: WorkExperience[] = entries.map((entry) => {
    const data = entryData(entry)
    return {
      id: entry.id,
      where: String(data.where ?? ''),
      title: String(data.title ?? ''),
      from: String(data.from ?? ''),
      to: data.to ? String(data.to) : null,
      current: Boolean(data.current),
      details: data.details ? String(data.details) : null,
    }
  })

  if (ids?.length) {
    const order = new Map(ids.map((id, i) => [id, i]))
    docs = docs
      .filter((d) => order.has(d.id))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  } else {
    docs.sort((a, b) => new Date(b.from).getTime() - new Date(a.from).getTime())
  }

  return docs
}

export async function getCertifications(ids?: string[]) {
  const { entries, error } = await getEmDashCollection('certifications', {
    status: 'published',
    limit: 100,
  })
  if (error) throw error

  let docs: Certification[] = entries.map((entry) => {
    const data = entryData(entry)
    return {
      id: entry.id,
      name: String(data.name ?? ''),
      issuingBody: String(data.issuing_body ?? ''),
      issued: data.issued ? String(data.issued) : null,
    }
  })

  if (ids?.length) {
    const order = new Map(ids.map((id, i) => [id, i]))
    docs = docs
      .filter((d) => order.has(d.id))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  } else {
    docs.sort((a, b) => {
      const da = a.issued ? new Date(a.issued).getTime() : 0
      const db = b.issued ? new Date(b.issued).getTime() : 0
      return db - da
    })
  }

  return docs
}
