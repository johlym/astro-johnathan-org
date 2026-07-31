#!/usr/bin/env node
/**
 * Backfill category term assignments from legacy Markdown frontmatter.
 *
 * The original MD/Payload importers called the wrong terms endpoint and
 * silently failed, so posts exist but content_taxonomies rows do not.
 *
 * Usage:
 *   git checkout HEAD -- src/content/posts   # if removed
 *   EMDASH_URL=https://johnathan.org \
 *     EMDASH_TOKEN=<token> \
 *     pnpm run migrate:md:categories
 *
 *   DRY_RUN=1 pnpm run migrate:md:categories
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmDashClient } from '../lib/emdash-api.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const POSTS_DIR = path.join(ROOT, 'src/content/posts')

const TOKEN = process.env.EMDASH_TOKEN || ''
const DRY = process.env.DRY_RUN === '1'

if (!TOKEN && !DRY) {
  console.error('Set EMDASH_TOKEN (or DRY_RUN=1)')
  process.exit(1)
}

if (!fs.existsSync(POSTS_DIR)) {
  console.error(
    `Missing ${POSTS_DIR}\nRestore with: git checkout HEAD -- src/content/posts`,
  )
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
    data[m[1]] = val
  }
  return { data, body }
}

function slugFromFilename(filename) {
  return filename.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')
}

const { EMDASH, assignPostCategories, getCategoryIdBySlug } = createEmDashClient({
  dry: DRY,
  token: TOKEN,
})

async function main() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))
  console.log(`Found ${files.length} markdown posts`)
  console.log(`EmDash: ${EMDASH}${DRY ? '  DRY' : ''}`)

  const idBySlug = await getCategoryIdBySlug()
  let assigned = 0
  let skipped = 0
  let failed = 0

  for (const file of files) {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8')
    const { data } = parseFrontmatter(raw)
    const slug = data.slug || slugFromFilename(file)
    const category = data.category || null

    if (!category) {
      skipped++
      continue
    }

    try {
      await assignPostCategories(slug, category, idBySlug)
      assigned++
      console.log(`✓ ${slug} → ${category}`)
    } catch (err) {
      failed++
      console.warn(`✗ ${slug}: ${err.message}`)
    }
  }

  console.log(`\nDone. assigned=${assigned} skipped(no category)=${skipped} failed=${failed}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
