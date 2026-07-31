/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly RAINDROP_API_TEST_TOKEN?: string
  readonly PUBLIC_MEDIA_URL?: string
  readonly PUBLIC_IMAGE_HOST?: string
  readonly EMDASH_CLOUDFLARE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
