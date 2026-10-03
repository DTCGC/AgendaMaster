/**
 * Link preview cards: parsing, and the SSRF guard.
 *
 * The preview fetch runs on the Droplet with a URL an admin typed. If the
 * address checks are wrong, the server can be pointed at its own services or
 * the cloud metadata endpoint, and nothing in the UI would show it.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { parseLinkPreview, isPublicAddress, fetchLinkPreview } from '@/lib/link-preview'
import { normalizeWebUrl, normalizeLinkHref } from '@/lib/web-url'

describe('parseLinkPreview', () => {
  test('reads Open Graph tags, in either attribute order', () => {
    const html = `<html><head>
      <meta property="og:title" content="Spring Contest &amp; Showcase">
      <meta content="Join us on Friday." property="og:description">
      <meta property="og:image" content="/img/poster.jpg">
      <meta property="og:site_name" content="DTCGC">
    </head><body></body></html>`
    const p = parseLinkPreview(html, 'https://example.com/events/spring')
    assert.equal(p.title, 'Spring Contest & Showcase')
    assert.equal(p.description, 'Join us on Friday.')
    assert.equal(p.image, 'https://example.com/img/poster.jpg', 'relative images are made absolute')
    assert.equal(p.siteName, 'DTCGC')
  })

  test('falls back to Twitter tags, <title> and the hostname', () => {
    const p = parseLinkPreview(`<head><title> Plain  page </title><meta name="twitter:image" content="https://cdn.example.com/a.png"></head>`, 'https://www.example.org/x')
    assert.equal(p.title, 'Plain page')
    assert.equal(p.image, 'https://cdn.example.com/a.png')
    assert.equal(p.siteName, 'example.org')
  })

  test('finds tags behind a very large <head> (YouTube’s sit ~720 KB in)', () => {
    const filler = `<script>${'x'.repeat(800_000)}</script>`
    const p = parseLinkPreview(`<html><head>${filler}<meta property="og:title" content="Me at the zoo"></head>`, 'https://www.youtube.com/watch?v=x')
    assert.equal(p.title, 'Me at the zoo')
  })

  test('ignores non-web image URLs and caps long descriptions', () => {
    const p = parseLinkPreview(`<head><meta property="og:image" content="javascript:alert(1)"><meta name="description" content="${'word '.repeat(100)}"></head>`, 'https://example.com')
    assert.equal(p.image, null)
    assert.ok(p.description.length <= 200)
  })
})

describe('isPublicAddress', () => {
  test('private, loopback, link-local and metadata addresses are refused', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.3.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
      assert.equal(isPublicAddress(ip), false, ip)
    }
  })

  test('public addresses are allowed', () => {
    for (const ip of ['142.250.69.206', '1.1.1.1', '2606:4700:4700::1111']) {
      assert.equal(isPublicAddress(ip), true, ip)
    }
  })
})

describe('fetchLinkPreview refuses internal targets', () => {
  test('a server on this machine is never contacted, by IP or by name', async () => {
    let hits = 0
    const server = http.createServer((_req, res) => { hits++; res.end('<title>internal</title>') })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    try {
      // A non-standard port is refused outright; port 80 checks the address itself.
      await assert.rejects(fetchLinkPreview(`http://127.0.0.1:${port}/`))
      await assert.rejects(fetchLinkPreview('http://127.0.0.1/'))
      await assert.rejects(fetchLinkPreview('http://localhost/'))
      await assert.rejects(fetchLinkPreview('http://[::1]/'))
      await assert.rejects(fetchLinkPreview('http://169.254.169.254/latest/meta-data/'))
      assert.equal(hits, 0)
    } finally {
      server.close()
    }
  })
})

describe('typed addresses', () => {
  test('web addresses get https and must be real hosts', () => {
    assert.equal(normalizeWebUrl('example.com/page'), 'https://example.com/page')
    assert.equal(normalizeWebUrl('http://example.com'), 'http://example.com/')
    assert.equal(normalizeWebUrl('javascript:alert(1)'), null)
    assert.equal(normalizeWebUrl('ftp://example.com'), null)
    assert.equal(normalizeWebUrl('hello'), null)
    assert.equal(normalizeWebUrl('two words.com'), null)
  })

  test('links may also be email addresses', () => {
    assert.equal(normalizeLinkHref('vpe@example.com'), 'mailto:vpe@example.com')
    assert.equal(normalizeLinkHref('mailto:vpe@example.com'), 'mailto:vpe@example.com')
    assert.equal(normalizeLinkHref('example.com'), 'https://example.com/')
  })
})
