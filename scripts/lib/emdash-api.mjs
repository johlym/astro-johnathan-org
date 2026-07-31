/**
 * Shared EmDash Admin API helpers for migration scripts.
 */

export function createEmDashClient({
  baseUrl = process.env.EMDASH_URL || 'http://localhost:4321',
  token = process.env.EMDASH_TOKEN || '',
  dry = process.env.DRY_RUN === '1',
} = {}) {
  const EMDASH = String(baseUrl).replace(/\/$/, '')

  async function emdash(method, pathName, body) {
    if (dry) {
      console.log(`[dry] ${method} ${pathName}`, body ? JSON.stringify(body) : '')
      return { data: { id: 'dry' } }
    }
    const res = await fetch(`${EMDASH}/_emdash/api${pathName}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`${res.status} ${method} ${pathName}: ${JSON.stringify(json)}`)
    return json
  }

  function flattenTerms(terms, out = []) {
    for (const term of terms ?? []) {
      out.push(term)
      if (term.children?.length) flattenTerms(term.children, out)
    }
    return out
  }

  /** slug → term id for `category` taxonomy */
  async function getCategoryIdBySlug() {
    const res = await emdash('GET', '/taxonomies/category/terms')
    const terms = flattenTerms(res.data?.terms ?? [])
    const map = new Map()
    for (const term of terms) {
      if (term.slug && term.id) map.set(term.slug, term.id)
    }
    return map
  }

  /**
   * Ensure a category term exists; returns its id.
   * EmDash create body: { slug, label, parentId?, description? }
   */
  async function ensureCategoryId(slug, idBySlug) {
    if (!slug) return null
    if (idBySlug.has(slug)) return idBySlug.get(slug)

    const label = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    try {
      const created = await emdash('POST', '/taxonomies/category/terms', { slug, label })
      const id = created.data?.id ?? created.data?.term?.id ?? created.id
      if (id) {
        idBySlug.set(slug, id)
        return id
      }
    } catch {
      // Likely already exists — refresh map
    }

    const refreshed = await getCategoryIdBySlug()
    for (const [s, id] of refreshed) idBySlug.set(s, id)
    return idBySlug.get(slug) ?? null
  }

  /**
   * Assign category term(s) to a post.
   * Correct API (docs): POST /content/:collection/:id/terms/:taxonomy
   * Body: { termIds: string[] }
   * `:id` may be slug or canonical id.
   */
  async function assignPostCategories(postIdOrSlug, categorySlugs, idBySlug) {
    const slugs = (Array.isArray(categorySlugs) ? categorySlugs : [categorySlugs]).filter(Boolean)
    if (!slugs.length) return

    const termIds = []
    for (const slug of slugs) {
      const id = await ensureCategoryId(slug, idBySlug)
      if (!id) throw new Error(`Could not resolve category term id for slug "${slug}"`)
      termIds.push(id)
    }

    await emdash(
      'POST',
      `/content/posts/${encodeURIComponent(postIdOrSlug)}/terms/category`,
      { termIds },
    )
  }

  return {
    EMDASH,
    dry,
    emdash,
    getCategoryIdBySlug,
    ensureCategoryId,
    assignPostCategories,
    flattenTerms,
  }
}
