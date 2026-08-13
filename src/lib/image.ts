/**
 * Cloudflare Image Resizing URL builder.
 *
 * Wraps any upstream image URL (typically a Payload/R2 public URL) with
 * a `/cdn-cgi/image/<options>/<upstream>` prefix so Cloudflare's edge
 * resizes/optimizes it on the fly. The transformer proxies the origin,
 * caches per-variant, and serves modern formats (AVIF/WebP) via
 * `format: auto`.
 *
 * Enable Image Resizing on the `johnathan.org` zone before use:
 * dash → Speed → Optimization → Image Resizing.
 *
 * Docs: https://developers.cloudflare.com/images/transform-images/
 */

export interface ImageOptions {
  /** Target width in pixels. Cloudflare will scale proportionally. */
  width?: number
  /** Target height in pixels. */
  height?: number
  /** Quality (1–100). Default 80. */
  quality?: number
  /** Output format. `auto` = negotiate AVIF/WebP/JPEG by Accept header. */
  format?: 'auto' | 'avif' | 'webp' | 'jpeg' | 'png'
  /** Resize behavior. `cover` crops to exact dims, `contain` fits inside. */
  fit?: 'cover' | 'contain' | 'scale-down' | 'crop' | 'pad'
  /** Enable in-browser blur-up placeholder (used for LQIP). */
  blur?: number
}

/**
 * Cloudflare zone that serves the /cdn-cgi/image endpoint. Defaults to
 * the site host; override for previews on workers.dev.
 */
const IMAGE_HOST = (import.meta.env.PUBLIC_IMAGE_HOST ?? 'https://johnathan.org').replace(
  /\/$/,
  '',
)

function serializeOptions(opts: ImageOptions): string {
  const parts: string[] = []
  if (opts.width) parts.push(`width=${opts.width}`)
  if (opts.height) parts.push(`height=${opts.height}`)
  parts.push(`quality=${opts.quality ?? 80}`)
  parts.push(`format=${opts.format ?? 'auto'}`)
  if (opts.fit) parts.push(`fit=${opts.fit}`)
  if (opts.blur) parts.push(`blur=${opts.blur}`)
  return parts.join(',')
}

/**
 * Build a `/cdn-cgi/image` URL for the given upstream image.
 *
 * Pass-through cases:
 *   - Empty/falsy `src` → returns empty string.
 *   - Data URIs → returned as-is (already inline).
 *   - Already-transformed URLs (contain `/cdn-cgi/image/`) → returned as-is.
 */
export function cfImage(src: string | undefined | null, opts: ImageOptions = {}): string {
  if (!src) return ''
  if (src.startsWith('data:')) return src
  if (src.includes('/cdn-cgi/image/')) return src

  const options = serializeOptions(opts)

  // Cloudflare accepts either an absolute upstream URL or a same-zone
  // relative path. A leading slash on a relative path would produce
  // `/cdn-cgi/image/<opts>//path`, so strip it.
  const source = src.startsWith('/') ? src.slice(1) : src
  return `${IMAGE_HOST}/cdn-cgi/image/${options}/${source}`
}

/**
 * Common preset for hero/featured images on posts and pages.
 */
export function heroImage(src: string | undefined | null): string {
  return cfImage(src, { width: 1600, quality: 82, format: 'auto', fit: 'cover' })
}

/**
 * Common preset for card/thumbnail images in listings.
 */
export function thumbImage(src: string | undefined | null): string {
  return cfImage(src, { width: 800, quality: 78, format: 'auto', fit: 'cover' })
}

/** /projects card thumbnail: shown at 400px, transformed at 800px for 2x. */
export function projectThumbImage(src: string | undefined | null): string {
  return cfImage(src, { width: 800, quality: 78, format: 'auto', fit: 'cover' })
}

/** /projects/[slug] screenshot: shown at 768px, transformed at 1536px for 2x. */
export function projectDetailImage(src: string | undefined | null): string {
  return cfImage(src, { width: 1536, quality: 82, format: 'auto', fit: 'cover' })
}
