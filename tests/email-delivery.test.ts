/**
 * Email message shape: who can see whom, and what survives the trip.
 *
 * Agenda emails and broadcasts go to every member and subscriber at once. A
 * recipient in the visible To header exposes their address to everyone; a
 * malformed MIME part arrives as a broken attachment or a blank email.
 * Neither shows in the UI.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { buildRawGmailMessage as build, type GmailMessageOptions } from '@/lib/google-api'
import { agendaEmailDue, needsFullWizard } from '@/lib/agenda-email'

const headersOf = (raw: string) => raw.split('\r\n\r\n')[0].split('\r\n')

/** A Bcc email from the club account, unless the test says otherwise. */
const buildRawGmailMessage = (recipients: string[], subject: string, html: string, options?: GmailMessageOptions) =>
  build(recipients, subject, html, { visibleTo: 'club@example.com', ...options })

describe('recipient privacy', () => {
  test('no recipient appears in the visible To header, only the sender', () => {
    const headers = headersOf(buildRawGmailMessage(['first@example.com', 'second@example.com'], 'Subject', '<p>Body</p>'))
    assert.ok(headers.includes('To: club@example.com'))
    assert.ok(headers.some((h) => h.startsWith('Bcc:') && h.includes('first@example.com')))
  })

  test('the visible To is a real address, never the undisclosed-recipients group', () => {
    // Gmail failed the first agenda email sent with `To: undisclosed-recipients:;`.
    assert.throws(() => build(['a@example.com'], 'Subject', '<p>Body</p>'), /visibleTo/)
    assert.throws(() => build(['a@example.com'], 'Subject', '<p>Body</p>', { visibleTo: ' \r\n' }), /visibleTo/)
    const headers = headersOf(buildRawGmailMessage(['a@example.com'], 'Subject', '<p>Body</p>'))
    assert.ok(!headers.some((h) => h.includes('undisclosed-recipients')))
  })

  test('an email to one person can name them in To instead', () => {
    const headers = headersOf(buildRawGmailMessage(['jane@example.com'], 'Welcome', '<p>Hi</p>', { bcc: false }))
    assert.ok(headers.includes('To: jane@example.com'))
    assert.ok(!headers.some((h) => h.startsWith('Bcc:')))
  })
})

describe('headers', () => {
  test('From, Reply-To and recipients cannot inject extra headers', () => {
    const raw = buildRawGmailMessage(['a@example.com\r\nBcc: all@example.com'], 'Hi', '<p>Hi</p>', {
      from: '"Club" <club@example.com>\r\nX-Evil: 1',
      visibleTo: 'club@example.com\r\nX-Evil: 2',
      replyTo: 'jane@example.com\nBcc: all@example.com',
    })
    const headers = headersOf(raw)
    assert.equal(headers.filter((h) => h.startsWith('Bcc:')).length, 1)
    assert.ok(!headers.some((h) => h.startsWith('X-Evil')))
  })

  test('the subject survives non-ASCII characters', () => {
    const headers = headersOf(buildRawGmailMessage(['a@example.com'], 'Réunion — 10月', '<p>Hi</p>'))
    const encoded = headers.find((h) => h.startsWith('Subject: '))!.match(/=\?utf-8\?B\?(.+)\?=/)![1]
    assert.equal(Buffer.from(encoded, 'base64').toString(), 'Réunion — 10月')
  })
})

describe('body and attachments', () => {
  const pdf = Buffer.from('%PDF-1.4 test file')

  function attachmentMessage(filename = 'flyer.pdf') {
    return buildRawGmailMessage(['a@example.com'], 'Flyer', '<p>See attached</p>', {
      attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
    })
  }

  /** The parts of a multipart message, split on its declared boundary. */
  function partsOf(raw: string) {
    const boundary = raw.match(/boundary="([^"]+)"/)![1]
    const sections = raw.split(`--${boundary}`)
    assert.equal(sections.at(-1)!.trim(), '--', 'the message ends with the closing boundary')
    return { boundary, parts: sections.slice(1, -1) }
  }

  const decode = (part: string) => Buffer.from(part.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64')

  test('without attachments the body is a single base64 HTML part', () => {
    const html = `<p>${'x'.repeat(5000)}</p>`
    const raw = buildRawGmailMessage(['a@example.com'], 'Hi', html)
    assert.ok(!raw.includes('multipart'))
    assert.ok(raw.split('\r\n').every((line) => line.length <= 998), 'no line over the SMTP limit')
    assert.equal(decode(raw).toString(), html)
  })

  test('attachments arrive as their own base64 parts, byte for byte', () => {
    const raw = attachmentMessage()
    const { parts } = partsOf(raw)
    assert.equal(parts.length, 2)
    assert.equal(decode(parts[0]).toString(), '<p>See attached</p>')
    assert.match(parts[1], /Content-Type: application\/pdf/)
    assert.match(parts[1], /Content-Disposition: attachment; filename="flyer.pdf"/)
    assert.deepEqual(decode(parts[1]), pdf)
  })

  test('the boundary never appears inside a part', () => {
    const big = Buffer.alloc(200_000, 0xff)
    const raw = buildRawGmailMessage(['a@example.com'], 'Hi', '<p>--=_AgendaMaster_</p>', {
      attachments: [{ filename: 'noise.bin', content: big }],
    })
    const { parts } = partsOf(raw)
    assert.equal(parts.length, 2, 'only the real boundaries split the message')
    assert.equal(decode(parts[0]).toString(), '<p>--=_AgendaMaster_</p>')
    assert.deepEqual(decode(parts[1]), big)
  })

  test('a filename cannot inject headers, and non-ASCII names are encoded', () => {
    const injected = partsOf(attachmentMessage('a"\r\nX-Evil: 1.pdf')).parts[1]
    assert.ok(!injected.split('\r\n').some((line) => line.startsWith('X-Evil')))

    const accented = partsOf(attachmentMessage('réunion.pdf')).parts[1]
    assert.match(accented, /filename\*=UTF-8''r%C3%A9union\.pdf/)
  })

  test('an implausible content type falls back to plain bytes', () => {
    const raw = buildRawGmailMessage(['a@example.com'], 'Hi', '<p>Hi</p>', {
      attachments: [{ filename: 'x.pdf', content: pdf, contentType: 'text/html\r\nX-Evil: 1' }],
    })
    assert.match(partsOf(raw).parts[1], /Content-Type: application\/octet-stream/)
  })
})

describe('the agenda email goes out once per meeting', () => {
  const fresh = { googleSheetId: null, agendaEmailPending: false }
  const failedSend = { googleSheetId: 'sheet', agendaEmailPending: true }
  const sent = { googleSheetId: 'sheet', agendaEmailPending: false }

  test('the first Step 4 run sends it', () => {
    assert.equal(agendaEmailDue('create', fresh), true)
  })

  test('a Step 4 rerun after a failed send sends it', () => {
    assert.equal(agendaEmailDue('create', failedSend), true)
  })

  test('once sent, no later run sends it again', () => {
    assert.equal(agendaEmailDue('create', sent), false)
    assert.equal(agendaEmailDue('update', sent), false)
  })

  test('roster-only update mode never sends it', () => {
    assert.equal(agendaEmailDue('update', failedSend), false)
    assert.equal(agendaEmailDue('update', fresh), false)
  })

  test('the dashboard opens the full wizard only while the email is still owed', () => {
    assert.equal(needsFullWizard(fresh), true)
    assert.equal(needsFullWizard(failedSend), true)
    assert.equal(needsFullWizard(sent), false)
  })
})
