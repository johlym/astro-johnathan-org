# Post-migration Markdown → EmDash import

Converts legacy Markdown (and light HTML) to **native Portable Text** via
EmDash’s `markdownToPortableText`. Only embed islands (iframe/script/twitter
embeds/tables) stay as `htmlBlock`.

```bash
# Dry run
DRY_RUN=1 EMDASH_URL=https://johnathan.org pnpm run migrate:md

# Import (skips existing slugs by default)
EMDASH_URL=https://johnathan.org \
  EMDASH_TOKEN=<token> \
  pnpm run migrate:md

# Re-import / rewrite bodies as native PT (overwrites existing)
ON_CONFLICT=prefer-md \
  EMDASH_URL=https://johnathan.org \
  EMDASH_TOKEN=<token> \
  pnpm run migrate:md
```

If `src/content/posts/` was removed, restore from git first:

```bash
git checkout HEAD -- src/content/posts
# …run migrate:md…
rm -rf src/content/posts
```

## Backfill categories only

Early imports used the wrong terms API (`POST …/terms` with `{ terms: [slug] }`
instead of `POST …/terms/category` with `{ termIds: […] }`), so posts landed
without `content_taxonomies` rows and category widget counts stayed at 0.

```bash
git checkout HEAD -- src/content/posts

EMDASH_URL=https://johnathan.org \
  EMDASH_TOKEN=<token> \
  pnpm run migrate:md:categories

rm -rf src/content/posts
```

`DRY_RUN=1` prints the intended assign calls without writing.
