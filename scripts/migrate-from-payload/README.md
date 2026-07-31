# Payload → EmDash migration

```bash
# Dry run (no writes)
DRY_RUN=1 PAYLOAD_API_URL=https://cms.johnathan.org \
  EMDASH_URL=http://localhost:4321 \
  pnpm run migrate:payload

# Live import
PAYLOAD_API_URL=https://cms.johnathan.org \
  EMDASH_URL=http://localhost:4321 \
  EMDASH_TOKEN=<token-from-emdash-admin> \
  pnpm run migrate:payload
```

See also `scripts/import-md-posts/` for the post-cutover Markdown import.
