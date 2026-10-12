/**
 * Google permissions unticked at sign-in.
 *
 * Google's consent screen lets a member untick Drive or Gmail and still sign
 * in. Unchecked, the first they hear of it is a bare "Request had
 * insufficient authentication scopes." at Step 4 — or, if only Gmail was
 * unticked, a sheet that gets created and an email that never goes out.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { resolveGoogleAuthPath } from '@/lib/google-auth-path'
import { isInsufficientScopeError, missingGoogleScopes, missingScopesMessage } from '@/lib/google-scopes'

const DRIVE = 'https://www.googleapis.com/auth/drive.file'
const GMAIL = 'https://www.googleapis.com/auth/gmail.send'
const BASE = 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'

describe('missing Google scopes', () => {
  test('a full grant is missing nothing, in any order', () => {
    assert.deepEqual(missingGoogleScopes(`${GMAIL} ${BASE} ${DRIVE}`), [])
  })

  test('names exactly the unticked permissions', () => {
    assert.deepEqual(missingGoogleScopes(BASE), [DRIVE, GMAIL])
    assert.deepEqual(missingGoogleScopes(`${BASE} ${DRIVE}`), [GMAIL])
  })

  test('an unknown grant (older session) is not treated as missing', () => {
    assert.equal(missingGoogleScopes(undefined), null)
  })

  test('the message says what to do', () => {
    assert.match(missingScopesMessage([GMAIL]), /send the agenda email/)
    assert.doesNotMatch(missingScopesMessage([GMAIL]), /agenda sheet/)
    assert.match(missingScopesMessage(null), /sign back in with Google/)
  })
})

describe('the pipeline refuses a short grant before touching Google', () => {
  test('a Google member who unticked a box', () => {
    assert.deepEqual(
      resolveGoogleAuthPath({ role: 'MEMBER', authMethod: 'google', accessToken: 'tok', grantedScopes: `${BASE} ${DRIVE}` }),
      { kind: 'missing-scopes', missing: [GMAIL] }
    )
  })

  test('a full grant, or an older session with no record, uses the token', () => {
    assert.deepEqual(
      resolveGoogleAuthPath({ role: 'MEMBER', authMethod: 'google', accessToken: 'tok', grantedScopes: `${BASE} ${DRIVE} ${GMAIL}` }),
      { kind: 'user-token', accessToken: 'tok' }
    )
    assert.deepEqual(
      resolveGoogleAuthPath({ role: 'MEMBER', authMethod: 'google', accessToken: 'tok' }),
      { kind: 'user-token', accessToken: 'tok' }
    )
  })
})

describe("recognizing Google's insufficient-scope 403", () => {
  test('by message, as googleapis throws it', () => {
    const error = Object.assign(new Error('Request had insufficient authentication scopes.'), { code: 403 })
    assert.equal(isInsufficientScopeError(error), true)
  })

  test('by reason, if the message ever changes', () => {
    const error = Object.assign(new Error('Forbidden'), {
      response: { data: { error: { details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] } } },
    })
    assert.equal(isInsufficientScopeError(error), true)
  })

  test('not every 403', () => {
    assert.equal(isInsufficientScopeError(Object.assign(new Error('The caller does not have permission'), { code: 403 })), false)
  })
})
