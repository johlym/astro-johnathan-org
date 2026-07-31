#!/usr/bin/env node
/**
 * Migrate content from a live Payload CMS into EmDash.
 *
 * Usage:
 *   PAYLOAD_API_URL=https://cms.johnathan.org \
 *   EMDASH_URL=http://localhost:4321 \
 *   EMDASH_TOKEN=<api-token> \
 *   node scripts/migrate-from-payload/migrate.mjs
 *
 * Prerequisites:
 *   - EmDash running with schema from .emdash/seed.json applied
 *   - Admin API token with content:write, media:write, taxonomies:manage, menus:manage, settings:manage
 *
 * The script is idempotent: existing EmDash entries matching a slug are updated.
 */

import { lexicalToPortableText } from './lexical-to-portable-text.mjs'

const PAYLOAD = (process.env.PAYLOAD_API_URL || 'https://cms.johnathan.org').replace(/\/$/, '')
const EMDASH = (process.env.EMDASH_URL || 'http://localhost:4321').replace(/\/$/, '')
const TOKEN = process.env.EMDASH_TOKEN || ''
const DRY = process.env.DRY_RUN === '1'

if (!TOKEN && !DRY) {
  console.error('Set EMDASH_TOKEN (or DRY_RUN=1)')
  process.exit(1)
}

async function payloadFetch(path) {
  const res = await fetch(`${PAYLOAD}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Payload ${res.status}: ${path}`)
  return res.json()
}

async function payloadAll(collection, query = '') {
  const docs = []
  let page = 1
  while (true) {
    const data = await payloadFetch(
      `/api/${collection}?limit=100&page=${page}&depth=2${query}`,
    )
    docs.push(...(data.docs || []))
    if (!data.hasNextPage) break
    page++
  }
  return docs
}

async function emdash(method, path, body) {
  if (DRY) {
    console.log(`[dry] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 120) : '')
    return { success: true, data: { id: `dry-${Math.random().toString(36).slice(2)}` } }
  }
  const res = await fetch(`${EMDASH}/_emdash/api${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`EmDash ${res.status} ${method} ${path}: ${JSON.stringify(json)}`)
  }
  return json
}

async function findBySlug(collection, slug) {
  try {
    const res = await emdash('GET', `/content/${collection}/${encodeURIComponent(slug)}`)
    // EmDash returns { data: { item, _rev } }
    const item = res.data?.item ?? res.data ?? res
    if (!item?.id) return null
    return { ...item, _rev: res.data?._rev ?? item._rev }
  } catch {
    return null
  }
}

/**
 * Create/update as draft, then publish via the dedicated endpoint.
 * EmDash create/update only accept status "draft" (or omit); "published"
 * must go through POST /content/:collection/:id/publish.
 */
async function upsertContent(collection, slug, data, { publish = true, publishedAt } = {}) {
  const existing = await findBySlug(collection, slug)
  let id
  if (existing?.id) {
    const rev = existing._rev
    await emdash('PUT', `/content/${collection}/${existing.id}`, {
      data,
      ...(rev ? { _rev: rev } : {}),
    })
    id = existing.id
    console.log(`  updated ${collection}/${slug}`)
  } else {
    const created = await emdash('POST', `/content/${collection}`, {
      slug,
      data,
      ...(publish && publishedAt ? { publishedAt } : {}),
    })
    id = created.data?.id || created.data?.item?.id || created.id
    console.log(`  created ${collection}/${slug} → ${id}`)
  }

  if (publish) {
    await emdash(
      'POST',
      `/content/${collection}/${encodeURIComponent(id)}/publish`,
      publishedAt ? { publishedAt } : {},
    )
    console.log(`  published ${collection}/${slug}`)
  }

  return id
}

function payloadPublishAt(doc) {
  if (doc._status === 'draft') return null
  const raw = doc.publishedAt || doc.updatedAt || null
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

async function ensureCategory(slug, label) {
  try {
    await emdash('POST', `/taxonomies/category/terms`, {
      slug,
      label: label || slug,
    })
  } catch {
    // may already exist
  }
}

async function main() {
  console.log(`Payload: ${PAYLOAD}`)
  console.log(`EmDash:  ${EMDASH}`)
  console.log(DRY ? 'DRY RUN' : 'LIVE')

  // Settings
  try {
    const settings = await payloadFetch('/api/globals/site-settings')
    await emdash('PUT', '/settings', {
      title: settings.siteTitle,
      tagline: settings.siteDescription || '',
    })
    console.log('✓ site settings')
  } catch (err) {
    console.warn('settings:', err.message)
  }

  // Categories
  const categories = await payloadAll('categories')
  const categorySlugById = {}
  for (const cat of categories) {
    categorySlugById[String(cat.id)] = cat.slug
    await ensureCategory(cat.slug, cat.title)
    console.log(`✓ category ${cat.slug}`)
  }

  // Work experience
  const experiences = await payloadAll('work-experience')
  const workIdMap = {}
  for (const exp of experiences) {
    const slug = `we-${exp.id}`
    const id = await upsertContent('work_experience', slug, {
      where: exp.where,
      title: exp.title,
      from: exp.from,
      to: exp.to || null,
      current: Boolean(exp.current),
      details: exp.details || null,
    })
    workIdMap[String(exp.id)] = id
  }
  console.log(`✓ work_experience (${experiences.length})`)

  // Certifications
  const certs = await payloadAll('certifications')
  const certIdMap = {}
  for (const cert of certs) {
    const slug = `cert-${cert.id}`
    const id = await upsertContent('certifications', slug, {
      name: cert.name,
      issuing_body: cert.issuingBody,
      issued: cert.issued || null,
    })
    certIdMap[String(cert.id)] = id
  }
  console.log(`✓ certifications (${certs.length})`)

  const idMaps = { workExperience: workIdMap, certifications: certIdMap }

  // Pages
  const pages = await payloadAll('pages')
  for (const page of pages) {
    const body = lexicalToPortableText(page.body, idMaps)
    const publishedAt = payloadPublishAt(page)
    await upsertContent(
      'pages',
      page.slug,
      {
        title: page.title,
        excerpt: page.excerpt || '',
        body,
      },
      { publish: page._status !== 'draft', publishedAt },
    )
  }
  console.log(`✓ pages (${pages.length})`)

  // Posts
  const posts = await payloadAll('posts')
  for (const post of posts) {
    const body = lexicalToPortableText(post.body, idMaps)
    // Image fields need `{ id: mediaId }` — remote Payload URLs are not valid.
    const data = {
      title: post.title,
      excerpt: post.excerpt || '',
      body,
      show_table_of_contents: Boolean(post.showTableOfContents),
    }

    const publishedAt = payloadPublishAt(post)
    await upsertContent('posts', post.slug, data, {
      publish: post._status !== 'draft',
      publishedAt,
    })

    // Assign category if present
    const catId =
      post.category && typeof post.category === 'object'
        ? post.category.id
        : post.category
    const catSlug = catId ? categorySlugById[String(catId)] : null
    if (catSlug && !DRY) {
      try {
        await emdash('POST', `/content/posts/${encodeURIComponent(post.slug)}/terms`, {
          taxonomy: 'category',
          terms: [catSlug],
        })
      } catch (err) {
        console.warn(`  category assign ${post.slug}:`, err.message)
      }
    }
  }
  console.log(`✓ posts (${posts.length})`)

  // Navigation
  try {
    const nav = await payloadFetch('/api/globals/navigation?depth=1')
    const items = (nav.links || []).map((link, i) => {
      const page = typeof link.page === 'object' ? link.page : null
      const href = page?.slug ? `/${page.slug}` : '/'
      return {
        type: 'custom',
        label: link.label || page?.title || 'Link',
        customUrl: href,
        sortOrder: i,
      }
    })
    // Ensure primary menu exists then replace items — best-effort
    await emdash('POST', '/menus', { name: 'primary', label: 'Primary Navigation' }).catch(
      () => {},
    )
    for (const item of items) {
      await emdash('POST', '/menus/primary/items', item).catch((err) =>
        console.warn('menu item:', err.message),
      )
    }
    console.log(`✓ navigation (${items.length} items)`)
  } catch (err) {
    console.warn('navigation:', err.message)
  }

  console.log('\nDone. Media files still need manual upload or a follow-up media copy step.')
  console.log('Featured images currently store remote Payload/R2 URLs.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
