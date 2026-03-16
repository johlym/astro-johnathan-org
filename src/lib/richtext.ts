export type LexicalNode = {
  type: string
  children?: LexicalNode[]
  text?: string
  format?: number | string
  tag?: string
  listType?: string
  url?: string
  fields?: Record<string, unknown>
  direction?: string | null
  indent?: number
  version?: number
  value?: Record<string, unknown>
  [key: string]: unknown
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatText(text: string, format: number): string {
  let result = escapeHtml(text)
  if (format & 1) result = `<strong>${result}</strong>`
  if (format & 2) result = `<em>${result}</em>`
  if (format & 4) result = `<s>${result}</s>`
  if (format & 8) result = `<u>${result}</u>`
  if (format & 16) result = `<code>${result}</code>`
  if (format & 32) result = `<sub>${result}</sub>`
  if (format & 64) result = `<sup>${result}</sup>`
  return result
}

function renderChildren(children: LexicalNode[]): string {
  return children.map((child) => renderNode(child)).join('')
}

function renderNode(node: LexicalNode): string {
  switch (node.type) {
    case 'root':
      return node.children ? renderChildren(node.children) : ''

    case 'paragraph':
      return `<p>${node.children ? renderChildren(node.children) : ''}</p>\n`

    case 'heading': {
      const tag = node.tag || 'h2'
      const content = node.children ? renderChildren(node.children) : ''
      const id = content
        .replace(/<[^>]*>/g, '')
        .toLowerCase()
        .replace(/[^\w]+/g, '-')
        .replace(/(^-|-$)/g, '')
      return `<${tag} id="${id}">${content}</${tag}>\n`
    }

    case 'text': {
      const text = node.text || ''
      const format = typeof node.format === 'number' ? node.format : 0
      return formatText(text, format)
    }

    case 'link':
    case 'autolink': {
      const url = (node.fields?.url as string) || (node.url as string) || '#'
      const rel = url.startsWith('/') ? '' : ' rel="noopener noreferrer" target="_blank"'
      return `<a href="${escapeHtml(url)}"${rel}>${node.children ? renderChildren(node.children) : ''}</a>`
    }

    case 'list': {
      const tag = node.listType === 'number' ? 'ol' : 'ul'
      return `<${tag}>\n${node.children ? renderChildren(node.children) : ''}</${tag}>\n`
    }

    case 'listitem':
      return `<li>${node.children ? renderChildren(node.children) : ''}</li>\n`

    case 'quote':
      return `<blockquote>${node.children ? renderChildren(node.children) : ''}</blockquote>\n`

    case 'horizontalrule':
      return '<hr />\n'

    case 'linebreak':
      return '<br />'

    case 'tab':
      return '&emsp;'

    case 'upload': {
      const url = (node.value?.url as string) || ''
      const alt = escapeHtml((node.value?.alt as string) || '')
      return `<img src="${escapeHtml(url)}" alt="${alt}" loading="lazy" />\n`
    }

    case 'block': {
      const blockType = node.fields?.blockType
      if (blockType === 'code') {
        const code = escapeHtml((node.fields?.code as string) || '')
        const lang = (node.fields?.language as string) || ''
        return `<pre><code class="language-${escapeHtml(lang)}">${code}</code></pre>\n`
      }
      return ''
    }

    default:
      if (node.children) {
        return renderChildren(node.children)
      }
      return ''
  }
}

export function lexicalToHtml(richText: { root: LexicalNode } | null | undefined): string {
  if (!richText?.root) return ''
  return renderNode(richText.root)
}

export function extractHeadings(
  richText: { root: LexicalNode } | null | undefined,
): { tag: string; text: string; id: string }[] {
  const headings: { tag: string; text: string; id: string }[] = []
  if (!richText?.root?.children) return headings

  function walk(nodes: LexicalNode[]) {
    for (const node of nodes) {
      if (node.type === 'heading' && node.children) {
        const text = node.children.map((c) => c.text || '').join('')
        const id = text
          .toLowerCase()
          .replace(/[^\w]+/g, '-')
          .replace(/(^-|-$)/g, '')
        headings.push({ tag: node.tag || 'h2', text, id })
      }
      if (node.children) walk(node.children)
    }
  }

  walk(richText.root.children)
  return headings
}

export type Segment =
  | { kind: 'html'; nodes: LexicalNode[] }
  | { kind: 'block'; blockType: string; fields: Record<string, unknown> }

export function splitIntoSegments(children: LexicalNode[]): Segment[] {
  const segments: Segment[] = []
  let htmlBuffer: LexicalNode[] = []

  for (const node of children) {
    if (node.type === 'block' && node.fields?.blockType !== 'code') {
      if (htmlBuffer.length) {
        segments.push({ kind: 'html', nodes: htmlBuffer })
        htmlBuffer = []
      }
      segments.push({
        kind: 'block',
        blockType: (node.fields?.blockType as string) || '',
        fields: (node.fields as Record<string, unknown>) || {},
      })
    } else {
      htmlBuffer.push(node)
    }
  }

  if (htmlBuffer.length) {
    segments.push({ kind: 'html', nodes: htmlBuffer })
  }

  return segments
}

export function renderHtmlSegment(nodes: LexicalNode[]): string {
  return lexicalToHtml({ root: { type: 'root', children: nodes } })
}
