/**
 * Resend request behaviour: retries, rate limits, quotas and attachments.
 *
 * All of it is invisible until it fails in production: a retry without an
 * idempotency key double-sends, a 429 counted as a failure drops a batch, a
 * quota error retried hammers the API, a refused file kills the broadcast.
 * fetch is stubbed, so nothing leaves the machine.
 */
import './helpers/env'

import { test, describe, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'

import { db, resetDb } from './helpers/db'
import { checkAttachments, cleanAttachmentName, MAX_ATTACHMENT_TOTAL_BYTES } from '@/lib/email-limits'
import { recordUsage, remainingToday, usedToday, dailyLimit } from '@/lib/email-quota'

// lib/email reads the key when it is first imported, so it is imported after this.
process.env.RESEND_API_KEY = 're_test_key'
type EmailModule = typeof import('@/lib/email')
let email: EmailModule

type Call = { body: Record<string, unknown>; idempotencyKey: string | null }
let calls: Call[] = []
let responses: Array<() => Response> = []
const realFetch = globalThis.fetch

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

before(async () => {
  email = await import('@/lib/email')
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    calls.push({ body: JSON.parse(String(init?.body)), idempotencyKey: headers.get('idempotency-key') })
    const next = responses.shift()
    if (!next) throw new Error('test made an unexpected Resend request')
    return next()
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = realFetch
})

beforeEach(async () => {
  calls = []
  responses = []
  await resetDb()
})

const ok = (headers: Record<string, string> = {}) => json(200, { id: 'email_1' }, headers)

describe('retries', () => {
  test('a 429 rate limit is retried after retry-after, with the same idempotency key', async () => {
    responses = [json(429, { name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 }, { 'retry-after': '1' }), ok()]
    const started = Date.now()
    await email.sendEmail('a@example.com', 'Hi', '<p>Hi</p>')
    assert.equal(calls.length, 2)
    assert.ok(calls[0].idempotencyKey, 'every request carries an idempotency key')
    assert.equal(calls[1].idempotencyKey, calls[0].idempotencyKey, 'a retry must reuse the key, or Resend may send twice')
    assert.ok(Date.now() - started >= 950, 'waited for retry-after')
  })

  test('a network failure is retried, again with the same key', async () => {
    responses = [() => { throw new TypeError('fetch failed') }, ok()]
    await email.sendEmail('a@example.com', 'Hi', '<p>Hi</p>')
    assert.equal(calls.length, 2)
    assert.equal(calls[1].idempotencyKey, calls[0].idempotencyKey)
  })

  test('a quota error is not retried', async () => {
    responses = [json(429, { name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota.', statusCode: 429 })]
    await assert.rejects(email.sendEmail('a@example.com', 'Hi', '<p>Hi</p>'), (error: unknown) => {
      assert.ok(error instanceof email.EmailSendError)
      assert.equal(error.quotaExhausted, true)
      return true
    })
    assert.equal(calls.length, 1)
  })

  test('a validation error is not retried', async () => {
    responses = [json(422, { name: 'validation_error', message: 'Invalid `to` field.', statusCode: 422 })]
    await assert.rejects(email.sendEmail('nope', 'Hi', '<p>Hi</p>'))
    assert.equal(calls.length, 1)
  })

  test('retry delays honour retry-after but never exceed the cap', () => {
    assert.ok(email.retryDelayMs({ 'retry-after': '2' }, 1) >= 2000)
    assert.ok(email.retryDelayMs({ 'retry-after': '3600' }, 1) <= 15_000)
    assert.ok(email.retryDelayMs(null, 3) >= 4000)
  })
})

describe('BCC broadcasts', () => {
  const addresses = (n: number) => Array.from({ length: n }, (_, i) => `m${i}@example.com`)

  test('every request stays within 50 recipients and keeps members out of To', async () => {
    responses = [ok(), ok(), ok()]
    const list = addresses(120)
    const result = await email.sendBccEmail(list, 'News', '<p>News</p>')
    assert.equal(result.succeeded, 120)
    for (const { body } of calls) {
      const to = ([] as unknown[]).concat(body.to).map(String)
      const bcc = body.bcc as string[]
      assert.ok(to.length + bcc.length <= 50)
      assert.ok(!to.some((t) => list.includes(t)), 'no member address in the visible To')
    }
    assert.equal(new Set(calls.map((c) => c.idempotencyKey)).size, calls.length, 'each batch is its own email')
  })

  test('stops at the first quota error instead of trying every remaining batch', async () => {
    responses = [ok(), json(429, { name: 'daily_quota_exceeded', message: 'quota', statusCode: 429 })]
    const result = await email.sendBccEmail(addresses(150), 'News', '<p>News</p>')
    assert.equal(calls.length, 2)
    assert.equal(result.succeeded, 49)
    assert.equal(result.failed, 101)
    assert.equal(result.quotaExhausted, true)
  })

  test('attachments are sent base64-encoded with their filenames', async () => {
    responses = [ok()]
    await email.sendBccEmail(['a@example.com'], 'Flyer', '<p>See attached</p>', {
      attachments: [{ filename: 'flyer.pdf', content: Buffer.from('%PDF-1.4 test'), contentType: 'application/pdf' }],
    })
    const [attachment] = calls[0].body.attachments as Array<Record<string, unknown>>
    assert.equal(attachment.filename, 'flyer.pdf')
    assert.equal(attachment.content_type, 'application/pdf')
    assert.equal(Buffer.from(String(attachment.content), 'base64').toString(), '%PDF-1.4 test')
  })
})

describe('daily quota tracking', () => {
  test('Resend’s reported usage wins over the local estimate', async () => {
    await recordUsage({ 'x-resend-daily-quota': '40' }, 5)
    assert.equal(await usedToday(), 40)
    assert.equal(await remainingToday(), 60)
  })

  test('without a header, sends are added up', async () => {
    await recordUsage(null, 10)
    await recordUsage({}, 5)
    assert.equal(await usedToday(), 15)
  })

  test('a new UTC day starts from zero', async () => {
    await recordUsage({ 'x-resend-daily-quota': '90' }, 1, new Date('2026-10-03T23:00:00Z'))
    assert.equal(await usedToday(new Date('2026-10-03T23:30:00Z')), 90)
    assert.equal(await usedToday(new Date('2026-10-04T00:10:00Z')), 0)
  })

  test('a successful send records Resend’s reported usage', async () => {
    responses = [ok({ 'x-resend-daily-quota': '33' })]
    await email.sendEmail('a@example.com', 'Hi', '<p>Hi</p>')
    assert.equal(await usedToday(), 33)
    assert.ok(await db.settings.findUnique({ where: { key: 'resendDailyUsage' } }))
  })

  test('RESEND_DAILY_LIMIT=0 means no daily limit', () => {
    assert.equal(dailyLimit(), 100)
    process.env.RESEND_DAILY_LIMIT = '0'
    try {
      assert.equal(dailyLimit(), null)
    } finally {
      delete process.env.RESEND_DAILY_LIMIT
    }
  })
})

describe('attachment rules', () => {
  const file = (name: string, size = 1000) => ({ name, size })

  test('photos and PDFs are accepted', () => {
    assert.equal(checkAttachments([file('flyer.pdf'), file('photo.JPG'), file('notes.docx')]), null)
  })

  test('types Resend refuses are stopped before sending', () => {
    assert.match(checkAttachments([file('setup.exe')]) ?? '', /block/)
    assert.match(checkAttachments([file('script.JS')]) ?? '', /block/)
  })

  test('the total size is capped so no inbox bounces the email', () => {
    assert.equal(checkAttachments([file('a.pdf', MAX_ATTACHMENT_TOTAL_BYTES)]), null)
    assert.ok(checkAttachments([file('a.pdf', MAX_ATTACHMENT_TOTAL_BYTES), file('b.pdf', 1)]))
    // Encoded, the cap still fits under the 10 MB that older Exchange servers accept.
    assert.ok((MAX_ATTACHMENT_TOTAL_BYTES * 4) / 3 < 10 * 1000 * 1000)
  })

  test('empty files and too many files are refused', () => {
    assert.ok(checkAttachments([file('a.pdf', 0)]))
    assert.ok(checkAttachments(Array.from({ length: 11 }, (_, i) => file(`${i}.pdf`))))
  })

  test('filenames lose path parts and header-breaking characters', () => {
    assert.equal(cleanAttachmentName('C:\\Users\\me\\flyer.pdf'), 'flyer.pdf')
    assert.equal(cleanAttachmentName('bad"\r\nname.pdf'), 'badname.pdf')
    assert.equal(cleanAttachmentName(''), 'attachment')
  })
})

describe('sender name', () => {
  test('a display name cannot break out of the From header', () => {
    const from = email.fromWithName('Jane "x" <evil@example.com>\r\nBcc: all')
    assert.ok(!/[\r\n]/.test(from))
    assert.equal(from.match(/</g)?.length, 1, 'only the real address is in angle brackets')
    assert.ok(from.endsWith(`<${email.FROM_ADDRESS}>`))
  })

  test('no name falls back to the configured sender', () => {
    assert.equal(email.fromWithName(''), email.FROM_EMAIL)
  })
})
