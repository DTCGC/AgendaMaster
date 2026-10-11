/**
 * Discord Agenda Announcements
 *
 * When the agenda email goes out, the same text is posted to the club's
 * Discord through a channel webhook, pinging the members role. A webhook is a
 * plain HTTPS POST: no bot, no gateway connection, no extra process.
 *
 * Configured by two optional env vars (docs/DEPLOYMENT.md, "Discord Agenda
 * Announcements"):
 *   - DISCORD_AGENDA_WEBHOOK_URL: without it nothing is posted.
 *   - DISCORD_AGENDA_ROLE_ID: the role to ping; without it the post is silent.
 *
 * The email body is Tiptap HTML; Discord speaks markdown, so it is converted
 * here. Every message sets `allowed_mentions` explicitly, so nothing typed
 * into the email (`@everyone`, a pasted `<@&id>`) can ever ping anyone — only
 * the configured role, and only once.
 */

/** Discord refuses a message whose content is longer than this. */
export const DISCORD_MESSAGE_LIMIT = 2000;

const REQUEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// HTML -> Discord markdown
// ---------------------------------------------------------------------------

type HtmlNode = string | { tag: string; attrs: string; children: HtmlNode[] };
type Element = Exclude<HtmlNode, string>;

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'wbr', 'meta', 'link', 'col', 'source']);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[ref.toLowerCase()] ?? match;
  });
}

/**
 * A forgiving tree parser for the editor's output. Tiptap emits well-formed
 * HTML, so this only has to tolerate stray closing tags, not real-world soup.
 */
function parseHtml(html: string): HtmlNode[] {
  const root: Element = { tag: '#root', attrs: '', children: [] };
  const stack: Element[] = [root];
  const token = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|[^<]+|</g;

  for (const match of html.matchAll(token)) {
    const [raw, name, attrs = ''] = match;
    const top = stack[stack.length - 1];
    if (raw.startsWith('<!--')) continue;
    if (!name) {
      top.children.push(raw);
      continue;
    }
    const tag = name.toLowerCase();
    if (raw.startsWith('</')) {
      const at = stack.map((e) => e.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const element: Element = { tag, attrs, children: [] };
    top.children.push(element);
    if (!VOID_TAGS.has(tag) && !attrs.trimEnd().endsWith('/')) stack.push(element);
  }
  return root.children;
}

function attr(attrs: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? '') : null;
}

/** The text of a subtree, entities decoded, nothing escaped. */
function rawText(nodes: HtmlNode[]): string {
  return nodes.map((n) => (typeof n === 'string' ? decodeEntities(n) : n.tag === 'br' ? '\n' : rawText(n.children))).join('');
}

/** Escapes Discord markdown in prose, leaving bare URLs intact so they stay clickable. */
export function escapeDiscordMarkdown(text: string): string {
  return text
    .split(/(https?:\/\/[^\s<]+)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/[\\*_~`|[\]]/g, '\\$&')))
    .join('');
}

/** Wraps inline text in a markdown mark, keeping edge spaces outside it (`** a**` would not render). */
function wrap(inner: string, mark: string): string {
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!;
  return core ? `${lead}${mark}${core}${mark}${trail}` : inner;
}

/** Tidies a rendered fragment: no trailing spaces, no blank-only lines, at most one blank line in a row. */
function normalize(text: string): string {
  return text
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

const block = (text: string) => `\n\n${text}\n\n`;

function renderList(list: Element): string {
  const ordered = list.tag === 'ol';
  const start = ordered ? parseInt(attr(list.attrs, 'start') ?? '1', 10) || 1 : 1;
  const items = list.children.filter((c): c is Element => typeof c !== 'string' && c.tag === 'li');

  const lines = items.map((item, i) => {
    const marker = ordered ? `${start + i}.` : '-';
    // A blank line would end the list, so an item's paragraphs and its
    // nested list are kept on consecutive lines.
    const content = normalize(render(item.children)).split('\n').filter((l) => l.trim() !== '');
    const indent = ' '.repeat(marker.length + 1);
    return content.map((line, j) => (j === 0 ? `${marker} ${line}` : `${indent}${line}`)).join('\n') || marker;
  });
  return block(lines.join('\n'));
}

function render(nodes: HtmlNode[]): string {
  return nodes.map(renderNode).join('');
}

function renderNode(node: HtmlNode): string {
  if (typeof node === 'string') return escapeDiscordMarkdown(decodeEntities(node).replace(/\s+/g, ' '));

  switch (node.tag) {
    case 'strong': case 'b': return wrap(render(node.children), '**');
    case 'em': case 'i': return wrap(render(node.children), '*');
    case 's': case 'del': case 'strike': return wrap(render(node.children), '~~');
    case 'u': return wrap(render(node.children), '__');
    case 'code': {
      const text = rawText(node.children).replace(/`/g, 'ˋ');
      return text ? `\`${text}\`` : '';
    }
    case 'pre': return block('```\n' + rawText(node.children).replace(/```/g, 'ˋˋˋ').replace(/\n+$/, '') + '\n```');
    case 'a': {
      const text = render(node.children);
      const href = attr(node.attrs, 'href')?.trim();
      if (!href) return text;
      const plain = rawText(node.children).trim();
      if (plain === href || `mailto:${plain}` === href) return plain;
      if (!/^https?:\/\//i.test(href)) return text;
      return `[${text.trim() || href}](${href.replace(/[()\s]/g, encodeURIComponent)})`;
    }
    case 'br': return '\n';
    case 'hr': return block('');
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const text = normalize(render(node.children)).replace(/\n+/g, ' ');
      const level = Math.min(Number(node.tag[1]), 3);
      return text ? block(`${'#'.repeat(level)} ${text}`) : '';
    }
    case 'p': case 'div': return block(render(node.children).trim());
    case 'blockquote': {
      const lines = normalize(render(node.children)).split('\n').filter((l) => l.trim() !== '');
      return block(lines.map((l) => `> ${l}`).join('\n'));
    }
    case 'ul': case 'ol': return renderList(node);
    case 'li': return block(render(node.children));
    case 'img': case 'script': case 'style': return '';
    default: return render(node.children);
  }
}

/** Converts the agenda email's HTML into the closest Discord markdown. */
export function htmlToDiscordMarkdown(html: string): string {
  return normalize(render(parseHtml(html)));
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Splits text into chunks Discord accepts: at blank lines where possible,
 * then at line breaks, and only as a last resort mid-line.
 */
export function splitForDiscord(text: string, limit = DISCORD_MESSAGE_LIMIT): string[] {
  const chunks: string[] = [];
  let current = '';

  const push = (piece: string, separator: string) => {
    if (!current) current = piece;
    else if (current.length + separator.length + piece.length <= limit) current += separator + piece;
    else {
      chunks.push(current);
      current = piece;
    }
  };

  for (const paragraph of text.split('\n\n')) {
    if (paragraph.length <= limit) {
      push(paragraph, '\n\n');
      continue;
    }
    let separator = '\n\n';
    for (const line of paragraph.split('\n')) {
      for (let i = 0; i < Math.max(line.length, 1); i += limit) {
        push(line.slice(i, i + limit), separator);
        separator = i + limit < line.length ? '' : '\n';
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export type DiscordMessage = {
  content: string;
  allowed_mentions: { parse: never[]; roles?: string[] };
};

export type AgendaAnnouncement = {
  subject: string;
  /** The email body exactly as the Toastmaster wrote it (Tiptap HTML). */
  html: string;
  sheetUrl: string;
};

/** Builds the messages for one announcement. Only the first carries (and may fire) the role ping. */
export function buildAgendaDiscordMessages(
  { subject, html, sheetUrl }: AgendaAnnouncement,
  roleId?: string | null
): DiscordMessage[] {
  const role = roleId && /^\d{5,30}$/.test(roleId.trim()) ? roleId.trim() : null;

  const text = [
    `${role ? `<@&${role}>\n` : ''}**${escapeDiscordMarkdown(subject.trim())}**`,
    htmlToDiscordMarkdown(html),
    `📋 **Agenda Sheet:** ${sheetUrl}`,
  ].filter(Boolean).join('\n\n');

  return splitForDiscord(text).map((content, i) => ({
    content,
    allowed_mentions: i === 0 && role ? { parse: [], roles: [role] } : { parse: [] },
  }));
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

async function postMessage(webhookUrl: string, message: DiscordMessage, retried = false): Promise<void> {
  const url = new URL(webhookUrl);
  url.searchParams.set('wait', 'true');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.ok) return;

  if (response.status === 429 && !retried) {
    const body = (await response.json().catch(() => ({}))) as { retry_after?: number };
    const seconds = Math.min(Math.max(Number(body.retry_after) || 1, 0), 10);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return postMessage(webhookUrl, message, true);
  }

  const detail = (await response.text().catch(() => '')).slice(0, 200);
  throw new Error(`Discord webhook answered ${response.status}${detail ? `: ${detail}` : ''}`);
}

/**
 * Posts the agenda to Discord, in order, as one or more messages.
 *
 * @returns How many messages were posted — 0 when no webhook is configured.
 * @throws When Discord refuses a message. Earlier messages stay posted.
 */
export async function postAgendaToDiscord(announcement: AgendaAnnouncement): Promise<number> {
  const webhookUrl = process.env.DISCORD_AGENDA_WEBHOOK_URL?.trim();
  if (!webhookUrl) return 0;
  if (!/^https:\/\//i.test(webhookUrl)) {
    throw new Error('DISCORD_AGENDA_WEBHOOK_URL is not an https:// URL.');
  }

  const messages = buildAgendaDiscordMessages(announcement, process.env.DISCORD_AGENDA_ROLE_ID);
  for (const message of messages) {
    await postMessage(webhookUrl, message);
  }
  return messages.length;
}
