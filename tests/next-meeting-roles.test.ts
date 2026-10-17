/**
 * The #next-meeting-roles Discord post.
 *
 * Saving the next meeting's roles posts them once, and later saves edit that
 * message. A wrong layout, a second post per save, an announcement for a
 * meeting weeks away, or a loose `allowed_mentions` all happen in Discord,
 * out of the app's sight, so they are pinned here.
 */
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { db, resetDb, createMeeting, createMembers, assignRole } from './helpers/db'
import {
  buildNextMeetingRolesMessage,
  syncNextMeetingRolesPost,
  syncRolesPostsAfterSave,
  nextMeetingId,
} from '@/lib/next-meeting-roles'
import { parseDiscordUserId } from '@/lib/discord'
import { persistMajorRoles } from '@/lib/roles-logic'
import { BACKUP_SPEAKER } from '@/lib/roles'

const ADA_ID = '111111111111111111'
const WEBHOOK = 'https://discord.com/api/webhooks/1/token'

// Friday Oct 23, 2026, 6:45 PM Pacific.
const OCT_23 = new Date('2026-10-24T01:45:00Z')
// During the Oct 16 meeting, 7:30 PM Pacific.
const DURING_OCT_16 = new Date('2026-10-17T02:30:00Z')

const person = (firstName: string, lastName = 'Test', discordId: string | null = null) => ({ firstName, lastName, discordId })

describe('the message', () => {
  test('the channel layout, with mentions and names', () => {
    const ada = person('Ada', 'Lovelace', ADA_ID)
    const sam = person('Sam')
    const message = buildNextMeetingRolesMessage(OCT_23, {
      Toastmaster: ada,
      'Speaker 1': sam,
      [BACKUP_SPEAKER]: sam,
      Quizmaster: ada,
    }, [ada, sam])

    assert.equal(message.content, [
      '# __Roles for Next Meeting 2026/10/23__',
      `**TM:** <@${ADA_ID}>`,
      '',
      '**Speaker 1:** Sam',
      '**Speaker 2:**',
      '**Speaker 3:**',
      '',
      '**Backup:** Sam',
      '',
      '**TTM:**',
      `**QM:** <@${ADA_ID}>`,
    ].join('\n'))
    assert.deepEqual(message.allowed_mentions, { parse: [], users: [ADA_ID] })
  })

  test('nobody to mention means nothing can ping', () => {
    const message = buildNextMeetingRolesMessage(OCT_23, {}, [])
    assert.ok(message.content.startsWith('# __Roles for Next Meeting 2026/10/23__\n**TM:**\n'))
    assert.deepEqual(message.allowed_mentions, { parse: [] })
  })

  test('the date is the club-time date, not UTC', () => {
    // 01:45 UTC on the 24th is still the 23rd in Vancouver.
    assert.match(buildNextMeetingRolesMessage(OCT_23, {}, []).content, /2026\/10\/23/)
  })

  test('a shared first name gets a last initial; names are escaped', () => {
    const samA = person('Sam', 'Alder')
    const samB = person('Sam', 'Birch')
    const snake = person('snake_case', 'X')
    const { content } = buildNextMeetingRolesMessage(OCT_23, {
      'Speaker 1': samA, 'Speaker 2': samB, 'Speaker 3': snake,
    }, [samA, samB, snake])
    assert.match(content, /\*\*Speaker 1:\*\* Sam A\.\n\*\*Speaker 2:\*\* Sam B\.\n\*\*Speaker 3:\*\* snake\\_case\n/)
  })

  test('an unusable stored ID falls back to the name', () => {
    const ada = person('Ada', 'Lovelace', '@everyone')
    const message = buildNextMeetingRolesMessage(OCT_23, { Toastmaster: ada }, [ada])
    assert.match(message.content, /\*\*TM:\*\* Ada\n/)
    assert.deepEqual(message.allowed_mentions, { parse: [] })
  })
})

describe('reading a pasted Discord ID', () => {
  test('bare IDs and mentions', () => {
    assert.equal(parseDiscordUserId(` ${ADA_ID} `), ADA_ID)
    assert.equal(parseDiscordUserId(`<@${ADA_ID}>`), ADA_ID)
    assert.equal(parseDiscordUserId(`<@!${ADA_ID}>`), ADA_ID)
  })

  test('anything else', () => {
    for (const bad of ['', 'ada#1234', '@ada', '12345', `<@&${ADA_ID}>`, `${ADA_ID}x`, null, undefined]) {
      assert.equal(parseDiscordUserId(bad), null, String(bad))
    }
  })
})

describe('posting and editing', () => {
  const realFetch = globalThis.fetch
  const env = { ...process.env }
  let calls: { method: string; url: string; body: { content: string } }[]
  let respond: (method: string) => Response

  let oct16: string
  let oct23: string
  let oct30: string
  let members: Record<string, { id: string; firstName: string }>

  beforeEach(async () => {
    await resetDb()
    process.env.DISCORD_ROLES_WEBHOOK_URL = WEBHOOK
    calls = []
    let next = 1
    respond = (method) => method === 'POST'
      ? Response.json({ id: `msg-${next++}` })
      : Response.json({})
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ method, url: String(url), body: JSON.parse(String(init?.body)) })
      return respond(method)
    }) as typeof fetch

    oct16 = (await createMeeting(new Date('2026-10-17T01:45:00Z'))).id
    oct23 = (await createMeeting(OCT_23)).id
    oct30 = (await createMeeting(new Date('2026-10-31T01:45:00Z'))).id
    members = await createMembers(['Ada', 'Brian', 'Cleo'])
  })

  afterEach(() => {
    globalThis.fetch = realFetch
    process.env = { ...env }
  })

  const sync = (meetingId: string, mayCreate = true) =>
    syncNextMeetingRolesPost(meetingId, { mayCreate, now: DURING_OCT_16 })
  const storedId = async (meetingId: string) =>
    (await db.meeting.findUniqueOrThrow({ where: { id: meetingId } })).discordRolesMessageId

  test('during a meeting, the next meeting is the one after it', async () => {
    assert.equal(await nextMeetingId(DURING_OCT_16), oct23)
    // Before the meeting starts that day, it is still not "next".
    assert.equal(await nextMeetingId(new Date('2026-10-16T19:00:00Z')), oct23)
  })

  test('the first save posts, and later saves edit that message', async () => {
    await assignRole(oct23, 'Toastmaster', members.Ada.id)
    assert.equal(await sync(oct23), 'posted')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].method, 'POST')
    assert.equal(calls[0].url, `${WEBHOOK}?wait=true`)
    assert.equal(await storedId(oct23), 'msg-1')

    await assignRole(oct23, 'Speaker 1', members.Brian.id)
    assert.equal(await sync(oct23), 'edited')
    assert.equal(calls.length, 2)
    assert.equal(calls[1].method, 'PATCH')
    assert.equal(calls[1].url, `${WEBHOOK}/messages/msg-1`)
    assert.match(calls[1].body.content, /\*\*Speaker 1:\*\* Brian/)
  })

  test('a message deleted in Discord is posted again', async () => {
    await assignRole(oct23, 'Toastmaster', members.Ada.id)
    await sync(oct23)
    respond = (method) => method === 'PATCH'
      ? new Response('{"message": "Unknown Message"}', { status: 404 })
      : Response.json({ id: 'msg-2' })

    assert.equal(await sync(oct23), 'posted')
    assert.deepEqual(calls.map((c) => c.method), ['POST', 'PATCH', 'POST'])
    assert.equal(await storedId(oct23), 'msg-2')
  })

  test('two saves at once post only once', async () => {
    await assignRole(oct23, 'Toastmaster', members.Ada.id)
    await Promise.all([sync(oct23), sync(oct23)])
    assert.deepEqual(calls.map((c) => c.method), ['POST', 'PATCH'])
  })

  test('roles set further ahead are not announced', async () => {
    await assignRole(oct30, 'Toastmaster', members.Ada.id)
    assert.equal(await sync(oct30), 'skipped')
    assert.equal(calls.length, 0)
  })

  test('a meeting already announced is edited whenever it is saved', async () => {
    await assignRole(oct30, 'Toastmaster', members.Ada.id)
    await db.meeting.update({ where: { id: oct30 }, data: { discordRolesMessageId: 'msg-old' } })
    assert.equal(await sync(oct30), 'edited')
    assert.equal(calls[0].url, `${WEBHOOK}/messages/msg-old`)
  })

  test('a save with no roles at all posts nothing', async () => {
    assert.equal(await sync(oct23), 'skipped')
    assert.equal(calls.length, 0)
  })

  test('without a webhook URL nothing is sent', async () => {
    delete process.env.DISCORD_ROLES_WEBHOOK_URL
    await assignRole(oct23, 'Toastmaster', members.Ada.id)
    assert.equal(await sync(oct23), 'skipped')
    assert.equal(calls.length, 0)
  })

  test('a refusal throws, so the save can warn', async () => {
    await assignRole(oct23, 'Toastmaster', members.Ada.id)
    respond = () => new Response('nope', { status: 500 })
    await assert.rejects(sync(oct23), /500/)
    assert.equal(await storedId(oct23), null)
  })

  test('a mentioned member is pinged by their stored ID', async () => {
    await db.user.update({ where: { id: members.Ada.id }, data: { discordId: ADA_ID } })
    await assignRole(oct23, 'Toastmaster', members.Ada.id)
    await sync(oct23)
    assert.match(calls[0].body.content, new RegExp(`\\*\\*TM:\\*\\* <@${ADA_ID}>`))
  })

  test("changing today's standby re-syncs the next meeting's post", async () => {
    await assignRole(oct23, 'Toastmaster', members.Ada.id)
    await sync(oct23)

    // The new standby for Oct 16 is carried into an open Oct 23 speaker slot.
    await persistMajorRoles(oct16, [{ roleName: BACKUP_SPEAKER, userId: members.Cleo.id }])
    await syncRolesPostsAfterSave(oct16, { backupChanged: true, now: DURING_OCT_16 })

    assert.deepEqual(calls.map((c) => c.method), ['POST', 'PATCH'])
    assert.equal(calls[1].url, `${WEBHOOK}/messages/msg-1`)
    assert.match(calls[1].body.content, /\*\*Speaker \d:\*\* Cleo/)
    // Oct 16 itself is not "next" during its own meeting.
    assert.equal(await storedId(oct16), null)
  })
})
