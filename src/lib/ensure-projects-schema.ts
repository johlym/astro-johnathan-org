/**
 * EmDash applies `.emdash/seed.json` only when the database is empty.
 * Existing D1 databases keep their schema across deploys, so a new collection
 * in the seed file never appears in Admin → Content until it is created here.
 *
 * Idempotent: no-ops once `projects` exists. Safe to call on every admin request.
 */

import {
  SchemaError,
  SchemaRegistry,
  type CollectionSupport,
  type CreateFieldInput,
} from 'emdash'

const PROJECTS_SLUG = 'projects'

const PROJECTS_COLLECTION = {
  slug: PROJECTS_SLUG,
  label: 'Projects',
  labelSingular: 'Project',
  description: 'Past work and featured projects',
  icon: 'layout-grid',
  supports: ['drafts', 'revisions', 'preview', 'search', 'seo'] as CollectionSupport[],
  urlPattern: '/projects/{slug}',
}

const PROJECTS_FIELDS: CreateFieldInput[] = [
  { slug: 'title', label: 'Project Name', type: 'string', required: true },
  {
    slug: 'images',
    label: 'Images',
    type: 'repeater',
    validation: {
      subFields: [{ slug: 'image', type: 'image', label: 'Screenshot', required: true }],
      maxItems: 12,
    },
  },
  { slug: 'created', label: 'Created date', type: 'datetime', required: true },
  { slug: 'active', label: 'Active', type: 'boolean', defaultValue: true },
  { slug: 'url', label: 'URL', type: 'url' },
  { slug: 'stack', label: 'Stack', type: 'string' },
  { slug: 'description', label: 'Description', type: 'portableText', required: true },
]

let ensured = false

export async function ensureProjectsSchema(db: ConstructorParameters<typeof SchemaRegistry>[0]) {
  if (ensured) return false

  const registry = new SchemaRegistry(db)
  const existing = await registry.getCollection(PROJECTS_SLUG)
  if (existing) {
    ensured = true
    return false
  }

  try {
    await registry.createSeedCollection(PROJECTS_COLLECTION, PROJECTS_FIELDS)
    console.log('[projects-schema] Created projects collection in the live database')
    ensured = true
    return true
  } catch (error) {
    if (error instanceof SchemaError && error.code === 'COLLECTION_EXISTS') {
      ensured = true
      return false
    }
    throw error
  }
}
