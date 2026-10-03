/**
 * Link Preview Card (Tiptap node)
 *
 * The email-safe stand-in for an embed: a bordered card with the page's
 * image, site name, title and description, every part linking to the page.
 * Email clients drop iframes, scripts and stylesheets, so the card is a
 * table with inline styles only — the markup Gmail, Outlook and Apple Mail
 * all render the same. The editor shows the exact HTML that gets sent.
 *
 * The card's fields ride along as data-* attributes so the editor can read
 * a saved draft back in; only http(s) addresses survive that parse.
 */
import { Node } from '@tiptap/react'
import type { DOMOutputSpec } from '@tiptap/pm/model'
import { normalizeWebUrl } from '@/lib/web-url'

export type LinkPreviewAttrs = {
  href: string
  title: string
  description: string
  image: string | null
  siteName: string
}

const FONT = 'font-family: Arial, Helvetica, sans-serif;'
const CARD_WIDTH = 520

/** The card's markup, shared by the editor and the email. */
export function linkPreviewSpec({ href, title, description, image, siteName }: LinkPreviewAttrs): DOMOutputSpec {
  const link = { href, target: '_blank', rel: 'noopener noreferrer' }
  const rows: DOMOutputSpec[] = []
  if (image) {
    rows.push(['tr', ['td', { style: 'padding: 0;' },
      ['a', { ...link, style: 'display: block; text-decoration: none;' },
        ['img', {
          src: image,
          alt: title,
          width: String(CARD_WIDTH),
          style: `display: block; width: 100%; max-width: ${CARD_WIDTH}px; height: auto; border: 0; border-radius: 11px 11px 0 0;`,
        }],
      ],
    ]])
  }
  const text: DOMOutputSpec[] = [
    ['div', { style: `${FONT} font-size: 12px; color: #6b7280; margin: 0 0 4px 0;` }, siteName],
    ['div', { style: `${FONT} font-size: 16px; font-weight: bold; color: #004165; line-height: 1.3; margin: 0 0 4px 0;` }, title],
  ]
  if (description) {
    text.push(['div', { style: `${FONT} font-size: 14px; color: #4b5563; line-height: 1.45; margin: 0;` }, description])
  }
  rows.push(['tr', ['td', { style: 'padding: 14px 16px;' },
    ['a', { ...link, style: 'display: block; text-decoration: none; color: #1f2937;' }, ...text],
  ]])

  return ['table', {
    'data-link-preview': '',
    'data-href': href,
    'data-title': title,
    'data-description': description,
    'data-image': image ?? '',
    'data-site-name': siteName,
    role: 'presentation',
    width: '100%',
    cellpadding: '0',
    cellspacing: '0',
    border: '0',
    style: `width: 100%; max-width: ${CARD_WIDTH}px; border-collapse: separate; border: 1px solid #d1d5db; border-radius: 12px; margin: 16px 0;`,
  }, ['tbody', ...rows]]
}

const fromData = (name: string) => ({
  rendered: false,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? '',
})

export const LinkPreviewCard = Node.create({
  name: 'linkPreview',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      href: { default: '', ...fromData('href') },
      title: { default: '', ...fromData('title') },
      description: { default: '', ...fromData('description') },
      image: {
        default: null,
        rendered: false,
        parseHTML: (el: HTMLElement) => normalizeWebUrl(el.getAttribute('data-image') ?? ''),
      },
      siteName: { default: '', ...fromData('site-name') },
    }
  },

  parseHTML() {
    return [{
      tag: 'table[data-link-preview]',
      getAttrs: (el) => (normalizeWebUrl((el as HTMLElement).getAttribute('data-href') ?? '') ? null : false),
    }]
  },

  renderHTML({ node }) {
    return linkPreviewSpec(node.attrs as LinkPreviewAttrs)
  },
})
