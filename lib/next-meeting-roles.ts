/**
 * #next-meeting-roles Discord Post
 *
 * The next meeting's major roles are handed out during the meeting before it
 * (the agenda's "Roles For Next Meeting" slot) and saved in Role Management.
 * That save posts them to the club Discord's #next-meeting-roles channel
 * through its own webhook (DISCORD_ROLES_WEBHOOK_URL; docs/DEPLOYMENT.md,
 * "Discord Next-Meeting Roles"). Without the variable nothing is posted.
 *
 * One message per meeting:
 *   - The first save of the NEXT meeting (the first scheduled meeting dated
 *     after today, club time) posts it, and its ID is kept on the meeting.
 *     Roles set for meetings further ahead are not announced yet.
 *   - Every later save of that meeting edits the same message. Discord sends
 *     no notification for a mention added by an edit, so only the first post
 *     pings anyone.
 *
 * Members are mentioned by the Discord user ID an admin entered on Member
 * Management; anyone without one is printed by name. `allowed_mentions` names
 * exactly the users mentioned, so nothing else can ever ping.
 *
 * Kept free of Next.js request context so tests can drive it directly.
 */

import { db } from './db'
import { BACKUP_SPEAKER } from './roles'
import { getDisplayName, type NameableUser } from './user-logic'
import { formatClubDateYmd } from './meeting-time'
import {
  escapeDiscordMarkdown,
  parseDiscordUserId,
  postWebhookMessage,
  editWebhookMessage,
  webhookUrlFrom,
  DiscordWebhookError,
  type DiscordMessage,
} from './discord'

/** The post's lines, grouped as the channel has always written them: [label, role]. */
const LAYOUT: [label: string, roleName: string][][] = [
  [['TM', 'Toastmaster']],
  [['Speaker 1', 'Speaker 1'], ['Speaker 2', 'Speaker 2'], ['Speaker 3', 'Speaker 3']],
  [['Backup', BACKUP_SPEAKER]],
  [['TTM', 'Table Topics Master'], ['QM', 'Quizmaster']],
]

const POSTED_ROLES = LAYOUT.flat().map(([, roleName]) => roleName)

export type RoleHolder = NameableUser & { discordId: string | null }

/**
 * Builds the post for one meeting.
 *
 * @param holders - Each role's holder, by role name; a missing role prints bare.
 * @param roster  - Active members, to tell apart two who share a first name.
 */
export function buildNextMeetingRolesMessage(
  date: Date,
  holders: Record<string, RoleHolder | null | undefined>,
  roster: NameableUser[]
): DiscordMessage {
  const mentioned = new Set<string>()

  const holderText = (holder: RoleHolder | null | undefined) => {
    if (!holder) return ''
    const id = parseDiscordUserId(holder.discordId)
    if (id) {
      mentioned.add(id)
      return ` <@${id}>`
    }
    return ` ${escapeDiscordMarkdown(getDisplayName(holder, roster))}`
  }

  const groups = LAYOUT.map((group) =>
    group.map(([label, roleName]) => `**${label}:**${holderText(holders[roleName])}`).join('\n'))

  return {
    content: `# __Roles for Next Meeting ${formatClubDateYmd(date)}__\n${groups.join('\n\n')}`,
    allowed_mentions: mentioned.size > 0 ? { parse: [], users: [...mentioned] } : { parse: [] },
  }
}

/** The meeting the channel announces: the first scheduled one dated after today (club time). */
export async function nextMeetingId(now = new Date()): Promise<string | null> {
  const today = formatClubDateYmd(now)
  const upcoming = await db.meeting.findMany({
    where: { status: 'SCHEDULED', date: { gt: now } },
    orderBy: { date: 'asc' },
    select: { id: true, date: true },
    take: 3,
  })
  return upcoming.find((m) => formatClubDateYmd(m.date) > today)?.id ?? null
}

export type RolesPostOutcome = 'posted' | 'edited' | 'skipped'

async function sync(meetingId: string, mayCreate: boolean, now: Date): Promise<RolesPostOutcome> {
  const webhookUrl = webhookUrlFrom('DISCORD_ROLES_WEBHOOK_URL')
  if (!webhookUrl) return 'skipped'

  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    include: {
      roleAssignments: {
        where: { roleName: { in: POSTED_ROLES }, userId: { not: null } },
        include: { user: true },
      },
    },
  })
  if (!meeting) return 'skipped'

  if (!meeting.discordRolesMessageId) {
    if (!mayCreate || meeting.roleAssignments.length === 0) return 'skipped'
    if (await nextMeetingId(now) !== meeting.id) return 'skipped'
  }

  const holders: Record<string, RoleHolder> = {}
  for (const row of meeting.roleAssignments) if (row.user) holders[row.roleName] = row.user
  const roster = await db.user.findMany({
    where: { role: 'MEMBER' },
    select: { firstName: true, lastName: true },
  })
  const message = buildNextMeetingRolesMessage(meeting.date, holders, roster)

  if (meeting.discordRolesMessageId) {
    try {
      await editWebhookMessage(webhookUrl, meeting.discordRolesMessageId, message)
      return 'edited'
    } catch (error) {
      // Deleted in Discord: post it again below.
      if (!(error instanceof DiscordWebhookError && error.status === 404)) throw error
    }
  }

  const messageId = await postWebhookMessage(webhookUrl, message)
  await db.meeting.update({ where: { id: meetingId }, data: { discordRolesMessageId: messageId } })
  return 'posted'
}

// One sync at a time, so two saves in quick succession cannot both see "no
// message yet" and post twice.
let queue: Promise<unknown> = Promise.resolve()

/**
 * Brings a meeting's #next-meeting-roles post up to date: edits it when it
 * exists, otherwise posts it if `mayCreate` and this is the next meeting.
 *
 * @throws When Discord refuses the post, or the webhook URL is not https://.
 */
export function syncNextMeetingRolesPost(
  meetingId: string,
  { mayCreate, now = new Date() }: { mayCreate: boolean; now?: Date }
): Promise<RolesPostOutcome> {
  const run = queue.then(() => sync(meetingId, mayCreate, now))
  queue = run.catch(() => {})
  return run
}

/**
 * Everything a Role Management save can change in the channel: the saved
 * meeting's post, and — when its Backup Speaker changed, which moves a
 * speaker slot at the following meeting (lib/roles-logic.ts
 * carryBackupForward) — the following meeting's post, if it already has one.
 */
export async function syncRolesPostsAfterSave(
  meetingId: string,
  { backupChanged, now = new Date() }: { backupChanged: boolean; now?: Date }
): Promise<void> {
  await syncNextMeetingRolesPost(meetingId, { mayCreate: true, now })
  if (!backupChanged) return

  const meeting = await db.meeting.findUnique({ where: { id: meetingId }, select: { date: true } })
  if (!meeting) return
  const following = await db.meeting.findFirst({
    where: { status: 'SCHEDULED', date: { gt: meeting.date } },
    orderBy: { date: 'asc' },
    select: { id: true },
  })
  if (following) await syncNextMeetingRolesPost(following.id, { mayCreate: false, now })
}
