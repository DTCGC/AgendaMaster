/**
 * Email/password accounts — the fallback for members without Google.
 *
 * All of this fails silently when broken: a Google member who can suddenly be
 * signed into with a password, a duplicate account under a different
 * capitalization, or an agenda written through the wrong Google credential
 * only shows up later as a security hole, a split roster, or a 403.
 */
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'

import { db, resetDb } from './helpers/db'
import { createPasswordAccount, verifyPasswordLogin } from '@/lib/password-auth'
import { resolveGoogleAuthPath } from '@/lib/google-auth-path'
import { buildRawGmailMessage } from '@/lib/google-api'
import {
  getClubAccessToken,
  getClubGoogleStatus,
  saveClubGoogleConnection,
  ClubGoogleUnavailableError,
} from '@/lib/club-google'

beforeEach(() => resetDb())

describe('registration', () => {
  test('creates an INCOMPLETE account with a hashed password and a normalized email', async () => {
    const result = await createPasswordAccount('  Sam@Example.com ', 'correct horse')
    assert.equal(result.success, true)

    const user = await db.user.findUniqueOrThrow({ where: { email: 'sam@example.com' } })
    assert.equal(user.role, 'INCOMPLETE')
    assert.equal(user.firstName, '')
    assert.ok(user.passwordHash)
    assert.notEqual(user.passwordHash, 'correct horse')
    assert.ok(await bcrypt.compare('correct horse', user.passwordHash!))
  })

  test('refuses an email that already has an account, whatever the capitalization', async () => {
    await createPasswordAccount('sam@example.com', 'correct horse')
    const again = await createPasswordAccount('SAM@example.com', 'another password')
    assert.equal(again.success, false)
    assert.equal(await db.user.count(), 1)
  })

  test('refuses to put a password on an existing Google account', async () => {
    await db.user.create({
      data: { email: 'gina@gmail.com', firstName: 'Gina', lastName: 'Test', role: 'MEMBER' }
    })
    const result = await createPasswordAccount('gina@gmail.com', 'correct horse')
    assert.equal(result.success, false)
    const gina = await db.user.findUniqueOrThrow({ where: { email: 'gina@gmail.com' } })
    assert.equal(gina.passwordHash, null)
  })

  test('rejects short passwords and malformed emails', async () => {
    assert.equal((await createPasswordAccount('sam@example.com', 'short')).success, false)
    assert.equal((await createPasswordAccount('not-an-email', 'correct horse')).success, false)
    assert.equal(await db.user.count(), 0)
  })
})

describe('password login', () => {
  test('a registered member signs in, with any capitalization of their email', async () => {
    await createPasswordAccount('sam@example.com', 'correct horse')
    const user = await verifyPasswordLogin('SAM@Example.com', 'correct horse')
    assert.ok(user)
    assert.equal(user!.role, 'INCOMPLETE')
  })

  test('a wrong password is refused', async () => {
    await createPasswordAccount('sam@example.com', 'correct horse')
    assert.equal(await verifyPasswordLogin('sam@example.com', 'wrong horse'), null)
  })

  test('the admin credential still signs in', async () => {
    await db.user.create({
      data: {
        email: 'coquitlamgavel@gmail.com', firstName: 'Admin', lastName: 'DTCGC', role: 'ADMIN',
        passwordHash: await bcrypt.hash('admin password', 4)
      }
    })
    const admin = await verifyPasswordLogin('coquitlamgavel@gmail.com', 'admin password')
    assert.equal(admin?.role, 'ADMIN')
  })

  test('a Google-only account can never be signed into with a password', async () => {
    await db.user.create({
      data: { email: 'gina@gmail.com', firstName: 'Gina', lastName: 'Test', role: 'MEMBER' }
    })
    assert.equal(await verifyPasswordLogin('gina@gmail.com', ''), null)
    assert.equal(await verifyPasswordLogin('gina@gmail.com', 'anything at all'), null)
  })
})

describe('which Google credential the agenda pipeline uses', () => {
  test('an ADMIN always uses the service account — even holding a token', () => {
    assert.deepEqual(
      resolveGoogleAuthPath({ role: 'ADMIN', authMethod: 'google', accessToken: 'club-token' }),
      { kind: 'service-account', clubCreate: false }
    )
    assert.deepEqual(
      resolveGoogleAuthPath({ role: 'ADMIN', authMethod: 'credentials' }),
      { kind: 'service-account', clubCreate: false }
    )
  })

  test('a member who signed in with a password updates via the service account and creates via the club', () => {
    assert.deepEqual(
      resolveGoogleAuthPath({ role: 'MEMBER', authMethod: 'credentials' }),
      { kind: 'service-account', clubCreate: true }
    )
  })

  test('a Google member uses their own token', () => {
    assert.deepEqual(
      resolveGoogleAuthPath({ role: 'MEMBER', authMethod: 'google', accessToken: 'tok' }),
      { kind: 'user-token', accessToken: 'tok' }
    )
  })

  test('a Google member without a token is NOT routed through the club account', () => {
    assert.deepEqual(resolveGoogleAuthPath({ role: 'MEMBER', authMethod: 'google' }), { kind: 'none' })
    // Sessions from before this feature carry no authMethod at all.
    assert.deepEqual(resolveGoogleAuthPath({ role: 'MEMBER' }), { kind: 'none' })
  })
})

describe('club Google connection', () => {
  test('is reported as not connected, and refuses a token, until connected', async () => {
    assert.deepEqual(await getClubGoogleStatus(), { connected: false, connectedAt: null })
    await assert.rejects(getClubAccessToken(), ClubGoogleUnavailableError)
  })

  test('reconnecting replaces the stored connection', async () => {
    await saveClubGoogleConnection('first-token')
    await saveClubGoogleConnection('second-token')
    const status = await getClubGoogleStatus()
    assert.equal(status.connected, true)
    assert.ok(status.connectedAt instanceof Date)
    const row = await db.settings.findUniqueOrThrow({ where: { key: 'clubGoogleRefreshToken' } })
    assert.equal(row.value, 'second-token')
  })
})

describe('agenda email sent on a member\'s behalf', () => {
  test('carries Reply-To, and no header value can smuggle in a line break', () => {
    const raw = buildRawGmailMessage(
      ['a@example.com', 'b@example.com'],
      'Subject',
      '<p>Body</p>',
      { replyTo: 'sam@example.com\r\nBcc: evil@example.com' }
    )
    const [head] = raw.split('\r\n\r\n')
    const headers = head.split('\r\n')
    assert.ok(headers.some((h) => h.startsWith('Reply-To: sam@example.com')))
    assert.equal(headers.filter((h) => h.startsWith('Bcc:')).length, 1)
  })

  test('has no Reply-To when the Toastmaster sends it themselves', () => {
    const raw = buildRawGmailMessage(['a@example.com'], 'Subject', '<p>Body</p>')
    assert.ok(!raw.includes('Reply-To:'))
  })
})
