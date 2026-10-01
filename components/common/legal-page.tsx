/**
 * Layout for the long-form legal pages (/privacy, /tos). The body is plain
 * <section>/<h2>/<p>/<ul> markup; typography comes from `.legal-prose` in
 * app/globals.css, so the two pages can't drift apart.
 */
import { Mail } from "lucide-react"
import { PageShell } from "@/components/common/page"
import { Card } from "@/components/common/surfaces"

export function LegalPage({ title, updated, children }: {
  title: string
  /** "April 1, 2026" */
  updated: string
  children: React.ReactNode
}) {
  return (
    <PageShell width="3xl">
      <Card className="p-6 sm:p-10">
        <header className="mb-8 border-b border-gray-200 pb-6">
          <h1 className="text-3xl font-black tracking-tight text-brand-loyal-blue md:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: {updated}</p>
        </header>
        <div className="legal-prose">{children}</div>
      </Card>
    </PageShell>
  )
}

/** The closing "questions? write to us" box. */
export function LegalContact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-10 rounded-xl border border-brand-loyal-blue/15 bg-brand-loyal-blue/5 p-6 text-center">
      <p className="text-lg font-bold text-brand-loyal-blue">{title}</p>
      <p className="mt-1 text-sm text-gray-600">{children}</p>
      <a
        href="mailto:info@coquitlamgavel.com"
        className="mt-3 inline-flex items-center gap-2 font-bold text-brand-loyal-blue hover:underline"
      >
        <Mail size={16} /> info@coquitlamgavel.com
      </a>
    </div>
  )
}
