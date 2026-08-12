/**
 * Service-account key parsing — the env-var contract for admin sheet edits.
 *
 * GOOGLE_SERVICE_ACCOUNT_KEY may hold the service-account JSON verbatim OR
 * base64-encoded (the recommended form for .env files), and a mangled or
 * absent value must degrade to null — the writer grant in createAgendaSheet()
 * quietly skips itself on null, so a broken env var must never be able to
 * break the Toastmaster's sheet-creation flow.
 *
 * getServiceAccountEmail() is the thinnest window onto the parser, so these
 * tests pin the whole contract through it.
 */
import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { getServiceAccountEmail } from '@/lib/google-api'

const KEY = {
  type: 'service_account',
  client_email: 'agendamaster-sheet-editor@agendamaster-dtcgc.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
}

afterEach(() => {
  delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY
})

describe('GOOGLE_SERVICE_ACCOUNT_KEY parsing', () => {
  test('accepts raw JSON', () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify(KEY)
    assert.equal(getServiceAccountEmail(), KEY.client_email)
  })

  test('accepts base64-encoded JSON', () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = Buffer.from(JSON.stringify(KEY)).toString('base64')
    assert.equal(getServiceAccountEmail(), KEY.client_email)
  })

  test('unset variable degrades to null', () => {
    assert.equal(getServiceAccountEmail(), null)
  })

  test('unparseable garbage degrades to null, never throws', () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = 'not-json-and-not-base64-json!!'
    assert.equal(getServiceAccountEmail(), null)
  })

  test('JSON missing the required fields degrades to null', () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({ type: 'service_account' })
    assert.equal(getServiceAccountEmail(), null)
  })
})
