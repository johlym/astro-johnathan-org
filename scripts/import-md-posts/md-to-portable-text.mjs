/**
 * Convert legacy Markdown (+ light HTML) to EmDash Portable Text.
 *
 * Uses EmDash's official markdownToPortableText for native blocks.
 * Only irreducible embed islands (iframe/script/complex HTML) become htmlBlock.
 */

import { markdownToPortableText } from 'emdash/client'

function key() {
  return Math.random().toString(36).slice(2, 10)
}

function htmlBlock(html) {
  return { _type: 'htmlBlock', _key: key(), html: html.trim() }
}

/**
 * Normalize common HTML in legacy posts to Markdown so EmDash can parse it.
 */
function htmlToMarkdownHints(md) {
  let s = md

  // Images: <img src="..." alt="..."> / <img src='...' alt='...'>
  s = s.replace(
    /<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*?\balt=["']([^"']*)["'][^>]*\/?>/gi,
    (_m, src, alt) => `![${alt}](${src})`,
  )
  s = s.replace(
    /<img\b[^>]*?\balt=["']([^"']*)["'][^>]*?\bsrc=["']([^"']+)["'][^>]*\/?>/gi,
    (_m, alt, src) => `![${alt}](${src})`,
  )
  s = s.replace(/<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*\/?>/gi, (_m, src) => `![](${src})`)

  // Links
  s = s.replace(/<a\b[^>]*?\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => {
    const plain = String(text)
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    return `[${plain || href}](${href})`
  })

  // Inline marks
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**')
  s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '_$2_')
  s = s.replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')
  s = s.replace(/<br\s*\/?>/gi, '  \n')

  // Block wrappers → markdown structure
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, text) => {
    const plain = String(text)
      .replace(/<[^>]+>/g, '')
      .trim()
    return `\n${'#'.repeat(Number(level))} ${plain}\n`
  })
  s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n')
  s = s.replace(/<\/?(div|span)[^>]*>/gi, '')

  // Simple blockquotes (not twitter embeds)
  s = s.replace(
    /<blockquote(?![^>]*class=["'][^"']*twitter)[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_m, inner) => {
      const plain = String(inner)
        .replace(/<[^>]+>/g, '')
        .trim()
      return plain
        .split(/\n/)
        .map((line) => `> ${line}`)
        .join('\n')
    },
  )

  return s
}

/** True HTML islands we should not force through the MD parser. */
const HTML_ISLAND =
  /(<script[\s\S]*?<\/script>)|(<iframe[\s\S]*?<\/iframe>)|(<blockquote[^>]*class=["'][^"']*twitter[\s\S]*?<\/blockquote>\s*<script[\s\S]*?<\/script>)|(<table[\s\S]*?<\/table>)|(<pre[\s\S]*?<\/pre>)|(<style[\s\S]*?<\/style>)|(<html[\s\S]*?<\/html>)/gi

/**
 * Split markdown into alternating text / html-island segments.
 */
function splitHtmlIslands(md) {
  const parts = []
  let last = 0
  const re = new RegExp(HTML_ISLAND.source, 'gi')
  let match
  while ((match = re.exec(md)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'md', value: md.slice(last, match.index) })
    }
    parts.push({ type: 'html', value: match[0] })
    last = match.index + match[0].length
  }
  if (last < md.length) {
    parts.push({ type: 'md', value: md.slice(last) })
  }
  return parts.length ? parts : [{ type: 'md', value: md }]
}

/**
 * Convert a legacy post body to Portable Text blocks.
 */
export function legacyMarkdownToPortableText(rawBody) {
  const hinted = htmlToMarkdownHints(rawBody)
  const parts = splitHtmlIslands(hinted)
  const blocks = []

  for (const part of parts) {
    if (part.type === 'html') {
      blocks.push(htmlBlock(part.value))
      continue
    }

    const md = part.value.trim()
    if (!md) continue

    // Leftover tags that aren't islands (e.g. <sup>) — keep as small htmlBlocks
    // only when a segment is *mostly* HTML; otherwise strip tags to text.
    if (/<[a-zA-Z]/.test(md) && (md.match(/<[a-zA-Z]/g) || []).length >= 3) {
      // Mixed leftovers: peel remaining tags into islands line-by-line
      const lines = md.split(/\n/)
      let buf = []
      const flushMd = () => {
        const chunk = buf.join('\n').trim()
        buf = []
        if (!chunk) return
        const cleaned = chunk.replace(/<\/?sup>/gi, '')
        blocks.push(...markdownToPortableText(cleaned))
      }
      for (const line of lines) {
        if (/^\s*<[a-zA-Z][^>]*>/.test(line) && /<\/[a-zA-Z]+>\s*$/.test(line)) {
          flushMd()
          blocks.push(htmlBlock(line))
        } else {
          buf.push(line)
        }
      }
      flushMd()
      continue
    }

    const cleaned = md.replace(/<\/?sup>/gi, '')
    blocks.push(...markdownToPortableText(cleaned))
  }

  return blocks.length ? blocks : markdownToPortableText(rawBody)
}
