import type { LexicalNode } from './richtext'

type RichTextContent = { root: LexicalNode } | null

export type Post = {
  id: number
  title: string
  slug: string
  excerpt?: string
  body: RichTextContent
  createdAt: string
  author: { id: number; name: string } | number | null
  category: { id: number; title: string; slug: string } | number | null
  featuredImage: { id: number; url: string; alt?: string } | number | null
  showTableOfContents?: boolean
}

export type Page = {
  id: number
  title: string
  slug: string
  excerpt?: string
  body: RichTextContent
}

export type WorkExperience = {
  id: number
  where: string
  title: string
  from: string
  to: string | null
  current: boolean
  details?: string | null
}

export type Certification = {
  id: number
  name: string
  issuingBody: string
  issued?: string | null
}

export type SiteSettings = {
  siteTitle: string
  siteDescription?: string | null
}

export type Navigation = {
  links?: Array<{
    page: { id: number; title: string; slug: string } | number
    label?: string | null
  }>
}

export type PaginatedResponse<T> = {
  docs: T[]
  totalDocs: number
  limit: number
  totalPages: number
  page: number
  hasPrevPage: boolean
  hasNextPage: boolean
  prevPage: number | null
  nextPage: number | null
}

const BASE = (import.meta.env.PAYLOAD_API_URL ?? '').replace(/\/$/, '')

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Payload API ${res.status}: ${BASE}${path}`)
  return res.json() as Promise<T>
}

export function getPosts(page = 1, limit = 10) {
  return apiFetch<PaginatedResponse<Post>>(
    `/api/posts?sort=-createdAt&depth=1&limit=${limit}&page=${page}`,
  )
}

export function getPost(slug: string) {
  return apiFetch<PaginatedResponse<Post>>(
    `/api/posts?where[slug][equals]=${encodeURIComponent(slug)}&depth=2&limit=1`,
  )
}

export function getPage(slug: string) {
  return apiFetch<PaginatedResponse<Page>>(
    `/api/pages?where[slug][equals]=${encodeURIComponent(slug)}&depth=2&limit=1`,
  )
}

export function getSiteSettings() {
  return apiFetch<SiteSettings>('/api/globals/site-settings')
}

export function getNavigation() {
  return apiFetch<Navigation>('/api/globals/navigation?depth=1')
}

export function getWorkExperience(ids?: number[]) {
  if (ids?.length) {
    return apiFetch<PaginatedResponse<WorkExperience>>(
      `/api/work-experience?where[id][in]=${ids.join(',')}&limit=100&depth=0`,
    )
  }
  return apiFetch<PaginatedResponse<WorkExperience>>(
    '/api/work-experience?sort=-from&limit=100&depth=0',
  )
}

export function getCertifications(ids?: number[]) {
  if (ids?.length) {
    return apiFetch<PaginatedResponse<Certification>>(
      `/api/certifications?where[id][in]=${ids.join(',')}&limit=100&depth=0`,
    )
  }
  return apiFetch<PaginatedResponse<Certification>>(
    '/api/certifications?sort=-issued&limit=100&depth=0',
  )
}
