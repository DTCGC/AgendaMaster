/**
 * Tutorial Page Building Blocks
 *
 * Small presentational pieces for the /tutorial article: anchored sections,
 * arrow bullet lists, note boxes, framed screenshots and an example email.
 * Server components only — nothing here needs the browser.
 */
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { ChevronsRight, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";

/** A top-level part of the article ("Part 1 — Getting Started"). */
export function Part({ id, number, title, children }: { id?: string; number: number; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-6 space-y-14">
      <div className="flex items-center gap-4 pt-6">
        <span className="shrink-0 bg-brand-happy-yellow text-brand-loyal-blue text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-full">
          Part {number}
        </span>
        <h2 className="text-2xl md:text-3xl font-black text-brand-loyal-blue tracking-tight">{title}</h2>
        <div className="flex-1 border-t-2 border-brand-loyal-blue/10 hidden sm:block" />
      </div>
      {children}
    </div>
  );
}

/** One self-contained topic, with an anchor and a one-sentence lead. */
export function Section({ id, title, lead, children }: { id: string; title: string; lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-5">
      <div>
        <h3 className="text-2xl font-extrabold text-brand-loyal-blue uppercase tracking-tight">
          <a href={`#${id}`} className="hover:underline decoration-brand-happy-yellow underline-offset-4">{title}</a>
        </h3>
        {lead && <p className="mt-2 text-lg text-gray-600 leading-relaxed">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

/** A smaller heading inside a section. */
export function SubHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="text-lg font-bold text-brand-loyal-blue pt-2">{children}</h4>;
}

export function Bullets({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-3">{children}</ul>;
}

export function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-gray-700 leading-relaxed">
      <ChevronsRight size={20} className="shrink-0 mt-0.5 text-brand-loyal-blue" strokeWidth={2.5} />
      <div>{children}</div>
    </li>
  );
}

/**
 * A numbered list, for things done in order. Numbers are explicit (`n`) so a
 * list can pause for a screenshot and pick up where it left off.
 */
export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="space-y-3">{children}</ol>;
}

export function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li value={n} className="flex gap-3 text-gray-700 leading-relaxed">
      <span aria-hidden className="shrink-0 w-7 h-7 rounded-full bg-brand-loyal-blue text-white text-sm font-bold flex items-center justify-center">
        {n}
      </span>
      <div className="pt-0.5">{children}</div>
    </li>
  );
}

/** A boxed aside: "NOTE: …". */
export function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="border-2 border-brand-loyal-blue/15 bg-white rounded-xl p-5 space-y-2 text-gray-700 leading-relaxed">
      <p className="font-extrabold text-brand-loyal-blue uppercase text-sm tracking-wide">Note: {title}</p>
      <div className="space-y-2">{children}</div>
    </aside>
  );
}

/** A screenshot in the club-blue frame, with a numbered caption underneath. */
export function Figure({ src, alt, number, caption, narrow }: {
  src: StaticImageData; alt: string; number: number; caption: React.ReactNode; narrow?: boolean
}) {
  return (
    <figure className={`space-y-2 ${narrow ? "max-w-sm mx-auto" : ""}`}>
      <div className="border-6 border-brand-loyal-blue rounded-xl overflow-hidden bg-white shadow-md">
        <Image
          src={src}
          alt={alt}
          placeholder="blur"
          sizes={narrow ? "384px" : "(max-width: 800px) 100vw, 768px"}
          className="w-full h-auto"
        />
      </div>
      <figcaption className="text-sm text-gray-500 leading-snug px-1">
        <span className="font-semibold">Figure {number}:</span> {caption}
      </figcaption>
    </figure>
  );
}

/** An example email, laid out like a letter. */
export function ExampleEmail({ subject, children }: { subject: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b px-5 py-3 text-sm text-gray-500">
        <span className="font-semibold text-gray-700">Subject:</span> {subject}
      </div>
      <div className="px-5 py-5 space-y-4 text-gray-800 leading-relaxed">{children}</div>
    </div>
  );
}

/** Shown in place of the members-only parts to everyone who isn't an approved member. */
export function MembersOnly({ pending }: { pending: boolean }) {
  return (
    <div className="bg-white border-2 border-dashed border-brand-loyal-blue/25 rounded-2xl p-8 text-center space-y-4">
      <div className="mx-auto w-14 h-14 rounded-full bg-brand-loyal-blue/10 flex items-center justify-center">
        <Lock size={26} className="text-brand-loyal-blue" />
      </div>
      <h2 className="text-2xl font-black text-brand-loyal-blue tracking-tight">The rest is for club members</h2>
      {pending ? (
        <p className="text-gray-600 max-w-md mx-auto leading-relaxed">
          Using your dashboard, being the Toastmaster and running a meeting are covered in the members&apos; part of
          this tutorial. You&apos;ll be able to read it as soon as an executive approves your account.
        </p>
      ) : (
        <>
          <p className="text-gray-600 max-w-md mx-auto leading-relaxed">
            Using your dashboard, being the Toastmaster and running a meeting are covered in the members&apos; part of
            this tutorial. Sign in to read it.
          </p>
          <Link href="/login" className={buttonVariants({ size: "lg" })}>
            Sign In
          </Link>
        </>
      )}
    </div>
  );
}
