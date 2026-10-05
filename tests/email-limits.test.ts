/**
 * Broadcast attachment rules.
 *
 * A file Gmail refuses fails the whole broadcast, and an email too big for a
 * recipient's server bounces silently. Both are caught here, before sending.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { checkAttachments, cleanAttachmentName, MAX_ATTACHMENT_TOTAL_BYTES } from '@/lib/email-limits'

describe('attachment rules', () => {
  const file = (name: string, size = 1000) => ({ name, size })

  test('photos and PDFs are accepted', () => {
    assert.equal(checkAttachments([file('flyer.pdf'), file('photo.JPG'), file('notes.docx')]), null)
  })

  test('types Gmail refuses are stopped before sending', () => {
    assert.match(checkAttachments([file('setup.exe')]) ?? '', /block/)
    assert.match(checkAttachments([file('script.JS')]) ?? '', /block/)
    assert.match(checkAttachments([file('disk.iso')]) ?? '', /block/)
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
