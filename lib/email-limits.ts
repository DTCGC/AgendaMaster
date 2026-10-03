/**
 * Attachment rules for broadcast email, shared by the compose form (so the
 * admin hears about a problem before uploading) and the server action (which
 * is the real check — server actions are public endpoints).
 *
 * Client-safe: no Node or database imports.
 *
 * Why these numbers:
 *   - Resend refuses an email over 40 MB *after* base64 encoding, which
 *     inflates attachments by about 37%.
 *   - The tighter limit is the recipient's mail server. Gmail, Outlook.com and
 *     Yahoo accept 20–25 MB, but older Exchange servers (schools, workplaces)
 *     still default to 10 MB, and anything bigger bounces. 7 MB of files is
 *     about 9.6 MB once encoded, so it fits every one of them.
 *   - The upload itself must fit under the server's request limits: Next's
 *     `serverActions.bodySizeLimit` (next.config.ts) and nginx's
 *     `client_max_body_size` on the Droplet (docs/DEPLOYMENT.md). Both are set
 *     a little above this total to leave room for the message body.
 */

/** Total size of all attachments on one email, before encoding. */
export const MAX_ATTACHMENT_TOTAL_BYTES = 7 * 1024 * 1024

export const MAX_ATTACHMENTS = 10

/**
 * Extensions Resend will not send, so they must be stopped here rather than
 * failing the whole broadcast. Mirrors
 * https://resend.com/docs/knowledge-base/what-attachment-types-are-not-supported
 */
const BLOCKED_EXTENSIONS = new Set([
  'adp', 'app', 'asp', 'bas', 'bat', 'cer', 'chm', 'cmd', 'com', 'cpl', 'crt', 'csh', 'der', 'exe',
  'fxp', 'gadget', 'hlp', 'hta', 'inf', 'ins', 'isp', 'its', 'js', 'jse', 'ksh', 'lib', 'lnk', 'mad',
  'maf', 'mag', 'mam', 'maq', 'mar', 'mas', 'mat', 'mau', 'mav', 'maw', 'mda', 'mdb', 'mde', 'mdt',
  'mdw', 'mdz', 'msc', 'msh', 'msh1', 'msh2', 'mshxml', 'msh1xml', 'msh2xml', 'msi', 'msp', 'mst',
  'ops', 'pcd', 'pif', 'plg', 'prf', 'prg', 'reg', 'scf', 'scr', 'sct', 'shb', 'shs', 'sys', 'ps1',
  'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2', 'tmp', 'url', 'vb', 'vbe', 'vbs', 'vps', 'vsmacros',
  'vss', 'vst', 'vsw', 'vxd', 'ws', 'wsc', 'wsf', 'wsh', 'xnk',
])

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase()
}

/** "2.4 MB", "830 KB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** @returns A user-facing problem with the set of files, or null when they can all be sent. */
export function checkAttachments(files: { name: string; size: number }[]): string | null {
  if (files.length > MAX_ATTACHMENTS) {
    return `Attach at most ${MAX_ATTACHMENTS} files to one email.`
  }
  for (const file of files) {
    if (file.size === 0) return `“${file.name}” is empty.`
    if (BLOCKED_EXTENSIONS.has(extensionOf(file.name))) {
      return `“${file.name}” can't be emailed: mail services block .${extensionOf(file.name)} files. Put it in Google Drive and link to it instead.`
    }
  }
  const total = files.reduce((sum, f) => sum + f.size, 0)
  if (total > MAX_ATTACHMENT_TOTAL_BYTES) {
    return `The attachments add up to ${formatBytes(total)}; the limit is ${formatBytes(MAX_ATTACHMENT_TOTAL_BYTES)} so that every inbox accepts the email. Shrink the photos, or put large files in Google Drive and link to them.`
  }
  return null
}

/**
 * Makes a filename safe for a MIME header: no path parts, no control
 * characters, and never empty.
 */
export function cleanAttachmentName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? ''
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim().slice(0, 150)
  return cleaned || 'attachment'
}
