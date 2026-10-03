/**
 * Email delivery shape: who can see whom.
 *
 * The agenda email goes to every member and subscriber at once. A recipient
 * in the visible To header exposes their address to everyone; a mass email
 * past Resend's recipient limit fails outright. Neither shows in the UI.
 */
// lib/email reaches lib/db (quota bookkeeping), so the scratch database must be set up first.
import './helpers/env'

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { buildRawGmailMessage } from '@/lib/google-api'
import { bccBatches, bccQuotaCost } from '@/lib/email'

describe('agenda email headers', () => {
  test('no recipient appears in the visible To header', () => {
    const raw = buildRawGmailMessage(['first@example.com', 'second@example.com'], 'Subject', '<p>Body</p>')
    const headers = raw.split('\r\n\r\n')[0].split('\r\n')
    const to = headers.find((h) => h.startsWith('To:'))
    assert.ok(to, 'a To header is still required')
    assert.ok(!to.includes('@'), `To header exposes an address: ${to}`)
    assert.ok(headers.some((h) => h.startsWith('Bcc:') && h.includes('first@example.com')))
  })
})

describe('bccBatches', () => {
  const addresses = (n: number) => Array.from({ length: n }, (_, i) => `m${i}@example.com`)

  test('keeps every batch within Resend’s 50-recipient limit, counting the nominal To', () => {
    const batches = bccBatches(addresses(120))
    assert.ok(batches.every((b) => b.length + 1 <= 50))
  })

  test('sends to everyone exactly once', () => {
    const list = addresses(120)
    assert.deepEqual(bccBatches(list).flat(), list)
  })

  test('a small list is one batch', () => {
    assert.equal(bccBatches(addresses(10)).length, 1)
  })

  test('quota cost counts every recipient plus each batch’s visible To', () => {
    assert.equal(bccQuotaCost(10), 11)
    assert.equal(bccQuotaCost(49), 50)
    assert.equal(bccQuotaCost(50), 52)
    assert.equal(bccQuotaCost(120), 120 + bccBatches(addresses(120)).length)
  })
})
