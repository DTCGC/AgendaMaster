/**
 * Account notification emails (approval / rejection). One definition, used
 * by the first send and by the retry, so the two can never drift apart.
 */
import { escapeHtml } from './html'

/** The portal's public URL; AUTH_URL is set in production. */
const PORTAL_URL = (process.env.AUTH_URL || 'https://agendas.coquitlamgavel.com').replace(/\/$/, '')

export type AccountEmailKind = 'approval' | 'rejection'

export function accountEmail(kind: AccountEmailKind, firstName: string): { subject: string; html: string } {
  const approved = kind === 'approval'
  const color = approved ? '#004165' : '#772432'
  const title = approved ? 'Account Approved ✓' : 'Application Update'
  const body = approved
    ? `<p>Your portal account has been verified and fully approved by the club administrative team.</p>
       <p>You can now log in at any time to view upcoming agendas and your assigned roles.</p>
       <p><a href="${PORTAL_URL}" style="display: inline-block; background-color: #004165; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">Open the Portal</a></p>`
    : `<p>Unfortunately, your portal access request has been declined at this time.</p>
       <p>If you believe this was in error, please contact the VP of Education directly.</p>
       <p>Return to <a href="${PORTAL_URL}" style="color: #772432; font-weight: bold;">${PORTAL_URL.replace(/^https?:\/\//, '')}</a></p>`

  return {
    subject: approved
      ? 'Welcome to the Downtown Coquitlam Gavel Club Portal'
      : 'DTCGC Account Application Update',
    html: `
    <div style="font-family: 'Montserrat', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${color}; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0;">${title}</h2>
      </div>
      <div style="padding: 24px; background: #f8f9fa; border-radius: 0 0 12px 12px; border: 1px solid #eee;">
        <p>Hi ${escapeHtml(firstName)},</p>
        ${body}
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666;">Downtown Coquitlam Gavel Club</p>
      </div>
    </div>
  `,
  }
}
