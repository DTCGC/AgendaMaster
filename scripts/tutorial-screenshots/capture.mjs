/**
 * Tutorial Screenshot Capture
 *
 * Drives a headless Chrome over the DevTools protocol against the demo dev
 * server, draws red rings around the parts each screenshot is about, and
 * writes PNGs to app/tutorial/screenshots/. No packages: Node 24's built-in
 * WebSocket and fetch, plus the repo's own `sharp` for compression.
 *
 * Usage (from the repo root, with the demo dev server on port 3100 — see README.md here):
 *   node scripts/tutorial-screenshots/capture.mjs fresh       # before the agenda is prepared
 *   node scripts/tutorial-screenshots/capture.mjs finalized   # after demo-seed.ts --finalize + render-agenda-example.ts
 * Options:
 *   --only name1,name2    capture just these shots
 *   --width 1280 --height 800 --scale 1.5    viewport (e.g. 1920x1080 for slides)
 *   --base http://localhost:3100    --out <dir>    --chrome <path to chrome.exe>
 *
 * Never presses "Create Agenda & Send Email" or "Save & Close".
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const OUT = join(HERE, '.out')
const sharp = createRequire(join(REPO, 'package.json'))('sharp')

// ---------- options ----------
const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : fallback
}
const PHASE = argv[0]
const BASE = opt('base', 'http://localhost:3100')
const WIDTH = Number(opt('width', 1280))
const HEIGHT = Number(opt('height', 800))
const SCALE = Number(opt('scale', 1.5))
const DEST = opt('out', join(REPO, 'app', 'tutorial', 'screenshots'))
const CHROME = opt('chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
const ONLY = opt('only', '')?.split(',').filter(Boolean) ?? []
const PORT = 9333

if (!['fresh', 'finalized'].includes(PHASE)) {
  console.error('First argument must be "fresh" or "finalized".')
  process.exit(1)
}

const accounts = JSON.parse(readFileSync(join(OUT, 'demo-credentials.json'), 'utf8'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- a tiny DevTools protocol client ----------
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Set()
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.data ?? ''})`))
        else resolve(msg.result)
      } else if (msg.method) {
        for (const l of this.listeners) l(msg)
      }
    })
  }
  send(method, params = {}) {
    const id = this.nextId++
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }
  once(method, timeout = 60000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.listeners.delete(l); reject(new Error(`Timed out waiting for ${method}`)) }, timeout)
      const l = (msg) => {
        if (msg.method === method) { clearTimeout(timer); this.listeners.delete(l); resolve(msg.params) }
      }
      this.listeners.add(l)
    })
  }
}

// Runs in the page. `__find` resolves a target spec: { css, text, closest, nth }.
// With `text`, the innermost matching element wins, so specs stay short.
const PAGE_HELPERS = `
window.__find = (spec) => {
  let els = [...document.querySelectorAll(spec.css || '*')].filter((e) => e.getClientRects().length > 0)
  if (spec.text) {
    els = els.filter((e) => (e.textContent || '').includes(spec.text))
      .sort((a, b) => a.textContent.length - b.textContent.length)
  }
  let el = els[spec.nth || 0] || null
  if (el && spec.closest) el = el.closest(spec.closest)
  return el
}
window.__need = (spec) => {
  const el = window.__find(spec)
  if (!el) throw new Error('Not found on the page: ' + JSON.stringify(spec))
  return el
}
`

// Freezes animations (so nothing is caught mid-fade) and hides the Next.js dev badge.
const PAGE_STYLE = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  nextjs-portal { display: none !important; }
`

let cdp

async function evaluate(expression) {
  const res = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text)
  }
  return res.result.value
}

async function prepPage() {
  await evaluate(`${PAGE_HELPERS}
    if (!document.getElementById('__tutorial_style')) {
      const s = document.createElement('style'); s.id = '__tutorial_style'
      s.textContent = ${JSON.stringify(PAGE_STYLE)}; document.head.appendChild(s)
    }`)
}

async function waitFor(condition, what, timeout = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      if (await evaluate(`${PAGE_HELPERS}; !!(${condition})`)) return
    } catch { /* page mid-navigation */ }
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${what || condition}`)
}

async function goto(url) {
  const loaded = cdp.once('Page.loadEventFired')
  await cdp.send('Page.navigate', { url: url.startsWith('file:') ? url : BASE + url })
  await loaded
  await sleep(600)
  await prepPage()
}

const q = (spec) => JSON.stringify(spec)

async function click(spec) {
  await evaluate(`${PAGE_HELPERS}; __need(${q(spec)}).click()`)
  await sleep(400)
}

async function type(spec, text) {
  await evaluate(`${PAGE_HELPERS}; __need(${q(spec)}).focus()`)
  await cdp.send('Input.insertText', { text })
  await sleep(150)
}

async function signOut() {
  await cdp.send('Network.clearBrowserCookies')
}

async function signIn(who) {
  const acct = accounts[who]
  await signOut()
  await goto('/login')
  await evaluate(`document.querySelector('details').open = true`)
  await type({ css: 'input[name=email]' }, acct.email)
  await type({ css: 'input[name=password]' }, acct.password)
  await click({ css: 'button[type=submit]', text: 'Sign In' })
  await waitFor(`!location.pathname.startsWith('/login')`, `sign-in as ${who}`)
  await sleep(1500)
  await prepPage()
}

/**
 * Draws a red ring around each target. A target is a spec, or { specs: [...] }
 * for one ring around several elements. `label` adds a numbered badge;
 * `shape: 'box'` uses a rounded rectangle for big regions instead of a pill.
 */
async function annotate(targets) {
  await evaluate(`${PAGE_HELPERS}
    document.querySelectorAll('.__ann').forEach((n) => n.remove())
    for (const t of ${JSON.stringify(targets)}) {
      const rects = (t.specs || [t]).map((s) => __need(s).getBoundingClientRect())
      const x1 = Math.min(...rects.map((r) => r.left)), y1 = Math.min(...rects.map((r) => r.top))
      const x2 = Math.max(...rects.map((r) => r.right)), y2 = Math.max(...rects.map((r) => r.bottom))
      const pad = t.pad ?? 7
      const ring = document.createElement('div')
      ring.className = '__ann'
      Object.assign(ring.style, {
        position: 'absolute', boxSizing: 'border-box', pointerEvents: 'none', zIndex: 2147483646,
        left: (x1 - pad + scrollX) + 'px', top: (y1 - pad + scrollY) + 'px',
        width: (x2 - x1 + 2 * pad) + 'px', height: (y2 - y1 + 2 * pad) + 'px',
        border: '3.5px solid #dc2626', borderRadius: t.shape === 'box' ? '16px' : '9999px',
        boxShadow: '0 0 0 2px rgba(255,255,255,0.9), 0 2px 10px rgba(220,38,38,0.25)',
      })
      document.body.appendChild(ring)
      if (t.label) {
        const badge = document.createElement('div')
        badge.className = '__ann'
        badge.textContent = t.label
        Object.assign(badge.style, {
          position: 'absolute', zIndex: 2147483647, pointerEvents: 'none',
          left: (x1 - pad + scrollX - 13) + 'px', top: (y1 - pad + scrollY - 13) + 'px',
          width: '26px', height: '26px', borderRadius: '50%', background: '#dc2626', color: '#fff',
          font: '700 14px/26px Montserrat, Arial, sans-serif', textAlign: 'center',
          boxShadow: '0 0 0 2px #fff',
        })
        document.body.appendChild(badge)
      }
    }`)
}

/**
 * Screenshots a region: the element matched by `region` (plus `margin`), or the
 * viewport. `maxHeight` trims tall regions; the annotation rings are always kept in frame.
 */
async function shoot(name, { region, margin = 28, maxHeight } = {}) {
  await sleep(500)
  const box = await evaluate(`${PAGE_HELPERS}
    (() => {
      const docW = document.documentElement.scrollWidth
      let x = 0, y = scrollY, w = innerWidth, h = innerHeight
      const spec = ${JSON.stringify(region ?? null)}
      if (spec) {
        const r = __need(spec).getBoundingClientRect()
        x = r.left + scrollX - ${margin}; y = r.top + scrollY - ${margin}
        w = r.width + 2 * ${margin}; h = r.height + 2 * ${margin}
        for (const a of document.querySelectorAll('.__ann')) {
          const ar = a.getBoundingClientRect()
          const ax1 = ar.left + scrollX - 6, ay1 = ar.top + scrollY - 6
          const ax2 = ar.right + scrollX + 6, ay2 = ar.bottom + scrollY + 6
          const nx = Math.min(x, ax1), ny = Math.min(y, ay1)
          w = Math.max(x + w, ax2) - nx; h = Math.max(y + h, ay2) - ny; x = nx; y = ny
        }
      }
      x = Math.max(0, x); y = Math.max(0, y); w = Math.min(w, docW - x)
      return { x, y, width: w, height: h }
    })()`)
  if (maxHeight) box.height = Math.min(box.height, maxHeight)
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { ...box, scale: 1 },
  })
  const png = await sharp(Buffer.from(shot.data, 'base64'))
    .png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
    .toBuffer()
  writeFileSync(join(DEST, `${name}.png`), png)
  console.log(`  ✓ ${name}.png  (${Math.round(png.length / 1024)} KB)`)
}

// ---------- the shots ----------
function nextFriday() {
  const d = new Date()
  d.setHours(18, 45, 0, 0)
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7))
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 7)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

const THEME = 'Space Exploration'
const QOTD = 'If you could visit any planet, which one would you choose and why?'
const SUBJECT = `Gavel Club ${nextFriday()} - ${THEME}`
const EMAIL_HTML = [
  '<p>Hello members,</p>',
  "<p>My name is Olivia, and I will be your Toastmaster for this Friday's meeting.</p>",
  "<p>This week's meeting theme is one that is truly out of this world: <strong><em>Space Exploration</em></strong>.</p>",
  `<p>The Question of the Day will be: "<strong>${QOTD}</strong>"</p>`,
  "<p>Please <strong><u>reply to this email</u></strong> with your answer to the question, and to confirm your role. The agenda link is below, with everyone's roles listed.</p>",
  '<p>Hoping to have a great meeting!</p>',
  '<p>Best regards,<br>Olivia Park, Toastmaster</p>',
].join('<p></p>')

// Stable hooks (data-shot attributes in the app), so restyling never breaks a shot.
const CARD = { css: '[data-shot=auth-card]' }
const WIZARD = { css: '[data-shot=wizard-page]' }
const DASH_CARD = { css: '[data-shot=dashboard-card]' }

const SHOTS = {
  fresh: [
    ['landing', async () => {
      await signOut(); await goto('/')
      await shoot('landing')
    }],
    ['login', async () => {
      await signOut(); await goto('/login')
      await annotate([{ css: 'button', text: 'Sign in with Google' }])
      await shoot('login', { region: CARD })
    }],
    ['guest-list', async () => {
      await signOut(); await goto('/login')
      await annotate([{ specs: [{ css: 'p', text: 'Guest Mailing List' }, { css: 'input[placeholder="Guest Email Address"]' }], shape: 'box', pad: 10 }])
      await shoot('guest-list', { region: CARD })
    }],
    ['signup', async () => {
      await signOut(); await goto('/signup')
      await annotate([
        { css: 'a', text: 'Go back and sign in with Google', label: '1' },
        { specs: [{ css: 'label', text: 'I understand' }, { css: 'button', text: 'Continue without Google' }], shape: 'box', label: '2' },
      ])
      await shoot('signup', { region: CARD })
    }],
    ['complete-profile', async () => {
      await signIn('incomplete')
      await annotate([{ specs: [{ css: 'label[for=firstName]' }, { css: 'input#lastName' }], shape: 'box', pad: 12 }])
      await shoot('complete-profile', { region: CARD })
    }],
    ['pending', async () => {
      await signIn('pending')
      await shoot('pending', { region: CARD })
    }],
    ['dashboard-toastmaster', async () => {
      await signIn('toastmaster'); await goto('/agenda')
      await annotate([{ css: 'a', text: 'Begin Meeting Prep' }])
      await shoot('dashboard-toastmaster', { region: DASH_CARD, maxHeight: 560 })
    }],
    ['wizard', async () => {
      // One pass through the wizard, one screenshot per step.
      await signIn('toastmaster')
      await evaluate(`localStorage.setItem('dtcgc_email_draft', ${JSON.stringify(EMAIL_HTML)});
                      localStorage.setItem('dtcgc_email_subject', ${JSON.stringify(SUBJECT)})`)
      await goto('/agenda/create')
      await waitFor(`document.querySelector('.ProseMirror')`, 'the email editor')
      await annotate([
        { specs: [{ css: 'label', text: 'Subject Line' }, { css: 'input[placeholder="Gavel Club MM/DD - Theme"]' }], label: '1', shape: 'box', pad: 8 },
        { specs: [{ css: 'label', text: 'Email Body' }, { css: '[data-shot=email-editor]' }], label: '2', shape: 'box', pad: 8 },
        { css: 'button', text: 'Next Step', label: '3' },
      ])
      await shoot('step1-draft', { region: WIZARD })

      await evaluate(`document.querySelectorAll('.__ann').forEach((n) => n.remove())`)
      await click({ css: 'button', text: 'Next Step' })
      await waitFor(`__find({ css: 'h2', text: 'Meeting Details' })`, 'step 2')
      await type({ css: 'input[placeholder="e.g., Spring Forward"]' }, THEME)
      await type({ css: 'input[placeholder="e.g., What is your favorite season?"]' }, QOTD)
      await evaluate(`document.activeElement.blur()`)
      await annotate([
        { css: 'select', label: '1', pad: 6 },
        { css: 'input[placeholder="e.g., Spring Forward"]', label: '2', pad: 6 },
        { css: 'input[placeholder="e.g., What is your favorite season?"]', label: '3', pad: 6 },
        { css: 'button', text: 'Next Step', label: '4' },
      ])
      await shoot('step2-settings', { region: WIZARD })

      await evaluate(`document.querySelectorAll('.__ann').forEach((n) => n.remove())`)
      await click({ css: 'button', text: 'Next Step' })
      await waitFor(`__find({ css: 'h2', text: 'Role Assignments' }) && !__find({ css: 'div', text: 'Loading Role History' })`, 'step 3')
      await annotate([
        { specs: [{ css: 'span', text: 'Sergeant at Arms' }, { css: 'select' }], label: '1', pad: 6 },
        { css: 'button', text: 'Regenerate', label: '2', pad: 5 },
        { css: 'h3', text: 'Major Roles', closest: 'div', label: '3', shape: 'box', pad: 6 },
        { css: 'h3', text: 'Attendance List', closest: 'div', label: '4', shape: 'box', pad: 6 },
      ])
      await shoot('step3-roles', { region: WIZARD })

      await evaluate(`document.querySelectorAll('.__ann').forEach((n) => n.remove())`)
      await click({ css: 'button', text: 'Next Step' })
      await waitFor(`__find({ css: 'h2', text: 'Final Review' })`, 'step 4')
      // Look only. This screen's big button creates the sheet and sends the email.
      await annotate([
        { css: 'button', text: 'Create Agenda & Send Email', label: '1', pad: 6 },
        { css: 'button', text: 'Copy to Clipboard', label: '2', pad: 6 },
      ])
      await shoot('step4-finalize', { region: WIZARD })
    }],
  ],
  finalized: [
    ['dashboard-member', async () => {
      await signIn('member'); await goto('/agenda')
      await annotate([{ css: '[data-shot=roster-row]', text: 'Noah', pad: 5 }])
      await shoot('dashboard-member', { region: DASH_CARD })
    }],
    ['dashboard-update', async () => {
      await signIn('toastmaster'); await goto('/agenda')
      await annotate([{ css: 'a', text: 'Update Agenda' }])
      await shoot('dashboard-update', { region: DASH_CARD, maxHeight: 560 })
    }],
    ['update-mode', async () => {
      await signIn('toastmaster'); await goto('/agenda/create?step=3')
      await waitFor(`__find({ css: 'h2', text: 'Role Assignments' }) && !__find({ css: 'div', text: 'Loading Role History' })`, 'update mode')
      // Look only. Save & Close would try to update a (placeholder) Google Sheet.
      await annotate([
        { specs: [{ css: 'span', text: 'Timer' }, { css: 'select', nth: 1 }], label: '1', pad: 6 },
        { css: 'button', text: 'Save & Close', label: '2', pad: 5 },
      ])
      await shoot('update-mode', { region: WIZARD, maxHeight: 820 })
    }],
    ['agenda-example', async () => {
      await goto(pathToFileURL(join(OUT, 'agenda-example.html')).href)
      await shoot('agenda-example', { region: { css: '#sheet' }, margin: 0 })
    }],
  ],
}

// ---------- run ----------
mkdirSync(DEST, { recursive: true })
const profile = join(OUT, 'chrome-profile')
rmSync(profile, { recursive: true, force: true })
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--disable-extensions',
  `--window-size=${WIDTH},${HEIGHT}`, 'about:blank',
], { stdio: 'ignore' })

try {
  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200)
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find((t) => t.type === 'page')
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Chrome did not start.')

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  cdp = new Cdp(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: false })

  console.log(`Capturing "${PHASE}" shots at ${WIDTH}x${HEIGHT} @${SCALE}x from ${BASE}`)
  for (const [name, run] of SHOTS[PHASE]) {
    if (ONLY.length && !ONLY.includes(name)) continue
    await run()
  }
  ws.close()
} finally {
  chrome.kill()
}
