/**
 * Link Previews for Broadcast Email
 *
 * Email clients strip iframes and scripts, so an "embedded" link in an email
 * is a card: the page's image, title and description, all linking to it —
 * what Gmail and Slack show for a pasted link. This module reads those from
 * the page's Open Graph / Twitter meta tags.
 *
 * The server fetches a URL an admin typed, so it must not become a way to
 * reach the Droplet's own services or the cloud metadata endpoint (SSRF).
 * Every DNS answer is checked against private and reserved ranges inside the
 * socket's own lookup, so a hostname cannot pass the check and then resolve
 * somewhere else on connect (DNS rebinding); redirects are followed by hand
 * and each hop gets the same treatment. Only ports 80 and 443 are allowed,
 * and the response is cut off at a size and time limit.
 */
import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import net from 'node:net'
import zlib from 'node:zlib'
import type { Readable } from 'node:stream'

export type LinkPreview = {
  url: string
  title: string
  description: string
  /** Absolute http(s) image URL, or null when the page names none. */
  image: string | null
  siteName: string
}

const TIMEOUT_MS = 6000
// Generous because some heads are huge: YouTube's meta tags sit ~720 KB in,
// behind inline scripts. Reading stops at </head> anyway.
const MAX_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 5
// A plain browser identity: big news CDNs (CBC's, for one) silently stall any
// user agent with a bot token in it until the request times out. This fetch
// is one page an admin asked for, which is what a browser would do anyway.
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const blocked = new net.BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(network, prefix, 'ipv4')
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(network, prefix, 'ipv6')

/** True for an address on the public internet (IPv4-mapped IPv6 is judged by its IPv4 part). */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address)
  if (family === 0) return false
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

class PreviewError extends Error {}

/** dns.lookup, refusing any answer that isn't a public address. */
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0)
    const list = addresses as unknown as dns.LookupAddress[]
    if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
      return callback(new PreviewError(`${hostname} is not a public address`), '', 0)
    }
    if (options.all) {
      (callback as unknown as (err: null, addresses: dns.LookupAddress[]) => void)(null, list)
    } else {
      callback(null, list[0].address, list[0].family)
    }
  })
}

function checkTarget(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new PreviewError('Only web pages can be previewed.')
  if (url.port && url.port !== '80' && url.port !== '443') throw new PreviewError('Only standard web ports are allowed.')
  if (url.username || url.password) throw new PreviewError('Addresses with a login in them are not allowed.')
  // IP literals skip the lookup function, so check them here.
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host) && !isPublicAddress(host)) throw new PreviewError('That address is not on the public internet.')
}

type Fetched = { status: number; headers: http.IncomingHttpHeaders; body: Buffer }

function requestOnce(url: URL, signal: AbortSignal): Promise<Fetched> {
  checkTarget(url)
  const client = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = client.get(url, {
      lookup: safeLookup,
      signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en-CA,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    }, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400) {
        res.resume()
        return resolve({ status, headers: res.headers, body: Buffer.alloc(0) })
      }
      let stream: Readable = res
      const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase()
      if (encoding === 'gzip' || encoding === 'x-gzip') stream = res.pipe(zlib.createGunzip())
      else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate())
      else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress())

      const chunks: Buffer[] = []
      let size = 0
      let tail = ''
      const finish = () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) })
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        size += chunk.length
        // The meta tags are all read once </head> arrives (checked across
        // chunk boundaries); the page body is never needed.
        const text = tail + chunk.toString('latin1')
        tail = text.slice(-16)
        if (size >= MAX_BYTES || /<\/head\s*>/i.test(text)) {
          finish()
          req.destroy()
        }
      })
      stream.on('end', finish)
      stream.on('error', (error) => (size > 0 ? finish() : reject(error)))
    })
    req.on('error', reject)
  })
}

async function fetchPage(start: URL): Promise<{ url: URL } & Fetched> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await requestOnce(url, signal)
    const location = res.headers.location
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url)
      continue
    }
    return { url, ...res }
  }
  throw new PreviewError('That page redirects too many times.')
}

function decodeBody(body: Buffer, contentType: string): string {
  const declared = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]
    ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(body.subarray(0, 4096).toString('latin1'))?.[1]
  try {
    return new TextDecoder(declared || 'utf-8').decode(body)
  } catch {
    return new TextDecoder('utf-8').decode(body)
  }
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase()
    if (lower in NAMED_ENTITIES) return NAMED_ENTITIES[lower]
    const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : lower.startsWith('#') ? parseInt(lower.slice(1), 10) : NaN
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
  })
}

function clean(text: string | undefined, max: number): string {
  const flat = decodeEntities(text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

function absoluteHttpUrl(value: string | undefined, base: string): string | null {
  if (!value) return null
  try {
    const url = new URL(decodeEntities(value.trim()), base)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

function siteNameOf(pageUrl: string): string {
  return new URL(pageUrl).hostname.replace(/^www\./, '')
}

/** Reads the preview fields out of a page's HTML. Pure, so it can be tested without the network. */
export function parseLinkPreview(html: string, pageUrl: string): LinkPreview {
  // Meta tags belong in <head>; don't scan a whole long page for them.
  const head = html.slice(0, MAX_BYTES).split(/<\/head\s*>/i)[0]
  const meta: Record<string, string> = {}
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {}
    for (const m of tag.matchAll(/([^\s=/<>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
    }
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase()
    if (key && attrs.content !== undefined && !(key in meta)) meta[key] = attrs.content
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]

  return {
    url: pageUrl,
    title: clean(meta['og:title'] || meta['twitter:title'] || titleTag, 120) || siteNameOf(pageUrl),
    description: clean(meta['og:description'] || meta['twitter:description'] || meta.description, 200),
    image: absoluteHttpUrl(
      meta['og:image:secure_url'] || meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src'],
      pageUrl,
    ),
    siteName: clean(meta['og:site_name'], 60) || siteNameOf(pageUrl),
  }
}

/**
 * Fetches `pageUrl` (already normalised to http/https) and builds its preview.
 * @throws When the page can't be reached or isn't a public web page.
 */
export async function fetchLinkPreview(pageUrl: string): Promise<LinkPreview> {
  const res = await fetchPage(new URL(pageUrl))
  if (res.status >= 400) throw new PreviewError(`The page answered with an error (${res.status}).`)

  const contentType = String(res.headers['content-type'] ?? '').toLowerCase()
  // A link straight to a picture: the picture is the preview.
  if (contentType.startsWith('image/')) {
    return { url: pageUrl, title: fileNameOf(res.url), description: '', image: res.url.href, siteName: siteNameOf(pageUrl) }
  }
  // A PDF or other file: there's no metadata to read, but a card still beats a bare link.
  if (contentType && !contentType.includes('html')) {
    return { url: pageUrl, title: fileNameOf(res.url), description: '', image: null, siteName: siteNameOf(pageUrl) }
  }
  return parseLinkPreview(decodeBody(res.body, contentType), pageUrl)
}

function fileNameOf(url: URL): string {
  const last = url.pathname.split('/').pop() || ''
  let name = last
  try {
    name = decodeURIComponent(last)
  } catch {
    // Malformed escapes: show the name as it appears in the address.
  }
  return clean(name, 120) || siteNameOf(url.href)
}

export function isPreviewError(error: unknown): error is Error {
  return error instanceof PreviewError
}
