import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'
import emdash, { local } from 'emdash/astro'
import { sqlite } from 'emdash/db'
import { d1, r2 } from '@emdash-cms/cloudflare'
import { bentoEmail } from './src/plugins/bento-email.ts'

// Use D1/R2 in production builds; local SQLite + filesystem for `astro dev`.
const useCloudflareBindings =
  process.env.EMDASH_CLOUDFLARE === '1' || process.argv.includes('build')

export default defineConfig({
  site: 'https://johnathan.org',
  output: 'server',
  adapter: cloudflare({
    prerenderEnvironment: 'node',
  }),
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    react(),
    emdash({
      database: useCloudflareBindings
        ? d1({ binding: 'DB' })
        : sqlite({ url: 'file:./data.db' }),
      storage: useCloudflareBindings
        ? r2({
            binding: 'MEDIA',
            publicUrl: process.env.PUBLIC_MEDIA_URL,
          })
        : local({
            directory: './uploads',
            baseUrl: '/_emdash/api/media/file',
          }),
      plugins: [
        // `from` must be a Bento Author (Emails → Authors). No no-reply addresses.
        bentoEmail({ from: 'johnathan@johnathan.org' }),
      ],
    }),
  ],
})
