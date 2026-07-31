#!/usr/bin/env node
/**
 * Post-migration: import legacy Markdown posts from src/content/posts into EmDash.
 *
 * Usage:
 *   EMDASH_URL=http://localhost:4321 \
 *   EMDASH_TOKEN=<api-token> \
 *   node scripts/import-md-posts/import.mjs
 *
 * Idempotent by slug. Prefer running after Payload→EmDash migration is signed off.
 *
 * Conversion: EmDash markdownToPortableText (native blocks). htmlBlock only for
 * iframes/scripts/tables and similar embed islands.
 *
 * Re-import over existing posts (native PT rewrite):
 *   ON_CONFLICT=prefer-md EMDASH_URL=... EMDASH_TOKEN=... pnpm run migrate:md
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { legacyMarkdownToPortableText } from './md-to-portable-text.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const POSTS_DIR = path.join(ROOT, 'src/content/posts')

const EMDASH = (process.env.EMDASH_URL || 'http://localhost:4321').replace(/\/$/, '')
const TOKEN = process.env.EMDASH_TOKEN || ''
const DRY = process.env.DRY_RUN === '1'
const ON_CONFLICT = process.env.ON_CONFLICT || 'skip' // skip | prefer-md | prefer-cms

if (!TOKEN && !DRY) {
  console.error('Set EMDASH_TOKEN (or DRY_RUN=1)')
  process.exit(1)
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return { data: {}, body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return { data: {}, body: raw }
  const fm = raw.slice(3, end).trim()
  const body = raw.slice(end + 4).replace(/^\n/, '')
  const data = {}
  for (const line of fm.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (!m) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (val === 'true') val = true
    else if (val === 'false') val = false
    else if (val === 'null') val = null
    data[m[1]] = val
  }
  return { data, body }
}

function normalizeDate(val) {
  if (!val) return new Date(0)
  if (val instanceof Date) return val
  const normalized = String(val).replace(/(\d{2}):(\d{3}Z)$/, '$1.$2')
  const d = new Date(normalized)
  return isNaN(d.getTime()) ? new Date(0) : d
}

function slugFromFilename(filename) {
  const base = filename.replace(/\.md$/, '')
  return base.replace(/^\d{4}-\d{2}-\d{2}-/, '')
}

async function emdash(method, pathName, body) {
  if (DRY) {
    console.log(`[dry] ${method} ${pathName}`)
    return { data: { id: 'dry' } }
  }
  const res = await fetch(`${EMDASH}/_emdash/api${pathName}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${res.status} ${method} ${pathName}: ${JSON.stringify(json)}`)
  return json
}

async function findBySlug(slug) {
  try {
    const res = await emdash('GET', `/content/posts/${encodeURIComponent(slug)}`)
    // EmDash returns { data: { item, _rev } }
    const item = res.data?.item ?? res.data ?? res
    if (!item?.id) return null
    return { ...item, _rev: res.data?._rev ?? item._rev }
  } catch {
    return null
  }
}

async function ensureCategory(slug) {
  if (!slug) return
  try {
    await emdash('POST', '/taxonomies/category/terms', {
      slug,
      label: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    })
  } catch {
    // exists
  }
}

/**
 * Create/update as draft, then publish via the dedicated endpoint.
 * EmDash create/update only accept status "draft" (or omit); "published"
 * must go through POST /content/:collection/:id/publish.
 */
async function upsertPost(slug, data, { publish = true, publishedAt, existing } = {}) {
  let id = existing?.id
  let rev = existing?._rev

  if (id) {
    await emdash('PUT', `/content/posts/${id}`, {
      data,
      ...(rev ? { _rev: rev } : {}),
    })
  } else {
    try {
      const created = await emdash('POST', '/content/posts', {
        slug,
        data,
        ...(publish && publishedAt ? { publishedAt } : {}),
      })
      id = created.data?.item?.id || created.data?.id || created.id
    } catch (err) {
      // Race / nested response miss: slug exists — fetch and update
      if (!String(err.message).includes('SLUG_CONFLICT')) throw err
      const found = await findBySlug(slug)
      if (!found?.id) throw err
      id = found.id
      rev = found._rev
      await emdash('PUT', `/content/posts/${id}`, {
        data,
        ...(rev ? { _rev: rev } : {}),
      })
    }
  }

  if (publish && id) {
    await emdash(
      'POST',
      `/content/posts/${encodeURIComponent(id)}/publish`,
      publishedAt ? { publishedAt } : {},
    )
  }

  return id
}

async function main() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))
  console.log(`Found ${files.length} markdown posts in ${POSTS_DIR}`)
  console.log(`EmDash: ${EMDASH}  conflict=${ON_CONFLICT}${DRY ? '  DRY' : ''}`)

  let created = 0
  let updated = 0
  let skipped = 0

  for (const file of files) {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8')
    const { data, body } = parseFrontmatter(raw)
    const slug = data.slug || slugFromFilename(file)
    const title = data.title || slug
    const date = normalizeDate(data.date)
    const excerpt = data.excerpt || data.description || ''
    const draft = Boolean(data.draft)
    const category = data.category || null
    const publishedAt =
      !draft && date.getTime() > 0 ? date.toISOString() : null

    const existing = await findBySlug(slug)
    if (existing?.id && ON_CONFLICT === 'skip') {
      console.log(`skip ${slug} (exists)`)
      skipped++
      continue
    }
    if (existing?.id && ON_CONFLICT === 'prefer-cms') {
      console.log(`skip ${slug} (prefer existing CMS)`)
      skipped++
      continue
    }

    await ensureCategory(category)
    const pt = legacyMarkdownToPortableText(body)

    // Image fields require `{ id: mediaId }` (or omit). A legacy URL / null
    // fails validation — leave featured images for a follow-up media import.
    const payload = {
      title,
      excerpt,
      body: pt,
      show_table_of_contents: false,
    }
    if (data.feature_image) {
      console.warn(`  note: skipping feature_image for ${slug} (needs media upload): ${data.feature_image}`)
    }

    await upsertPost(slug, payload, {
      publish: !draft,
      publishedAt,
      existing,
    })
    if (existing?.id) {
      updated++
      console.log(`updated ${slug}`)
    } else {
      created++
      console.log(`created ${slug}`)
    }

    if (category && !DRY) {
      try {
        await emdash('POST', `/content/posts/${encodeURIComponent(slug)}/terms`, {
          taxonomy: 'category',
          terms: [category],
        })
      } catch {
        // ignore
      }
    }
  }

  console.log(`\nDone. created=${created} updated=${updated} skipped=${skipped}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
