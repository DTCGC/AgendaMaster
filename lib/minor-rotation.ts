/**
 * Minor Role Rotation
 *
 * Decides who fills a meeting's empty minor roles. Kept free of the database
 * so the rotation can be checked over many simulated meetings.
 *
 * Two questions, answered in order:
 *   1. Who serves? The members whose last minor role of any kind is oldest.
 *      This decides who sits out when there are more members than roles.
 *   2. Who does what? Each serving member is matched to a role by how long it
 *      has been since they last did *that* role ("days since Timer"), counting
 *      the numbered slots as one role (see minorRoleFamily), and by whether
 *      they have done it more than their share. The matching is solved for
 *      all roles at once rather than slot by slot, so filling the early slots
 *      greedily cannot strand someone with a role they just did.
 *
 * With at least as many members as minor roles, members cycle through every
 * role in proportion to its slots (tests/minor-rotation.test.ts).
 */

import { MINOR_ROLES, minorRoleFamily } from './roles'

/** How many slots a role's family has per meeting (Evaluator: 3). */
const slotsOf = (role: string) =>
  MINOR_ROLES.filter((r) => minorRoleFamily(r) === minorRoleFamily(role)).length

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Breaks exact ties in favour of pairing the n-th member in the queue with the
 * n-th role, so a club with no history yet gets a predictable roster. Far below
 * any real difference in cost.
 */
const TIE_BREAK = 1e-12

/**
 * Weight of the fair-share term. Recency alone only knows each role's *last*
 * date, so small imbalances (two Timers, no Grammarian) never get corrected.
 * This term nudges each member towards the roles they are behind on. Small
 * enough that a recent repeat still dominates: a role last held a week ago
 * costs ~2e-2, while being one stint over share costs 1e-3.
 */
const SHARE_WEIGHT = 1e-3

/** One member's minor-role history from meetings before the one being planned. */
export type MemberHistory = {
  /** Role family → time (ms) of the latest meeting they held it at. */
  lastHeld: Map<string, number>
  /** Role family → how many times they have held it. */
  timesHeld: Map<string, number>
  /** Times (ms) of every meeting they held a minor role at, newest first. */
  servedAt: number[]
}

/** userId → that member's history. Members with no history may be absent. */
export type RoleHistory = Map<string, MemberHistory>

/**
 * Builds a RoleHistory from past minor-role rows.
 *
 * @param rows - One entry per minor role held: who, which role, meeting time (ms).
 */
export function buildRoleHistory(rows: { userId: string; roleName: string; meetingTime: number }[]): RoleHistory {
  const history: RoleHistory = new Map()
  for (const { userId, roleName, meetingTime } of rows) {
    let member = history.get(userId)
    if (!member) history.set(userId, (member = { lastHeld: new Map(), timesHeld: new Map(), servedAt: [] }))
    const family = minorRoleFamily(roleName)
    member.lastHeld.set(family, Math.max(member.lastHeld.get(family) ?? 0, meetingTime))
    member.timesHeld.set(family, (member.timesHeld.get(family) ?? 0) + 1)
    if (!member.servedAt.includes(meetingTime)) member.servedAt.push(meetingTime)
  }
  for (const member of history.values()) member.servedAt.sort((a, b) => b - a)
  return history
}

/**
 * Orders two members by who has waited longer for a minor role: the older
 * latest stint goes first, and on a tie the older stint before that, and so
 * on. Without that fallback, everyone who served last week would tie and the
 * same names would win the tie (and the role) every single week.
 */
function compareWaiting(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Plans the empty minor roles of one meeting.
 *
 * @param emptyRoles  - The roles to fill, in MINOR_ROLES order. When there are
 *                      fewer members than roles, the last ones stay empty.
 * @param members     - Everyone eligible: no role at this meeting yet.
 * @param history     - Minor roles held at earlier meetings (not this one).
 * @param meetingTime - This meeting's date, in ms.
 * @returns `assignments` (role → member) and `unassigned` (the members sitting
 *          out, in priority order).
 */
export function planMinorRoles<T extends { id: string; displayName: string }>(
  emptyRoles: string[],
  members: T[],
  history: RoleHistory,
  meetingTime: number
): { assignments: Record<string, T>; unassigned: T[] } {
  // 1. Who serves: longest wait first; never served counts as the longest.
  const servedAt = (id: string) => history.get(id)?.servedAt ?? []
  const queue = [...members].sort((a, b) =>
    compareWaiting(servedAt(a.id), servedAt(b.id)) || a.displayName.localeCompare(b.displayName))

  const size = Math.min(emptyRoles.length, queue.length)
  const serving = queue.slice(0, size)
  const roles = emptyRoles.slice(0, size)

  // 2. Who does what. A pair costs more the more recently the member did that
  // role: never is free, a month ago is cheap, last week is expensive. Gaps
  // are scaled by the role's slot count, since a three-slot role like
  // Evaluator comes round three times as often as a single one like Timer.
  const cost = serving.map((member, i) =>
    roles.map((role, j) => {
      const past = history.get(member.id)
      const family = minorRoleFamily(role)
      const last = past?.lastHeld.get(family)
      const days = last === undefined ? Infinity : Math.max(meetingTime - last, DAY_MS) / DAY_MS
      const surplus = (past?.timesHeld.get(family) ?? 0) / slotsOf(role) - (past?.servedAt.length ?? 0) / MINOR_ROLES.length
      return recencyCost(days * slotsOf(role)) + SHARE_WEIGHT * surplus + (i === j ? 0 : TIE_BREAK)
    }))

  const roleFor = solveAssignment(cost)
  const assignments: Record<string, T> = {}
  serving.forEach((member, i) => { assignments[roles[roleFor[i]]] = member })

  return { assignments, unassigned: queue.slice(size) }
}

/**
 * The cost of giving someone a role they last did `days` ago (slot-scaled). Steeply convex,
 * so one back-to-back repeat outweighs many slightly-stale pairings and the
 * matching keeps every member's gaps as even as it can.
 */
function recencyCost(days: number): number {
  return days === Infinity ? 0 : 1 / (days * days)
}

/**
 * Minimum-cost perfect matching on a square cost matrix (the Hungarian
 * algorithm, O(n³) — n is at most the nine minor roles).
 *
 * @returns For each row, the column it is matched to.
 */
function solveAssignment(cost: number[][]): number[] {
  const n = cost.length
  // 1-indexed potentials and matching; index 0 is the algorithm's sentinel.
  const u = new Array<number>(n + 1).fill(0)
  const v = new Array<number>(n + 1).fill(0)
  const rowOfCol = new Array<number>(n + 1).fill(0)
  const way = new Array<number>(n + 1).fill(0)

  for (let row = 1; row <= n; row++) {
    rowOfCol[0] = row
    let col0 = 0
    const minv = new Array<number>(n + 1).fill(Infinity)
    const used = new Array<boolean>(n + 1).fill(false)
    do {
      used[col0] = true
      const row0 = rowOfCol[col0]
      let delta = Infinity
      let col1 = 0
      for (let col = 1; col <= n; col++) {
        if (used[col]) continue
        const reduced = cost[row0 - 1][col - 1] - u[row0] - v[col]
        if (reduced < minv[col]) { minv[col] = reduced; way[col] = col0 }
        if (minv[col] < delta) { delta = minv[col]; col1 = col }
      }
      for (let col = 0; col <= n; col++) {
        if (used[col]) { u[rowOfCol[col]] += delta; v[col] -= delta }
        else minv[col] -= delta
      }
      col0 = col1
    } while (rowOfCol[col0] !== 0)
    do {
      const col1 = way[col0]
      rowOfCol[col0] = rowOfCol[col1]
      col0 = col1
    } while (col0 !== 0)
  }

  const colOfRow = new Array<number>(n)
  for (let col = 1; col <= n; col++) colOfRow[rowOfCol[col] - 1] = col - 1
  return colOfRow
}
