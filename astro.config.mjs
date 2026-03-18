import { defineConfig } from 'astro/config'
import node from '@astrojs/node'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://johnathan.org',
  output: 'static',
  adapter: node({
    mode: 'standalone',
  }),
  markdown: {
    remarkPlugins: [],
    rehypePlugins: [],
    gfm: true,
    smartypants: true,
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
