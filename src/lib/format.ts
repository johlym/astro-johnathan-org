/** Approximate reading time from body JSON or plain text. */
export function readingMinutes(body: unknown, wordsPerMinute = 200): number {
  const rawText = JSON.stringify(body ?? '').replace(/[#*`[\]()>_~|!{}",:]+/g, ' ')
  const words = rawText.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length
  return Math.max(1, Math.round(words / wordsPerMinute))
}

export function formatPostDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatShortDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function formatMonthYear(date: Date) {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}
