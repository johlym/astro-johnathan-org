/**
 * Convert Payload Lexical JSON to Portable Text blocks.
 *
 * Handles:
 *   - paragraphs, headings, lists, quotes, links, code
 *   - Payload CodeBlock → PT code
 *   - workExperienceList / certificationsList → custom PT types
 *   - unknown blocks → htmlBlock fallback
 */

function textChildren(nodes = []) {
  const children = []
  const markDefs = []

  for (const node of nodes) {
    if (!node) continue
    if (node.type === 'text' || node.type === 'linebreak') {
      const text = node.type === 'linebreak' ? '\n' : String(node.text ?? '')
      const marks = []
      if (node.format) {
        // Lexical format bitmask: bold=1, italic=2, strikethrough=4, underline=8, code=16
        const f = Number(node.format) || 0
        if (f & 1) marks.push('strong')
        if (f & 2) marks.push('em')
        if (f & 4) marks.push('strike-through')
        if (f & 8) marks.push('underline')
        if (f & 16) marks.push('code')
      }
      children.push({ _type: 'span', _key: key(), text, marks })
      continue
    }
    if (node.type === 'link') {
      const href = node.fields?.url || node.url || '#'
      const markKey = key()
      markDefs.push({ _type: 'link', _key: markKey, href })
      for (const child of textChildren(node.children).children) {
        children.push({
          ...child,
          marks: [...(child.marks || []), markKey],
        })
      }
      continue
    }
    // Nested unknowns as plain text
    if (node.children) {
      const nested = textChildren(node.children)
      children.push(...nested.children)
      markDefs.push(...nested.markDefs)
    }
  }

  return { children, markDefs }
}

function key() {
  return Math.random().toString(36).slice(2, 10)
}

function headingStyle(tag) {
  const map = { h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6' }
  return map[tag] || 'h2'
}

function convertNode(node, idMaps = {}) {
  if (!node) return []

  switch (node.type) {
    case 'paragraph': {
      const { children, markDefs } = textChildren(node.children)
      if (!children.length) return []
      return [
        {
          _type: 'block',
          _key: key(),
          style: 'normal',
          markDefs,
          children,
        },
      ]
    }
    case 'heading': {
      const { children, markDefs } = textChildren(node.children)
      return [
        {
          _type: 'block',
          _key: key(),
          style: headingStyle(node.tag || `h${node.level || 2}`),
          markDefs,
          children,
        },
      ]
    }
    case 'quote': {
      const { children, markDefs } = textChildren(node.children)
      return [
        {
          _type: 'block',
          _key: key(),
          style: 'blockquote',
          markDefs,
          children,
        },
      ]
    }
    case 'list': {
      const listItem = node.listType === 'number' ? 'number' : 'bullet'
      const blocks = []
      for (const item of node.children || []) {
        const { children, markDefs } = textChildren(item.children)
        blocks.push({
          _type: 'block',
          _key: key(),
          style: 'normal',
          listItem,
          level: 1,
          markDefs,
          children,
        })
      }
      return blocks
    }
    case 'code':
    case 'codeblock': {
      return [
        {
          _type: 'code',
          _key: key(),
          language: node.language || node.fields?.language || 'text',
          code: node.code || node.fields?.code || extractPlain(node.children) || '',
        },
      ]
    }
    case 'block': {
      const blockType = node.fields?.blockType || node.blockType
      if (blockType === 'code' || blockType === 'Code') {
        return [
          {
            _type: 'code',
            _key: key(),
            language: node.fields?.language || 'text',
            code: node.fields?.code || '',
          },
        ]
      }
      if (blockType === 'workExperienceList') {
        const selected = (node.fields?.selectedExperiences || [])
          .map((id) => idMaps.workExperience?.[String(id)] || String(id))
          .filter(Boolean)
        return [
          {
            _type: 'workExperienceList',
            _key: key(),
            showAll: Boolean(node.fields?.showAll ?? !selected.length),
            selectedExperiences: selected,
          },
        ]
      }
      if (blockType === 'certificationsList') {
        const selected = (node.fields?.selectedCertifications || [])
          .map((id) => idMaps.certifications?.[String(id)] || String(id))
          .filter(Boolean)
        return [
          {
            _type: 'certificationsList',
            _key: key(),
            showAll: Boolean(node.fields?.showAll ?? !selected.length),
            selectedCertifications: selected,
          },
        ]
      }
      return [
        {
          _type: 'htmlBlock',
          _key: key(),
          html: `<!-- unconverted lexical block: ${blockType || 'unknown'} -->`,
        },
      ]
    }
    case 'upload': {
      const url = node.value?.url || node.fields?.url
      if (!url) return []
      return [
        {
          _type: 'image',
          _key: key(),
          url,
          alt: node.value?.alt || node.fields?.alt || '',
        },
      ]
    }
    case 'horizontalrule':
    case 'horizontalRule':
      return [{ _type: 'block', _key: key(), style: 'normal', markDefs: [], children: [{ _type: 'span', text: '---', marks: [] }] }]
    default: {
      if (node.children?.length) {
        return node.children.flatMap((c) => convertNode(c, idMaps))
      }
      return []
    }
  }
}

function extractPlain(nodes = []) {
  return nodes
    .map((n) => {
      if (n.type === 'text') return n.text || ''
      if (n.children) return extractPlain(n.children)
      return ''
    })
    .join('')
}

/**
 * @param {{ root?: { children?: unknown[] } } | null | undefined} lexical
 * @param {{ workExperience?: Record<string, string>, certifications?: Record<string, string> }} idMaps
 */
export function lexicalToPortableText(lexical, idMaps = {}) {
  const children = lexical?.root?.children || []
  return children.flatMap((node) => convertNode(node, idMaps))
}
