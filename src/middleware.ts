import { defineMiddleware } from 'astro:middleware'
import { ensureProjectsSchema } from './lib/ensure-projects-schema'

/**
 * Seed files do not evolve an existing EmDash database. Create the projects
 * collection on the first admin/API request after deploy so it shows up under
 * Content without a manual Content Types step.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (context.url.pathname.startsWith('/_emdash')) {
    const db = context.locals.emdash?.db
    if (db) {
      try {
        const created = await ensureProjectsSchema(db)
        if (created) {
          context.locals.emdash.invalidateUrlPatternCache()
        }
      } catch (error) {
        console.error('[projects-schema] Failed to ensure projects collection:', error)
      }
    }
  }

  return next()
})
