/**
 * Web address normalisation for links typed into the email editor.
 * Client-safe: used by the editor's link dialogs and by the preview action.
 */

/**
 * Turns what someone typed ("example.com/page", "https://…") into a full
 * http(s) URL, or null when it isn't one. A missing scheme means https.
 */
export function normalizeWebUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed || /\s/.test(trimmed)) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  // "https://hello" parses, but nobody means a dotless host in an email.
  if (!url.hostname.includes('.') && !url.hostname.startsWith('[')) return null
  return url.href
}

/** Like normalizeWebUrl, but also accepts mailto: addresses (for plain links, not previews). */
export function normalizeLinkHref(input: string): string | null {
  const trimmed = input.trim()
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(trimmed)) return trimmed
  if (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(trimmed)) return `mailto:${trimmed}`
  return normalizeWebUrl(trimmed)
}
