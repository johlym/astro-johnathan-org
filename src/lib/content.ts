import {
  getEmDashCollection,
  getEmDashEntry,
  getMenu,
  getSiteSettings as getEmDashSiteSettings,
  getEntryTerms,
  getEntriesByTerm,
  getTerm,
  getTaxonomyTerms,
  getWidgetArea,
  search as emdashSearch,
  type EditProxy,
  type TaxonomyTerm,
  type Widget,
  type WidgetArea,
} from 'emdash'

export type NavLink = { href: string; label: string }

export type CategoryTerm = { label: string; slug: string }

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
  /** First category label (convenience). */
  category?: string
  categories: CategoryTerm[]
  edit?: EditProxy
  isPreview?: boolean
}

export type EmDashPage = {
  id: string
  slug: string
  title: string
  excerpt?: string
  body: unknown
  edit?: EditProxy
  isPreview?: boolean
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

export type ProjectImage = {
  id?: string
  url: string
  alt?: string
}

export type EmDashProject = {
  id: string
  slug: string
  title: string
  screenshot: ProjectImage | null
  url?: string
  stack: string[]
  description: unknown
  excerpt?: string
  publishedAt?: string | null
  createdAt?: string
  updatedAt?: string
  edit?: EditProxy
  isPreview?: boolean
}

export type PaginatedPosts = {
  posts: EmDashPost[]
  page: number
  totalPages: number
  total: number
  perPage: number
}

export const BLOG_PER_PAGE = 12

function entryData(entry: { id: string; data: Record<string, unknown> }) {
  return entry.data
}

/**
 * EmDash ContentEntry: `data.id` is the ULID (used in content_taxonomies),
 * `entry.id` is typically the slug.
 */
function entryDbId(entry: { id: string; data: Record<string, unknown> }) {
  const fromData = entry.data.id
  if (typeof fromData === 'string' && fromData) return fromData
  return entry.id
}

function entrySlug(entry: { id: string; data: Record<string, unknown> }, fallback?: string) {
  const data = entry.data
  const fromData = data.slug
  if (typeof fromData === 'string' && fromData) return fromData
  const top = (entry as { slug?: unknown }).slug
  if (typeof top === 'string' && top) return top
  return fallback ?? entry.id
}

function mapCategoryTerms(terms: Array<{ label?: string; slug?: string }> | undefined): CategoryTerm[] {
  if (!terms?.length) return []
  return terms
    .map((t) => ({
      label: String(t.label ?? t.slug ?? ''),
      slug: String(t.slug ?? ''),
    }))
    .filter((t) => t.label && t.slug)
}

async function categoriesForEntry(
  entry: { id: string; data: Record<string, unknown> },
): Promise<CategoryTerm[]> {
  // Prefer terms hydrated onto the entry by getEmDashCollection / getEmDashEntry
  const hydrated = entry.data.terms as Record<string, Array<{ label?: string; slug?: string }>> | undefined
  if (hydrated?.category?.length) {
    return mapCategoryTerms(hydrated.category)
  }

  try {
    // Must use the ULID (`data.id`), not the slug (`entry.id`)
    const terms = await getEntryTerms('posts', entryDbId(entry), 'category')
    return mapCategoryTerms(terms)
  } catch {
    return []
  }
}

function mapPostEntry(
  entry: { id: string; data: Record<string, unknown>; edit?: EditProxy; slug?: string },
  categories: CategoryTerm[],
  opts?: { isPreview?: boolean },
): EmDashPost {
  const data = entryData(entry)
  return {
    id: entryDbId(entry),
    slug: entrySlug(entry),
    title: String(data.title ?? ''),
    excerpt: data.excerpt ? String(data.excerpt) : undefined,
    body: data.body,
    featuredImage: (data.featured_image as EmDashPost['featuredImage']) ?? null,
    showTableOfContents: Boolean(data.show_table_of_contents),
    publishedAt: (data.publishedAt as string | null | undefined) ?? null,
    createdAt: data.createdAt as string | undefined,
    updatedAt: data.updatedAt as string | undefined,
    category: categories[0]?.label,
    categories,
    edit: entry.edit,
    isPreview: opts?.isPreview,
  }
}

function sortPostsByDate(posts: EmDashPost[]) {
  posts.sort((a, b) => {
    const da = new Date(a.publishedAt ?? a.createdAt ?? 0).getTime()
    const db = new Date(b.publishedAt ?? b.createdAt ?? 0).getTime()
    return db - da
  })
  return posts
}

async function menuToNav(name: string): Promise<NavLink[]> {
  try {
    const menu = await getMenu(name)
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

export async function getPosts(limit = 100) {
  const { entries, error } = await getEmDashCollection('posts', {
    status: 'published',
    limit,
  })
  if (error) throw error

  const posts: EmDashPost[] = []
  for (const entry of entries) {
    const categories = await categoriesForEntry(entry)
    posts.push(mapPostEntry(entry, categories))
  }

  return sortPostsByDate(posts)
}

function paginatePosts(all: EmDashPost[], page = 1, perPage = BLOG_PER_PAGE): PaginatedPosts {
  const total = all.length
  const totalPages = Math.max(1, Math.ceil(total / perPage) || 1)
  const safePage = Number.isFinite(page) && page >= 1 ? Math.min(Math.floor(page), totalPages) : 1
  const start = (safePage - 1) * perPage
  return {
    posts: all.slice(start, start + perPage),
    page: safePage,
    totalPages,
    total,
    perPage,
  }
}

export async function getPaginatedPosts(page = 1, perPage = BLOG_PER_PAGE): Promise<PaginatedPosts> {
  return paginatePosts(await getPosts(1000), page, perPage)
}

export async function getPaginatedPostsByCategory(
  categorySlug: string,
  page = 1,
  perPage = BLOG_PER_PAGE,
): Promise<PaginatedPosts> {
  // Prefer EmDash's term filter (same path admin counts use) over client-side filtering
  try {
    const { entries, error } = await getEmDashCollection('posts', {
      status: 'published',
      limit: 1000,
      where: { category: categorySlug },
    })
    if (error) throw error

    const posts: EmDashPost[] = []
    for (const entry of entries) {
      const categories = await categoriesForEntry(entry)
      posts.push(mapPostEntry(entry, categories))
    }
    return paginatePosts(sortPostsByDate(posts), page, perPage)
  } catch {
    // Fallback: getEntriesByTerm
    try {
      const entries = await getEntriesByTerm('posts', 'category', categorySlug)
      const posts: EmDashPost[] = []
      for (const entry of entries) {
        const data = entryData(entry)
        if (data.status && data.status !== 'published') continue
        const categories = await categoriesForEntry(entry)
        posts.push(mapPostEntry(entry, categories))
      }
      return paginatePosts(sortPostsByDate(posts), page, perPage)
    } catch {
      return paginatePosts([], page, perPage)
    }
  }
}

export async function getCategory(slug: string): Promise<TaxonomyTerm | null> {
  try {
    return await getTerm('category', slug)
  } catch {
    return null
  }
}

/** Official EmDash API — includeCounts populates term.count (defaults to true). */
export async function getCategoryTermsWithCounts(includeCounts = true): Promise<TaxonomyTerm[]> {
  try {
    return await getTaxonomyTerms('category', { includeCounts })
  } catch {
    return []
  }
}

export async function getPost(slug: string) {
  const { entry, error, isPreview } = await getEmDashEntry('posts', slug)
  if (error || !entry) return null

  const categories = await categoriesForEntry(entry)
  return mapPostEntry(entry, categories, { isPreview })
}

export async function getRelatedPosts(
  categorySlug: string | undefined,
  excludeId: string,
  limit = 3,
): Promise<EmDashPost[]> {
  if (!categorySlug) return []

  try {
    const entries = await getEntriesByTerm('posts', 'category', categorySlug)
    const posts: EmDashPost[] = []
    for (const entry of entries) {
      if (entryDbId(entry) === excludeId) continue
      const data = entryData(entry)
      if (data.status && data.status !== 'published') continue
      const categories = await categoriesForEntry(entry)
      posts.push(mapPostEntry(entry, categories))
    }
    return sortPostsByDate(posts).slice(0, limit)
  } catch {
    return []
  }
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
      edit: entry.edit,
    } satisfies EmDashPage
  })
}

export async function getPage(slug: string) {
  const { entry, error, isPreview } = await getEmDashEntry('pages', slug)
  if (error || !entry) return null
  const data = entryData(entry)
  return {
    id: entry.id,
    slug: entrySlug(entry, slug),
    title: String(data.title ?? ''),
    excerpt: data.excerpt ? String(data.excerpt) : undefined,
    body: data.body,
    edit: entry.edit,
    isPreview,
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
  return menuToNav('primary')
}

export async function getSocialsNav() {
  return menuToNav('socials')
}

export async function getSidebarWidgets(): Promise<Widget[]> {
  try {
    const area: WidgetArea | null = await getWidgetArea('sidebar')
    return area?.widgets ?? []
  } catch {
    return []
  }
}

export async function searchSite(query: string, limit = 20) {
  try {
    return await emdashSearch(query, {
      collections: ['posts', 'pages', 'projects'],
      status: 'published',
      limit,
    })
  } catch {
    return { items: [] }
  }
}

const INTERNAL_MEDIA_PREFIX = '/_emdash/api/media/file/'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringField(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

/**
 * EmDash image fields are MediaValue objects: `{ id, provider, meta.storageKey }`
 * and often have no `url`/`src` until render time. Resolve a fetchable path.
 */
export function resolveMediaUrl(value: unknown): string | undefined {
  if (value == null) return undefined

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('/') ||
      trimmed.startsWith('data:')
    ) {
      return trimmed
    }
    return `${INTERNAL_MEDIA_PREFIX}${trimmed}`
  }

  const obj = asRecord(value)
  if (!obj) return undefined

  const meta = asRecord(obj.meta)
  const asset = asRecord(obj.asset)
  const nestedImage = asRecord(obj.image)
  const layers = [obj, nestedImage, asset, meta].filter(Boolean) as Record<string, unknown>[]

  for (const layer of layers) {
    const direct = stringField(layer.src, layer.url, layer.previewUrl)
    if (direct) return direct
    const storageKey = stringField(layer.storageKey)
    if (storageKey) {
      if (storageKey.startsWith('/') || storageKey.startsWith('http')) return storageKey
      return `${INTERNAL_MEDIA_PREFIX}${storageKey}`
    }
  }

  const id = stringField(obj.id, asset?._ref, nestedImage?.id)
  if (id) {
    if (id.startsWith('/') || id.startsWith('http')) return id
    return `${INTERNAL_MEDIA_PREFIX}${id}`
  }

  return undefined
}

/** Rewrite an internal EmDash media path through the public R2/CDN resolver. */
export function toPublicMediaUrl(
  url: string | undefined,
  resolve?: ((storageKey: string) => string) | undefined,
): string {
  if (!url) return ''
  if (!resolve || !url.startsWith(INTERNAL_MEDIA_PREFIX)) return url
  const key = url.slice(INTERNAL_MEDIA_PREFIX.length)
  return resolve(key) || url
}

function mapProjectImage(value: unknown): ProjectImage | null {
  if (value == null || value === '') return null
  const url = resolveMediaUrl(value)
  if (!url) return null
  const obj = asRecord(value)
  const media = asRecord(obj?.image) ?? asRecord(obj?.asset) ?? obj
  return {
    id: stringField(media?.id, asRecord(media?.asset)?._ref),
    url,
    alt: stringField(media?.alt, obj?.alt),
  }
}

function portableTextExcerpt(value: unknown, max = 180): string | undefined {
  const chunks: string[] = []

  const walk = (node: unknown) => {
    if (!node) return
    if (typeof node === 'string') {
      chunks.push(node)
      return
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    const rec = asRecord(node)
    if (!rec) return
    if (typeof rec.text === 'string') chunks.push(rec.text)
    if (rec.children) walk(rec.children)
    if (rec.content) walk(rec.content)
  }

  walk(value)
  const plain = chunks.join(' ').replace(/\s+/g, ' ').trim()
  if (!plain || /^tbd\.?$/i.test(plain)) return undefined
  if (plain.length <= max) return plain
  return `${plain.slice(0, max).replace(/\s+\S*$/, '')}…`
}

function parseStack(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value !== 'string' || !value.trim()) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function mapProjectEntry(
  entry: { id: string; data: Record<string, unknown>; edit?: EditProxy; slug?: string },
  opts?: { isPreview?: boolean },
): EmDashProject {
  const data = entryData(entry)
  const url = data.project_url ? String(data.project_url) : undefined
  const seo = asRecord(data.seo)
  const screenshot =
    mapProjectImage(data.screenshot) ??
    mapProjectImage(seo?.image) ??
    mapProjectImage(data.featured_image)
  const title = String(data.project_name ?? data.title ?? '')
  return {
    id: entryDbId(entry),
    slug: entrySlug(entry),
    title,
    screenshot,
    url: url || undefined,
    stack: parseStack(data.stack),
    description: data.description,
    excerpt: portableTextExcerpt(data.description) ?? stringField(seo?.description),
    publishedAt: (data.publishedAt as string | Date | null | undefined)
      ? String(data.publishedAt)
      : null,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
    edit: entry.edit,
    isPreview: opts?.isPreview,
  }
}

function sortProjects(projects: EmDashProject[]) {
  projects.sort((a, b) => {
    const da = new Date(a.publishedAt ?? a.createdAt ?? 0).getTime()
    const db = new Date(b.publishedAt ?? b.createdAt ?? 0).getTime()
    if (db !== da) return db - da
    return a.title.localeCompare(b.title)
  })
  return projects
}

export async function getProjects() {
  const { entries, error } = await getEmDashCollection('projects', {
    status: 'published',
    limit: 1000,
  })
  if (error) throw error

  return sortProjects(entries.map((entry) => mapProjectEntry(entry)))
}

export async function getProject(slug: string) {
  const { entry, error, isPreview } = await getEmDashEntry('projects', slug)
  if (error || !entry) return null
  return mapProjectEntry(entry, { isPreview })
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

export function wordCountFromBody(body: unknown): string {
  const rawText = JSON.stringify(body ?? '').replace(/[#*`[\]()>_~|!{}",:]+/g, ' ')
  return rawText.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length.toLocaleString('en-US')
}
