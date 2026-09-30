/**
 * Tutorial Page
 *
 * A plain-language guide to AgendaMaster, written for club members rather
 * than developers. Two audiences on one page:
 *   - Part 1 (what the app is, making an account, the parents' mailing list)
 *     is public, so people can read it before they have an account.
 *   - Parts 2 and 3 (the dashboard, being the Toastmaster, meeting day) render
 *     only for approved members. For everyone else those sections are never
 *     rendered at all, so their text is not sent to the browser.
 *
 * The route sits outside /agenda on purpose: the middleware lets everyone in,
 * and this page decides what each visitor may read.
 *
 * Screenshots live in ./screenshots and use made-up members only. They are
 * produced by scripts/tutorial-screenshots (see the README there) — re-run it
 * when the screens they show change.
 */
import Link from "next/link";
import { auth } from "@/auth";
import { Lock } from "lucide-react";
import {
  Part, Section, SubHeading, Bullets, Bullet, Steps, Step, Note, Figure, ExampleEmail, MembersOnly,
} from "@/components/tutorial/blocks";

import landingImg from "./screenshots/landing.png";
import loginImg from "./screenshots/login.png";
import completeProfileImg from "./screenshots/complete-profile.png";
import pendingImg from "./screenshots/pending.png";
import signupImg from "./screenshots/signup.png";
import guestListImg from "./screenshots/guest-list.png";
import dashboardMemberImg from "./screenshots/dashboard-member.png";
import dashboardToastmasterImg from "./screenshots/dashboard-toastmaster.png";
import step1Img from "./screenshots/step1-draft.png";
import step2Img from "./screenshots/step2-settings.png";
import step3Img from "./screenshots/step3-roles.png";
import step4Img from "./screenshots/step4-finalize.png";
import agendaExampleImg from "./screenshots/agenda-example.png";
import dashboardUpdateImg from "./screenshots/dashboard-update.png";
import updateModeImg from "./screenshots/update-mode.png";

export const metadata = {
  title: "Tutorial - DTCGC",
};

/** Table of contents. `members` entries are listed for everyone but only readable by members. */
const CONTENTS: { part: string; members: boolean; items: { id: string; title: string }[] }[] = [
  {
    part: "Getting Started",
    members: false,
    items: [
      { id: "what-is-it", title: "What is AgendaMaster?" },
      { id: "create-account", title: "Creating your account" },
      { id: "mailing-list", title: "For parents & guests: the mailing list" },
      { id: "help", title: "Need help?" },
    ],
  },
  {
    part: "Being the Toastmaster",
    members: true,
    items: [
      { id: "dashboard", title: "Your Meeting Dashboard" },
      { id: "your-job", title: "Your job as Toastmaster" },
      { id: "meeting-theme", title: "Picking a meeting theme" },
      { id: "qotd", title: "Picking a Question of the Day" },
      { id: "write-the-email", title: "Step 1 — Writing the email" },
      { id: "meeting-details", title: "Step 2 — Meeting details" },
      { id: "roles", title: "Step 3 — Roles" },
      { id: "finish", title: "Step 4 — Sending it out" },
      { id: "changing-roles", title: "Changing roles after sending" },
      { id: "good-to-know", title: "Good to know" },
    ],
  },
  {
    part: "On Meeting Day",
    members: true,
    items: [
      { id: "before-the-meeting", title: "Before the meeting" },
      { id: "during-the-meeting", title: "During the meeting" },
      { id: "ending-the-meeting", title: "Ending the meeting" },
      { id: "smoother-meetings", title: "Tips for a smoother meeting" },
    ],
  },
];

export default async function TutorialPage() {
  // The session role is re-read from the database on every request (see the
  // jwt callback in auth.ts), so a removed or not-yet-approved account never
  // counts as a member here.
  const session = await auth();
  const role = session?.user?.role;
  const isMember = role === "MEMBER" || role === "ADMIN";
  const isPending = role === "PENDING" || role === "INCOMPLETE";

  return (
    <div className="flex-1 bg-brand-cool-grey/10 pb-20">
      {/* Header band */}
      <header className="bg-brand-loyal-blue text-white border-b-[6px] border-brand-happy-yellow">
        <div className="max-w-3xl mx-auto px-6 py-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-happy-yellow mb-3">
            Downtown Coquitlam Gavel Club
          </p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight">AgendaMaster Tutorial</h1>
          <p className="mt-4 text-lg text-white/80 leading-relaxed max-w-2xl">
            Everything you need to know about the club&apos;s meeting website — from making an account to running a
            meeting as Toastmaster.
          </p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6">
        {/* Table of contents */}
        <nav aria-label="Contents" className="-mt-6 bg-white rounded-2xl shadow-lg border border-gray-100 p-6 md:p-8">
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-5">In this tutorial</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {CONTENTS.map((group, i) => (
              <div key={group.part}>
                <p className="font-bold text-brand-loyal-blue mb-2 flex items-center gap-1.5">
                  {i + 1}. {group.part}
                  {group.members && !isMember && <Lock size={13} className="text-gray-400" aria-label="Members only" />}
                </p>
                <ul className="space-y-1.5 text-sm">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      {group.members && !isMember ? (
                        <span className="text-gray-400">{item.title}</span>
                      ) : (
                        <a href={`#${item.id}`} className="text-gray-600 hover:text-brand-loyal-blue hover:underline">
                          {item.title}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <article className="mt-14 space-y-24">
          {/* ------------------------------------------------------------------ */}
          <Part id="getting-started" number={1} title="Getting Started">
            <Section
              id="what-is-it"
              title="What is AgendaMaster?"
              lead="AgendaMaster is the Downtown Coquitlam Gavel Club's own website for running our weekly meetings."
            >
              <Bullets>
                <Bullet>
                  It shows every member <strong>who has which role</strong>{" "}at the next meeting — the speakers, the
                  evaluators, the Timer, and everyone else.
                </Bullet>
                <Bullet>
                  It helps each week&apos;s <strong>Toastmaster</strong>{" "}prepare the meeting in a few clicks: it builds
                  the meeting agenda and emails it to the whole club.
                </Bullet>
                <Bullet>
                  It hands out the smaller roles <strong>fairly</strong>, so members who haven&apos;t had a turn in a
                  while go first.
                </Bullet>
                <Bullet>
                  It&apos;s run by the club&apos;s executive team, who approve new accounts and choose the main roles
                  for each meeting.
                </Bullet>
              </Bullets>
              <Figure
                src={landingImg}
                alt="The AgendaMaster home page"
                number={1}
                caption="The AgendaMaster home page. Press “Portal Access” to sign in."
              />
              <Note title="Your Google account">
                <p>
                  AgendaMaster only uses your Google account to create meeting agendas and send the agenda email when
                  it&apos;s your turn to be Toastmaster. It never sells or shares your information. You can read the
                  full <Link href="/privacy" className="text-brand-loyal-blue font-semibold underline">Privacy Policy</Link>{" "}anytime.
                </p>
              </Note>
            </Section>

            <Section
              id="create-account"
              title="Creating Your Account"
              lead="Making an account takes about a minute. After that, an executive approves it and you're in."
            >
              <Steps>
                <Step n={1}>
                  Go to the <Link href="/login" className="text-brand-loyal-blue font-semibold underline">login page</Link>{" "}and
                  press <strong>Sign in with Google</strong>.
                </Step>
              </Steps>
              <Figure
                src={loginImg}
                alt="The login page, with the Sign in with Google button circled"
                number={2}
                narrow
                caption="Press “Sign in with Google” to create your account (or to sign in later)."
              />
              <Note title="No Gmail? No problem">
                <p>
                  You don&apos;t need your own Gmail address. A parent&apos;s or family member&apos;s Google account
                  works fine — you&apos;ll enter <em>your</em>{" "}name in the next step.
                </p>
                <p>
                  Google will ask whether AgendaMaster may create spreadsheets and send email for you.
                  Press <strong>Allow</strong>{" "}(or <strong>Continue</strong>). This is how your agenda gets made and
                  sent when you&apos;re the Toastmaster.
                </p>
              </Note>

              <Steps>
                <Step n={2}>
                  Type in <strong>your own first and last name</strong>{" "}— even if the Google account belongs to someone
                  else. This is the name the club sees on the agenda. Then press <strong>Continue to Registration</strong>.
                </Step>
              </Steps>
              <Figure
                src={completeProfileImg}
                alt="The Complete Your Profile page, with the name boxes circled"
                number={3}
                narrow
                caption="Enter your own name here, not the name of whoever owns the Google account."
              />

              <Steps>
                <Step n={3}>
                  <strong>Wait for approval.</strong>{" "}An executive checks every new account to make sure it belongs to
                  a club member. You&apos;ll get an email once you&apos;re approved. If you leave the waiting page
                  open, it lets you in by itself.
                </Step>
              </Steps>
              <Figure
                src={pendingImg}
                alt="The Account Pending page"
                number={4}
                narrow
                caption="This page means your account is waiting for an executive to approve it."
              />

              <SubHeading>What if I can&apos;t use Google at all?</SubHeading>
              <p className="text-gray-700 leading-relaxed">
                A few members have no way to use any Google account. For them, there&apos;s a{" "}
                <strong>Register with email instead</strong>{" "}link under the Google button on the login page. It lets
                you make an account with an email address and a password.
              </p>
              <Bullets>
                <Bullet>
                  Google is still <strong>strongly recommended</strong>. There is no &ldquo;forgot password&rdquo;
                  button: if you lose your password, an executive has to help you start over.
                </Bullet>
                <Bullet>
                  To continue, tick the box saying you have no way to use Google, and
                  press <strong>Continue without Google</strong>. Then choose your email and password, and carry on
                  with steps 2 and 3 above.
                </Bullet>
                <Bullet>
                  To sign in later, open the <strong>Email &amp; Password</strong>{" "}section of the login page.
                </Bullet>
                <Bullet>
                  When you&apos;re the Toastmaster, the club&apos;s own account sends the agenda email for you. Replies
                  still come straight to you.
                </Bullet>
              </Bullets>
              <Figure
                src={signupImg}
                alt="The Register Without Google page"
                number={5}
                narrow
                caption="(1) Most people should go back and use Google. (2) Only if you truly can't, tick the box and continue."
              />
            </Section>

            <Section
              id="mailing-list"
              title="For Parents & Guests: The Mailing List"
              lead="Parents and guests can get every agenda email without making an account."
            >
              <Bullets>
                <Bullet>
                  On the <Link href="/login" className="text-brand-loyal-blue font-semibold underline">login page</Link>,
                  type an email address into the <strong>Guest Mailing List</strong>{" "}box at the bottom and press the
                  arrow button. That&apos;s it — no account, no password, no approval needed.
                </Bullet>
                <Bullet>
                  That address will then receive <strong>every week&apos;s agenda email</strong>{" "}from the Toastmaster,
                  plus club announcements from the executive team.
                </Bullet>
                <Bullet>
                  It&apos;s perfect for parents who want to know what their child is doing at the next meeting.
                </Bullet>
                <Bullet>
                  To stop getting the emails, ask an executive to take the address off the list.
                </Bullet>
              </Bullets>
              <Figure
                src={guestListImg}
                alt="The login page, with the Guest Mailing List box circled"
                number={6}
                narrow
                caption="The Guest Mailing List sign-up, at the bottom of the login page."
              />
            </Section>

            <Section id="help" title="Need Help?">
              <p className="text-gray-700 leading-relaxed">
                If something doesn&apos;t work, or you&apos;re not sure what to do, talk to any executive at a meeting,
                or email <a href="mailto:info@coquitlamgavel.com" className="text-brand-loyal-blue font-semibold underline">info@coquitlamgavel.com</a>.
              </p>
            </Section>
          </Part>

          {/* ------------------------------------------------------------------ */}
          {isMember ? (
            <>
              <Part id="toastmaster" number={2} title="Being the Toastmaster">
                <Section
                  id="dashboard"
                  title="Your Meeting Dashboard"
                  lead="After you sign in, you land on your dashboard. It shows the next meeting and who has which role."
                >
                  <Bullets>
                    <Bullet>
                      The executive team chooses the <strong>major roles</strong>: the Toastmaster, the three Speakers,
                      the Table Topics Master and the Quizmaster.
                    </Bullet>
                    <Bullet>
                      The rest — the <strong>minor roles</strong>, like Timer, Grammarian and the Evaluators — are
                      filled in when that week&apos;s Toastmaster prepares the agenda. Until then, the dashboard says
                      &ldquo;Waiting for Agenda Details&rdquo;.
                    </Bullet>
                    <Bullet>
                      Look for your name to find your role. If a role says <strong>TBD</strong>, nobody has it yet.
                    </Bullet>
                    <Bullet>
                      To sign out, use the <strong>Sign Out</strong>{" "}button in the top-right corner.
                    </Bullet>
                  </Bullets>
                  <Figure
                    src={dashboardMemberImg}
                    alt="The Meeting Dashboard showing the full roster, with one member's role circled"
                    number={7}
                    caption="The dashboard once the agenda is ready. Here, Noah can see he's the Sergeant at Arms."
                  />
                </Section>

                <Section
                  id="your-job"
                  title="Your Job as Toastmaster"
                  lead="Plan and run the meeting, and keep it engaging and organized."
                >
                  <p className="text-gray-700 leading-relaxed">
                    The good news: AgendaMaster does the busywork. It hands out the minor roles, builds the agenda and
                    emails everyone. Your part is the creative part — a good theme, a good question, a friendly email,
                    and a well-run meeting.
                  </p>
                  <p className="text-gray-700 leading-relaxed">
                    When you&apos;re the Toastmaster for the next meeting, a yellow <strong>Your Role: Toastmaster</strong>{" "}box
                    appears on your dashboard. Press <strong>Begin Meeting Prep</strong>{" "}to start. If you were told
                    you&apos;re the Toastmaster but don&apos;t see the box, contact an executive.
                  </p>
                  <Figure
                    src={dashboardToastmasterImg}
                    alt="The Toastmaster box on the dashboard, with Begin Meeting Prep circled"
                    number={8}
                    caption="Only the next meeting's Toastmaster sees this box."
                  />
                  <p className="text-gray-700 leading-relaxed">
                    Before you press it, pick your <strong>meeting theme</strong>{" "}and your <strong>Question of the
                    Day</strong>. Here&apos;s how.
                  </p>
                </Section>

                <Section
                  id="meeting-theme"
                  title="Picking a Meeting Theme"
                  lead="The theme is the general topic of the meeting. The Speakers and the Table Topics Master build their speeches and questions around it."
                >
                  <p className="text-gray-700 leading-relaxed">The theme is up to you, but keep these rules in mind:</p>
                  <Steps>
                    <Step n={1}>
                      <strong>Make it new.</strong>{" "}Try to pick a theme the club hasn&apos;t done before. Not sure? Ask
                      an executive.
                    </Step>
                    <Step n={2}>
                      <strong>Keep it broad.</strong>{" "}Everyone should be able to talk about it. Themes
                      like <em>Oceans</em>, <em>the Industrial Revolution</em>{" "}or <em>Space Exploration</em>{" "}work well.
                      Themes like <em>Concrete</em>{" "}or <em>the Chinese Zodiac</em>{" "}are too narrow — some people might
                      know nothing about them. Remember: the theme should work for <u>everyone</u>!
                    </Step>
                  </Steps>
                  <Note title="Club rules">
                    <p>
                      The theme must follow the club&apos;s rules and code of conduct. Breaking the code of conduct may
                      lead to being suspended from club activities.
                    </p>
                  </Note>
                </Section>

                <Section
                  id="qotd"
                  title="Picking a Question of the Day"
                  lead="Every member answers the Question of the Day (QOTD). You'll use their answers to move between roles during the meeting, so choose it carefully."
                >
                  <Steps>
                    <Step n={1}>
                      <strong>Not too simple.</strong>{" "}&ldquo;Do you like music?&rdquo; is a yes-or-no question.
                      Change a few words — &ldquo;What type of music do you like?&rdquo; — and every member&apos;s
                      answer becomes different and interesting.
                    </Step>
                    <Step n={2}>
                      <strong>Easy to answer.</strong>{" "}Avoid questions that might get &ldquo;I don&apos;t know&rdquo;
                      from someone.
                    </Step>
                    <Step n={3}>
                      <strong>Try to avoid questions that:</strong>{" "}are too personal, have an obvious right answer,
                      make people think about something negative (like &ldquo;What is your biggest
                      failure?&rdquo;), or are inside jokes.
                    </Step>
                  </Steps>
                </Section>

                <Section
                  id="write-the-email"
                  title="Step 1 — Writing the Email"
                  lead="The first screen is where you write the email that goes out to the whole club."
                >
                  <Figure
                    src={step1Img}
                    alt="Step 1 of the Agenda Engine, with the subject line, the email body and the Next Step button circled"
                    number={9}
                    caption="(1) The subject line. (2) The email itself. (3) Press Next Step when you're done."
                  />
                  <Bullets>
                    <Bullet>
                      <strong>Subject line:</strong>{" "}use the pattern <em>Gavel Club MM/DD - Theme</em>. For example:
                      &ldquo;Gavel Club 10/02 - Space Exploration&rdquo;.
                    </Bullet>
                    <Bullet>
                      <strong>Email body:</strong>{" "}write your message in the big box. The buttons along the top
                      make text <strong>bold</strong>, <em>italic</em>, crossed out, or into a list.
                    </Bullet>
                    <Bullet>
                      <strong>You don&apos;t need to add the agenda link or anyone&apos;s email address.</strong>{" "}The
                      link to the agenda is added to the bottom of your email for you, and the email goes to every
                      member and everyone on the guest mailing list.
                    </Bullet>
                  </Bullets>

                  <SubHeading>How to lay out the email</SubHeading>
                  <p className="text-gray-700 leading-relaxed">Your email should cover these four things, in order:</p>
                  <Steps>
                    <Step n={1}><strong>Introduce yourself</strong>{" "}as this week&apos;s Toastmaster.</Step>
                    <Step n={2}><strong>The meeting theme.</strong></Step>
                    <Step n={3}><strong>The Question of the Day.</strong></Step>
                    <Step n={4}><strong>A reminder to reply</strong>{" "}with an answer to the question, and to confirm their role.</Step>
                  </Steps>
                  <p className="text-gray-700 leading-relaxed">Here&apos;s an example:</p>
                  <ExampleEmail subject="Gavel Club 10/02 - Space Exploration">
                    <p>Hello members,</p>
                    <p>My name is Olivia, and I will be your Toastmaster for this Friday&apos;s meeting.</p>
                    <p>
                      This week&apos;s meeting theme is one that is truly out of this
                      world: <strong><em>Space Exploration</em></strong>.
                    </p>
                    <p>
                      The Question of the Day will be: &ldquo;<strong>If you could visit any planet, which one would you
                      choose and why?</strong>&rdquo;
                    </p>
                    <p>
                      Please <strong><u>reply to this email</u></strong>{" "}with your answer to the question, and to
                      confirm your role. The agenda link is below, with everyone&apos;s roles listed.
                    </p>
                    <p>Hoping to have a great meeting!</p>
                    <p>Best regards,<br />Olivia Park, Toastmaster</p>
                    <p className="text-sm text-gray-400 italic border-t pt-3">
                      (The agenda link is added here automatically.)
                    </p>
                  </ExampleEmail>

                  <SubHeading>Tips for a great email</SubHeading>
                  <Bullets>
                    <Bullet><strong>Be formal.</strong>{" "}Skip the slang and casual language.</Bullet>
                    <Bullet><strong>Leave a blank line</strong>{" "}between each part of the email.</Bullet>
                    <Bullet><strong>Be concise.</strong>{" "}Save the extra chatter for the meeting.</Bullet>
                    <Bullet>
                      <strong>Make important information stand out</strong>{" "}with <strong>bold</strong>,{" "}
                      <em>italics</em>{" "}or <u>underlining</u>, so members don&apos;t miss it.
                    </Bullet>
                    <Bullet><strong>Proofread.</strong>{" "}Fix spelling and grammar mistakes, and rewrite anything unclear.</Bullet>
                    <Bullet>
                      <strong>Send it early</strong>{" "}— as soon as you can after the previous meeting. The Speakers and
                      the Table Topics Master need time to prepare.
                    </Bullet>
                  </Bullets>
                  <Note title="Using AI">
                    <p>
                      <strong>Never</strong>{" "}use AI tools such as ChatGPT, Gemini, Copilot or Claude to write your
                      email. Doing so may be treated as breaking club rules. Using them to <strong>brainstorm</strong>{" "}ideas
                      (like a theme or a question) is fine. If you have questions about using AI safely, ask an executive.
                    </p>
                  </Note>
                </Section>

                <Section
                  id="meeting-details"
                  title="Step 2 — Meeting Details"
                  lead="The second screen asks for three things."
                >
                  <Figure
                    src={step2Img}
                    alt="Step 2 of the Agenda Engine, with the meeting type, theme, question and Next Step button circled"
                    number={10}
                    caption="(1) The meeting type. (2) Your theme. (3) Your Question of the Day. (4) Next Step."
                  />
                  <Steps>
                    <Step n={1}>
                      <strong>Meeting Type.</strong>{" "}Leave this on <em>Regular Meeting</em>, unless the executives tell
                      you a guest speaker is coming — then choose <em>Guest Education Session</em>. The guest takes the
                      place of Speaker 3 on the agenda.
                    </Step>
                    <Step n={2}><strong>Meeting Theme.</strong></Step>
                    <Step n={3}><strong>Question of the Day.</strong></Step>
                  </Steps>
                  <p className="text-gray-700 leading-relaxed">
                    The <strong>Next Step</strong>{" "}button stays grey until both the theme and the question are filled in.
                  </p>
                </Section>

                <Section
                  id="roles"
                  title="Step 3 — Roles"
                  lead="The third screen shows every role for the meeting. The minor roles are already filled in for you."
                >
                  <Figure
                    src={step3Img}
                    alt="Step 3 of the Agenda Engine, with a role dropdown, the Regenerate button, the major roles and the attendance list circled"
                    number={11}
                    caption="(1) Change any minor role with its dropdown. (2) Reshuffle them all. (3) The major roles. (4) Members without a role."
                  />
                  <Bullets>
                    <Bullet>
                      <strong>Minor roles are picked fairly.</strong>{" "}Members who haven&apos;t had a role in a while
                      get one first, so everyone gets their turn. Look them over — you can change any of them with its
                      dropdown (1).
                    </Bullet>
                    <Bullet>
                      <strong>Role requests:</strong>{" "}if a member asks you for a certain role, try your best to make it
                      happen. If you can&apos;t, let them know politely and explain why.
                    </Bullet>
                    <Bullet>
                      <strong>Regenerate</strong>{" "}(2) throws out the minor roles and picks a fresh set. It asks you to
                      confirm first, and nothing is saved until you finish.
                    </Bullet>
                    <Bullet>
                      <strong>Major roles</strong>{" "}(3) are chosen by the executive team, so they&apos;re locked. Leave
                      the <strong>Edit Major Roles</strong>{" "}box unticked unless an executive asks you to change one.
                    </Bullet>
                    <Bullet>
                      The <strong>Backup Speaker</strong>{" "}only speaks if one of the three Speakers can&apos;t. They can
                      still have a minor role too.
                    </Bullet>
                    <Bullet>
                      The <strong>Attendance List</strong>{" "}(4) shows members who don&apos;t have a role. If someone
                      can&apos;t make it, these are the first people to ask to fill in. These names are also listed on
                      the agenda under &ldquo;No Roles&rdquo;.
                    </Bullet>
                    <Bullet>
                      Each member can only hold one role. If there truly aren&apos;t enough people, ticking{" "}
                      <strong>Allow Multiple Roles</strong>{" "}lets you give someone a second one.
                    </Bullet>
                  </Bullets>
                </Section>

                <Section
                  id="finish"
                  title="Step 4 — Sending It Out"
                  lead="The last screen shows a summary. When everything looks right, press the big button — once."
                >
                  <Figure
                    src={step4Img}
                    alt="Step 4 of the Agenda Engine, with the Create Agenda & Send Email button and the Copy to Clipboard button circled"
                    number={12}
                    caption="(1) Creates the agenda and emails it to the club. (2) A backup copy, just in case."
                  />
                  <p className="text-gray-700 leading-relaxed">
                    Pressing <strong>Create Agenda &amp; Send Email</strong>{" "}(1) does everything at once:
                  </p>
                  <Bullets>
                    <Bullet>
                      It creates the meeting agenda as a <strong>Google Sheet</strong>{" "}in your Google account, with
                      every role, the theme and the Question of the Day filled in. Anyone with the link can view it,
                      but nobody can change it by accident.
                    </Bullet>
                    <Bullet>
                      It sends your email, from <strong>your own Gmail</strong>, to every member and everyone on the
                      guest mailing list, with the agenda link added at the bottom. Nobody can see anyone else&apos;s
                      email address.
                    </Bullet>
                    <Bullet>Replies come straight to your inbox.</Bullet>
                    <Bullet>The dashboard updates, so every member can see their role right away.</Bullet>
                  </Bullets>
                  <p className="text-gray-700 leading-relaxed">
                    When it&apos;s done, you&apos;ll see an <strong>Open Agenda Sheet</strong>{" "}button. If something
                    goes wrong instead, a red message explains what happened. Press <strong>Copy to
                    Clipboard</strong>{" "}(2) to save your email and the role list, and contact an executive.
                  </p>
                  <Figure
                    src={agendaExampleImg}
                    alt="An example meeting agenda in Google Sheets"
                    number={13}
                    caption="An example of the finished agenda (all names are made up). Members without a role are listed under “No Roles”."
                  />
                </Section>

                <Section
                  id="changing-roles"
                  title="Changing Roles After Sending"
                  lead="Someone can't make it, or two members want to swap? No problem — you can still change the roles after the email has gone out."
                >
                  <Steps>
                    <Step n={1}>
                      Go back to your dashboard. The button in the Toastmaster box now says <strong>Update Agenda</strong>.
                    </Step>
                  </Steps>
                  <Figure
                    src={dashboardUpdateImg}
                    alt="The Toastmaster box on the dashboard, with the Update Agenda button circled"
                    number={14}
                    caption="After the agenda is sent, the button changes to “Update Agenda”."
                  />
                  <Steps>
                    <Step n={2}>
                      It opens the roles screen only, with the roles exactly as you left them. Change whatever you
                      need (1), then press <strong>Save &amp; Close</strong>{" "}(2).
                    </Step>
                  </Steps>
                  <Figure
                    src={updateModeImg}
                    alt="The roles screen in update mode, with a role dropdown and the Save & Close button circled"
                    number={15}
                    caption="(1) Change a role. (2) Save & Close updates the dashboard and the agenda sheet."
                  />
                  <Bullets>
                    <Bullet>
                      The dashboard and the agenda sheet both update right away. A note about the change is added to
                      the <strong>Changelog</strong>{" "}at the bottom of the sheet for you — for
                      example, <em>[Hannah: Timer ---&gt; Grammarian]</em>.
                    </Bullet>
                    <Bullet>
                      The email is <strong>not</strong>{" "}sent again, so let the members whose roles changed know
                      yourself.
                    </Bullet>
                    <Bullet>
                      <strong>Don&apos;t type changes straight into the Google Sheet.</strong>{" "}At 6:30 PM on meeting
                      day, the sheet is reset to match AgendaMaster, so anything typed into it by hand disappears.
                      Always use <strong>Update Agenda</strong>.
                    </Bullet>
                    <Bullet>Executives can also change roles for you if you&apos;re stuck.</Bullet>
                  </Bullets>
                </Section>

                <Section id="good-to-know" title="Good to Know" lead="A few small things that can save you a headache.">
                  <Bullets>
                    <Bullet>
                      <strong>Your email draft is saved as you type</strong>, on the computer or phone you&apos;re
                      using. You can close the page and come back later — but the draft won&apos;t follow you to a
                      different device. It&apos;s cleared once the email is sent.
                    </Bullet>
                    <Bullet>
                      The email can only be sent <strong>once</strong>. Going through the steps again later only
                      updates the agenda sheet; it never sends a second email.
                    </Bullet>
                    <Bullet>If you type &ldquo;DCGC&rdquo; by mistake, it&apos;s fixed to &ldquo;DTCGC&rdquo; for you.</Bullet>
                    <Bullet>
                      Only the Toastmaster of the <strong>next</strong>{" "}meeting can prepare its agenda. Everyone else
                      sees a &ldquo;Toastmaster Access Only&rdquo; message.
                    </Bullet>
                    <Bullet>
                      The meeting stays on the dashboard until about 9 PM on meeting day. After that, the next meeting
                      takes its place.
                    </Bullet>
                    <Bullet>
                      A few rows on the agenda are always the same people — Roles for Next Meeting, the Business
                      Meeting and Dismissal — so you don&apos;t need to fill them in.
                    </Bullet>
                  </Bullets>
                </Section>
              </Part>

              <Part id="meeting-day" number={3} title="On Meeting Day">
                <Section
                  id="before-the-meeting"
                  title="Before the Meeting"
                  lead="Arrive 15 minutes early to get ready and help the executive team set up."
                >
                  <Bullets>
                    <Bullet>
                      Help set up the tables and chairs, turn on the projector, and hand out tutorial sheets, cue cards
                      and evaluation sheets.
                    </Bullet>
                    <Bullet>
                      Put the agenda up on the projector, and check that <u>every major and minor role</u>{" "}is here.
                    </Bullet>
                    <Bullet>
                      If someone is missing, a role may need to change at the last minute. The executives will try to
                      help. If none are free, ask the members on the <strong>Attendance List</strong>{" "}whether anyone
                      would like to take the role, and use <strong>Update Agenda</strong>{" "}to change it.
                    </Bullet>
                    <Bullet>
                      After the Sergeant at Arms introduces you, head up and introduce yourself, your role as
                      Toastmaster, <u>the meeting theme and the Question of the Day</u>.
                    </Bullet>
                  </Bullets>
                </Section>

                <Section id="during-the-meeting" title="During the Meeting">
                  <SubHeading>Moving between roles</SubHeading>
                  <Bullets>
                    <Bullet>
                      When you call up the next person, don&apos;t explain what their role does — they&apos;ll explain
                      it themselves. For the same reason, don&apos;t evaluate the speeches yourself.
                    </Bullet>
                    <Bullet>
                      <strong>Never</strong>{" "}say &ldquo;next up, we have…&rdquo; or anything like it. Use the Question
                      of the Day instead (see below).
                    </Bullet>
                    <Bullet>
                      Be encouraging. If the audience is shy about clapping, lead the applause after each role. Keep
                      transitions <u>short, but meaningful</u>.
                    </Bullet>
                  </Bullets>
                  <Note title="The QOTD method">
                    <p>
                      The Question of the Day is made for moving between roles. Since everyone answers it, you can
                      share the next person&apos;s answer as you introduce them, and add a light comment of your own.
                      It helps members get to know each other, and keeps transitions from feeling too short.
                    </p>
                  </Note>

                  <SubHeading>Break time</SubHeading>
                  <Bullets>
                    <Bullet>
                      To start the break, tap the gavel <strong>once</strong>{" "}on a hard surface. To end it, tap it{" "}
                      <strong>three times</strong>.
                    </Bullet>
                    <Bullet>Keep an eye on the clock, and end the break on time.</Bullet>
                  </Bullets>

                  <SubHeading>Keeping the meeting on time</SubHeading>
                  <Bullets>
                    <Bullet>
                      Work with the Timer. If things are running long, remind people on stage to keep it moving — for
                      example, by cutting extra chatter or wrapping up a long Quizmaster or Table Topics session.
                    </Bullet>
                  </Bullets>
                </Section>

                <Section id="ending-the-meeting" title="Ending the Meeting">
                  <Bullets>
                    <Bullet>
                      Thank all the members and guests. Remind members to stack their own chairs and to sign out with
                      their parents at the exit.
                    </Bullet>
                    <Bullet>End the meeting by tapping the gavel <strong>three times</strong>{" "}on the desk.</Bullet>
                    <Bullet>
                      Stay for a bit afterwards to help clean up the tables and equipment, and to talk with the
                      executive team about how the meeting went.
                    </Bullet>
                  </Bullets>
                </Section>

                <Section
                  id="smoother-meetings"
                  title="Tips for a Smoother Meeting"
                  lead="Want to go the extra mile? Try these."
                >
                  <Bullets>
                    <Bullet>
                      Before the meeting, ask the Speakers what their speeches are about. Then you can introduce each
                      one with a short preview — like the description of a movie.
                    </Bullet>
                    <Bullet>
                      Mix up your transitions. Small highlights, good wishes and a bit of light humour all add variety.
                    </Bullet>
                    <Bullet>Even when you&apos;re off stage, help make sure members are behaving well.</Bullet>
                    <Bullet>Before the meeting ends, sum up how it went or share a few thoughts.</Bullet>
                  </Bullets>
                </Section>
              </Part>
            </>
          ) : (
            <MembersOnly pending={isPending} />
          )}
        </article>

        <footer className="mt-24 pt-8 border-t border-gray-200 text-xs text-gray-400 leading-relaxed space-y-2">
          <p>
            This tutorial is an independent resource made for Downtown Coquitlam Gavel Club members. It is not an
            official publication of Toastmasters International, and is not endorsed by them. Toastmasters
            International and its emblem are trademarks of Toastmasters International, Inc.
          </p>
          <p>Every name and screenshot in this tutorial uses made-up example members.</p>
        </footer>
      </div>
    </div>
  );
}
