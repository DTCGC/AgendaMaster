/**
 * Machine-to-machine request authentication: the cron jobs' bearer secret.
 *
 * The cron endpoints rewrite agenda sheets, and fail silently when the check
 * is wrong: open to anyone, or closed to the Droplet's own cron.
 */
import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { hasCronSecret } from '@/lib/request-auth'

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
