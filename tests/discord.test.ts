/**
 * Discord agenda announcements.
 *
 * The agenda email's HTML is reposted to Discord as markdown. A bad conversion
 * shows the whole club raw tags or mangled names; a loose `allowed_mentions`
 * lets anything typed into the email ping `@everyone`. Neither shows in the
 * app, so both are pinned here.
 */
import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  htmlToDiscordMarkdown as md,
  splitForDiscord,
  buildAgendaDiscordMessages,
  postAgendaToDiscord,
  DISCORD_MESSAGE_LIMIT,
} from '@/lib/discord'

const ROLE = '123456789012345678'
const announcement = (html: string) => ({ subject: 'Meeting Agenda – Oct 17', html, sheetUrl: 'https://docs.google.com/spreadsheets/d/abc' })

describe('HTML to Discord markdown', () => {
  test('inline marks', () => {
    assert.equal(
      md('<p><strong>Bold</strong>, <em>italic</em>, <s>struck</s>, <u>under</u> and <code>x = 1</code></p>'),
      '**Bold**, *italic*, ~~struck~~, __under__ and `x = 1`'
    )
  })

  test('spaces at the edge of a mark stay outside it', () => {
    assert.equal(md('<p>Hi<strong> Jane </strong>!</p>'), 'Hi **Jane** !')
  })

  test('paragraphs, line breaks and headings', () => {
    assert.equal(
      md('<h2>Theme</h2><p>Line one<br>Line two</p><p></p><p>Next</p>'),
      '## Theme\n\nLine one\nLine two\n\nNext'
    )
    assert.equal(md('<h5>Small</h5>'), '### Small')
  })

  test('bullet and numbered lists, nested, with Tiptap paragraphs inside items', () => {
    assert.equal(
      md('<ul><li><p>Toastmaster: Jane</p></li><li><p>Speakers</p><ol><li><p>Sam</p></li><li><p>Lee</p></li></ol></li></ul>'),
      '- Toastmaster: Jane\n- Speakers\n  1. Sam\n  2. Lee'
    )
    assert.equal(md('<ol start="3"><li><p>c</p></li></ol>'), '3. c')
  })

  test('blockquotes', () => {
    assert.equal(md('<blockquote><p>Be brave.</p><p>— Someone</p></blockquote>'), '> Be brave.\n> — Someone')
  })

  test('links: masked when the text differs, bare when it is the URL', () => {
    assert.equal(md('<p><a href="https://example.com/a">sign up</a></p>'), '[sign up](https://example.com/a)')
    assert.equal(md('<p><a href="https://example.com/a_b">https://example.com/a_b</a></p>'), 'https://example.com/a_b')
    assert.equal(md('<p><a href="javascript:alert(1)">click</a></p>'), 'click')
  })

  test('entities are decoded and markdown in prose is escaped', () => {
    assert.equal(md('<p>Tom &amp; Jerry &lt;3 &#39;hi&#39; &#x2764;</p>'), "Tom & Jerry <3 'hi' ❤")
    assert.equal(md('<p>snake_case *star* ~tilde~ `tick` |pipe|</p>'), 'snake\\_case \\*star\\* \\~tilde\\~ \\`tick\\` \\|pipe\\|')
  })

  test('bare URLs in prose are not escaped', () => {
    assert.equal(md('<p>See https://example.com/a_b_c now</p>'), 'See https://example.com/a_b_c now')
  })

  test('code blocks are kept verbatim', () => {
    assert.equal(md('<pre><code>a_b *c*\n  d</code></pre>'), '```\na_b *c*\n  d\n```')
  })

  test('unknown tags are dropped, their text kept', () => {
    assert.equal(md('<p><span style="color:red">red</span><img src="x.png"> text<!-- note --></p>'), 'red text')
  })
})

describe('splitting', () => {
  test('a short message is not split', () => {
    assert.deepEqual(splitForDiscord('a\n\nb'), ['a\n\nb'])
  })

  test('every chunk fits and nothing is lost', () => {
    const paragraphs = Array.from({ length: 60 }, (_, i) => `Paragraph ${i} `.repeat(8).trim())
    const longLine = 'x'.repeat(4500)
    const text = [...paragraphs, longLine, 'end'].join('\n\n')
    const chunks = splitForDiscord(text)
    assert.ok(chunks.length > 1)
    for (const chunk of chunks) assert.ok(chunk.length <= DISCORD_MESSAGE_LIMIT, `chunk of ${chunk.length}`)
    assert.equal(chunks.join('').replace(/\s/g, ''), text.replace(/\s/g, ''))
  })

  test('splits at paragraph breaks when it can', () => {
    const para = 'word '.repeat(150).trim() // 749 chars
    const chunks = splitForDiscord([para, para, para].join('\n\n'))
    assert.deepEqual(chunks, [`${para}\n\n${para}`, para])
  })
})

describe('messages and mentions', () => {
  test('ping, bold subject, body, then the sheet link', () => {
    const [message] = buildAgendaDiscordMessages(announcement('<p>Hi everyone!</p>'), ROLE)
    assert.equal(
      message.content,
      `<@&${ROLE}>\n**Meeting Agenda – Oct 17**\n\nHi everyone!\n\n📋 **Agenda Sheet:** https://docs.google.com/spreadsheets/d/abc`
    )
    assert.deepEqual(message.allowed_mentions, { parse: [], roles: [ROLE] })
  })

  test('nothing typed into the email can ping anyone', () => {
    const messages = buildAgendaDiscordMessages(announcement('<p>@everyone @here &lt;@&amp;999&gt; &lt;@42&gt;</p>'), ROLE)
    assert.deepEqual(messages[0].allowed_mentions, { parse: [], roles: [ROLE] })
  })

  test('a long agenda pings once, in the first message only', () => {
    const html = Array.from({ length: 40 }, (_, i) => `<p>${`Item ${i} `.repeat(15)}</p>`).join('')
    const messages = buildAgendaDiscordMessages(announcement(html), ROLE)
    assert.ok(messages.length > 1)
    assert.ok(messages[0].content.startsWith(`<@&${ROLE}>`))
    for (const m of messages) assert.ok(m.content.length <= DISCORD_MESSAGE_LIMIT)
    for (const m of messages.slice(1)) {
      assert.deepEqual(m.allowed_mentions, { parse: [] })
      assert.ok(!m.content.includes('<@&'))
    }
  })

  test('without a (valid) role ID the post is silent', () => {
    for (const roleId of [undefined, '', 'members', '@everyone']) {
      const [message] = buildAgendaDiscordMessages(announcement('<p>Hi</p>'), roleId)
      assert.ok(message.content.startsWith('**Meeting Agenda'))
      assert.deepEqual(message.allowed_mentions, { parse: [] })
    }
  })
})

describe('delivery', () => {
  const realFetch = globalThis.fetch
  const env = { ...process.env }
  afterEach(() => {
    globalThis.fetch = realFetch
    process.env = { ...env }
  })

  const recordFetch = (status = 204) => {
    const calls: { url: string; body: unknown }[] = []
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response(status === 204 ? null : 'nope', { status })
    }) as typeof fetch
    return calls
  }

  test('does nothing without a webhook URL', async () => {
    delete process.env.DISCORD_AGENDA_WEBHOOK_URL
    const calls = recordFetch()
    assert.equal(await postAgendaToDiscord(announcement('<p>Hi</p>')), 0)
    assert.equal(calls.length, 0)
  })

  test('posts every message, in order, to the webhook', async () => {
    process.env.DISCORD_AGENDA_WEBHOOK_URL = 'https://discord.com/api/webhooks/1/token'
    process.env.DISCORD_AGENDA_ROLE_ID = ROLE
    const calls = recordFetch()
    const html = Array.from({ length: 40 }, (_, i) => `<p>${`Item ${i} `.repeat(15)}</p>`).join('')
    const sent = await postAgendaToDiscord(announcement(html))
    assert.equal(calls.length, sent)
    assert.ok(sent > 1)
    assert.ok(calls.every((c) => c.url === 'https://discord.com/api/webhooks/1/token?wait=true'))
    assert.deepEqual(calls.map((c) => c.body), buildAgendaDiscordMessages(announcement(html), ROLE))
  })

  test('a refusal throws so the pipeline can warn', async () => {
    process.env.DISCORD_AGENDA_WEBHOOK_URL = 'https://discord.com/api/webhooks/1/token'
    recordFetch(500)
    await assert.rejects(postAgendaToDiscord(announcement('<p>Hi</p>')), /500/)
  })
})
