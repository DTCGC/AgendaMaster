/**
 * Machine-to-machine request authentication: the inbound-email webhook's Svix
 * signature and the cron jobs' bearer secret.
 *
 * Both endpoints make the server send email or rewrite sheets, and both fail
 * silently when the check is wrong — open to anyone, or closed to Resend.
 */
import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

import { verifySvixSignature, hasCronSecret } from '@/lib/request-auth'

// A secret in Resend's format: "whsec_" + base64 key bytes.
const SECRET = 'whsec_' + Buffer.from('test-signing-key-0123456789').toString('base64')
const NOW = 1_790_000_000

function signedHeaders(body: string, { id = 'msg_1', timestamp = NOW, secret = SECRET } = {}) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  return new Headers({
    'svix-id': id,
    'svix-timestamp': String(timestamp),
    'svix-signature': `v1,${signature}`,
  })
}

const BODY = JSON.stringify({ type: 'email.received', data: { from: 'a@example.com' } })

describe('verifySvixSignature', () => {
  test('accepts a correctly signed delivery', () => {
    assert.equal(verifySvixSignature(BODY, signedHeaders(BODY), SECRET, NOW), true)
  })

  test('accepts when any one of several signatures matches (key rotation)', () => {
    const headers = signedHeaders(BODY)
    headers.set('svix-signature', `v1,bm90LXRoZS1yaWdodC1vbmU= ${headers.get('svix-signature')}`)
    assert.equal(verifySvixSignature(BODY, headers, SECRET, NOW), true)
  })

  test('rejects a tampered body', () => {
    const headers = signedHeaders(BODY)
    assert.equal(verifySvixSignature(BODY.replace('a@example.com', 'evil@example.com'), headers, SECRET, NOW), false)
  })

  test('rejects a signature made with another secret', () => {
    const other = 'whsec_' + Buffer.from('some-other-key').toString('base64')
    assert.equal(verifySvixSignature(BODY, signedHeaders(BODY, { secret: other }), SECRET, NOW), false)
  })

  test('rejects a stale (replayed) delivery', () => {
    const headers = signedHeaders(BODY, { timestamp: NOW - 10 * 60 })
    assert.equal(verifySvixSignature(BODY, headers, SECRET, NOW), false)
  })

  test('rejects a delivery with no signature headers', () => {
    assert.equal(verifySvixSignature(BODY, new Headers(), SECRET, NOW), false)
  })
})

describe('hasCronSecret', () => {
  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  const request = (authorization?: string) =>
    new Request('http://localhost/api/cron/archive', {
      method: 'POST',
      headers: authorization ? { Authorization: authorization } : {},
    })

  test('accepts the configured bearer secret', () => {
    process.env.CRON_SECRET = 's3cret'
    assert.equal(hasCronSecret(request('Bearer s3cret')), true)
  })

  test('rejects a wrong or missing secret', () => {
    process.env.CRON_SECRET = 's3cret'
    assert.equal(hasCronSecret(request('Bearer nope')), false)
    assert.equal(hasCronSecret(request()), false)
  })

  test('rejects everything when CRON_SECRET is unset', () => {
    assert.equal(hasCronSecret(request('Bearer ')), false)
    assert.equal(hasCronSecret(request('Bearer undefined')), false)
  })
})
