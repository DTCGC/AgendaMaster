/**
 * Agenda Creation Wizard
 *
 * The core 4-step workflow for preparing a club meeting:
 *   Step 1 — Draft:    WYSIWYG email composition (auto-saved to localStorage)
 *   Step 2 — Settings: Meeting type, theme, and Question of the Day
 *   Step 3 — Roles:    Auto-assigned minor roles + admin-locked major roles
 *   Step 4 — Finalize: Execute the Google Sheet + Gmail pipeline
 *
 * Supports two entry modes:
 *   - Full flow (step=1): Toastmaster goes through all 4 steps
 *   - Update mode (step=3): Jump directly to roles for quick roster edits
 *
 * Wrapped in <Suspense> for client-side useSearchParams() compatibility.
 */
'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CircleHelp, ExternalLink, Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Input, NativeSelect } from '@/components/ui/input'
import { Label, FieldHint } from '@/components/ui/label'
import { SectionLabel } from '@/components/common/page'
import { Badge, Notice, Spinner } from '@/components/common/surfaces'
import { cn } from '@/lib/utils'
import TiptapEditor from './tiptap-editor'
import { fetchRoleAssignments, fetchMeetingSettings, formatDraft, saveFinalAgenda, regenerateRoster } from '@/app/actions/agenda'
import { executeAgendaPipeline, type PipelineResult } from '@/app/actions/execute-agenda'
import { MAJOR_ROLES, BACKUP_SPEAKER, FIXED_ROLES, ROSTER_ORDER } from '@/lib/roles'
import type { UserWithDisplayName, PreAssignedMajorRole } from '@/lib/types'

// Empty default — most Toastmasters write the email from scratch each week
const DEFAULT_TEMPLATE = ``

function WizardContent({ meetingId }: { meetingId: string }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialStepParam = parseInt(searchParams.get('step') || '1')

  const [step, setStep] = useState(initialStepParam)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailDraft, setEmailDraft] = useState('')
  // '' = not yet resolved against the database. Like theme/qotd, the stored
  // choice is rehydrated after mount; the sentinel keeps a fast "Save & Close"
  // in update mode from stamping the default over a stored Education choice
  // (the server treats '' as "keep what's stored").
  const [meetingType, setMeetingType] = useState('')
  const [meetingTheme, setMeetingTheme] = useState('')
  const [meetingQotd, setMeetingQotd] = useState('')
  // Admin-entered, read-only here. Non-empty + meeting type "Education" is
  // what activates the Guest Speaker override on the sheet.
  const [guestSpeakerName, setGuestSpeakerName] = useState('')
  
  // Roles Data
  const [loadingRoles, setLoadingRoles] = useState(true)
  // Every editable role slot — minor AND major. Major roles are only writable
  // when `allowMajorRoleEdit` is on, but they live in the same map so that
  // conflict detection and attendance derivation see one unified picture.
  const [roleSlots, setRoleSlots] = useState<Record<string, UserWithDisplayName | null>>({})
  // Full club roster (deduped, sorted). The Attendance List is derived from this
  // rather than stored, so it can never drift out of sync with the role dropdowns.
  const [roster, setRoster] = useState<UserWithDisplayName[]>([])
  const [preAssigned, setPreAssigned] = useState<PreAssignedMajorRole[]>([])

  // Held OUTSIDE roleSlots on purpose. Standby duty confers no obligations, so
  // the holder must stay eligible for a minor role and stay on the Attendance
  // List — keeping it out of the map means every derivation below ignores it
  // automatically, instead of needing an exception in each one.
  const [backupSpeaker, setBackupSpeaker] = useState<UserWithDisplayName | null>(null)

  // Server-side truth for the major roles, captured at load. Toggling the
  // override back OFF restores these, so a discarded edit disappears from the
  // screen instead of lingering as a change that will never be saved.
  const majorRoleBaseline = useRef<Record<string, UserWithDisplayName | null>>({})
  const backupSpeakerBaseline = useRef<UserWithDisplayName | null>(null)

  const [allowDoubleRoles, setAllowDoubleRoles] = useState(false)
  // Guard rail, not a state mirror: major roles are admin territory, so this
  // always starts OFF and must be deliberately switched on each session.
  const [allowMajorRoleEdit, setAllowMajorRoleEdit] = useState(false)
  const [clipboardStatus, setClipboardStatus] = useState('Copy to Clipboard')
  const [confirmingRegen, setConfirmingRegen] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [conflictError, setConflictError] = useState<string | null>(null)

  // --- Derived Attendance List ---
  // A member is "attending without a role" only when they hold NO role at all —
  // neither a minor/major dropdown slot nor a locked pre-assigned major role.
  // Deriving this (instead of pushing/popping a separate array) is what keeps
  // double-role holders off the list when one of their two roles is reassigned.
  const assignedUserIds = new Set<string>()
  Object.values(roleSlots).forEach(u => { if (u) assignedUserIds.add(u.id) })
  preAssigned.forEach(a => { if (a.userId) assignedUserIds.add(a.userId) })
  const unassigned = roster.filter(u => !assignedUserIds.has(u.id))

  // --- Guest Speaker Override (derived) ---
  // Mirrors the server-side gating in buildRoleMap(): BOTH the admin-entered
  // guest name AND the Toastmaster's "Guest Education Session" choice must be
  // present. Uses the LIVE meetingType selection (falling back to the stored
  // value via rehydration) because that is exactly what the pipeline will
  // persist and gate on when this wizard executes.
  const guestEducationActive = meetingType === 'Education' && guestSpeakerName.trim() !== ''

  // Step 4 execution state
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<PipelineResult | null>(null)

  // Load Initial Setup on Mount
  useEffect(() => {
    const savedDraft = localStorage.getItem('dtcgc_email_draft')
    const savedSubject = localStorage.getItem('dtcgc_email_subject')
    if (savedDraft) {
      setEmailDraft(savedDraft)
    } else {
      setEmailDraft(DEFAULT_TEMPLATE)
    }
    if (savedSubject) {
      setEmailSubject(savedSubject)
    }

    // Rehydrate Step 2 from the database. Update mode (`?step=3`) never renders
    // Step 2, so without this the theme and QOTD would stay empty and the
    // execution pipeline would blank them on the sheet. Only fill fields the
    // Toastmaster has not already typed into — this resolves after mount, and
    // must never overwrite live keystrokes.
    const loadSettings = async () => {
        try {
            const settings = await fetchMeetingSettings(meetingId)
            if (settings.theme) setMeetingTheme(prev => prev || settings.theme)
            if (settings.qotd) setMeetingQotd(prev => prev || settings.qotd)
            setMeetingType(prev => prev || (settings.isGuestEducationSession ? 'Education' : 'Regular'))
            setGuestSpeakerName(settings.guestSpeakerName)
        } catch (e) {
            console.error("Failed to load meeting settings:", e)
        }
    }
    loadSettings()

    const loadRoles = async () => {
        try {
            const data = await fetchRoleAssignments(meetingId)
            
            const editableRoles = { ...data.assignments };
            const lockedRoles: PreAssignedMajorRole[] = [];

            const majorByRole = new Map<string, UserWithDisplayName | null>();
            data.preAssignedMajor.forEach((a) => {
                if (a.roleName === 'Toastmaster') {
                    lockedRoles.push(a);
                } else {
                    majorByRole.set(a.roleName, a.user);
                }
            });

            // Surface EVERY major role, not only the ones an admin has filled in.
            // Walking MAJOR_ROLES (rather than the assignment rows) keeps the
            // on-screen order stable and turns an empty Speaker 3 into a slot the
            // Toastmaster can fill, instead of a row that never renders.
            MAJOR_ROLES.forEach((role) => {
                if (role === 'Toastmaster') return;  // locked — rendered from lockedRoles
                editableRoles[role] = majorByRole.get(role) ?? null;
            });

            // Roster = everyone the server knows about: the unassigned pool plus
            // every member already holding an editable or locked role.
            const fullRoster: UserWithDisplayName[] = [...data.unassigned];
            const addToRoster = (u: UserWithDisplayName | null) => {
                if (u && !fullRoster.some(existing => existing.id === u.id)) fullRoster.push(u);
            };
            Object.values(editableRoles).forEach(addToRoster);
            lockedRoles.forEach(a => addToRoster(a.user));
            fullRoster.sort((a, b) => a.displayName.localeCompare(b.displayName));

            // If the saved roster already contains someone holding two roles (an
            // admin can hand a major role to a member who already has a minor one),
            // switch the override ON so the UI reflects reality. Otherwise the
            // checkbox would read "off" while doubles are plainly on screen.
            const seen = new Set<string>();
            const hasDoubles = [
                ...Object.values(editableRoles),
                ...lockedRoles.map(a => a.user)
            ].some(u => {
                if (!u) return false;
                if (seen.has(u.id)) return true;
                seen.add(u.id);
                return false;
            });
            if (hasDoubles) setAllowDoubleRoles(true)

            // Snapshot the major roles exactly as the server reported them.
            const baseline: Record<string, UserWithDisplayName | null> = {};
            Object.entries(editableRoles).forEach(([role, u]) => {
                if (MAJOR_ROLES.includes(role)) baseline[role] = u;
            });
            majorRoleBaseline.current = baseline;
            backupSpeakerBaseline.current = data.backupSpeaker;

            setBackupSpeaker(data.backupSpeaker)
            setRoleSlots(editableRoles)
            setRoster(fullRoster)
            setPreAssigned(lockedRoles)
            setLoadingRoles(false)
        } catch (e) {
            console.error("Failed to load roles:", e)
        }
    }
    loadRoles()
  }, [meetingId])

  // --- Double Role Cleansing ---
  // When "Allow Multiple Roles" is toggled OFF, clear any duplicate assignment so
  // each member holds at most one role. Displaced members reappear on the
  // Attendance List automatically, since that list is derived from roleSlots.
  const wasAllowingDoubleRoles = useRef(allowDoubleRoles);
  useEffect(() => {
    const toggledOff = wasAllowingDoubleRoles.current && !allowDoubleRoles;
    wasAllowingDoubleRoles.current = allowDoubleRoles;

    // Only cleanse on a deliberate ON→OFF toggle. Running this on mount would
    // wipe doubles that were intentionally saved to the database before the
    // Toastmaster has even had a chance to see them.
    if (!toggledOff) return;

    setRoleSlots(prev => {
        const next = { ...prev };
        const alreadyAssigned = new Set<string>();

        // The locked Toastmaster assignment outranks everything.
        preAssigned.forEach(a => {
            if (a.userId) alreadyAssigned.add(a.userId);
        });

        const roleKeys = Object.keys(next);
        const majorKeys = roleKeys.filter(r => MAJOR_ROLES.includes(r));
        const minorKeys = roleKeys.filter(r => !MAJOR_ROLES.includes(r));

        let orderedKeys: string[];
        if (allowMajorRoleEdit) {
            // Majors are resolved before minors so a member holding both keeps
            // the MAJOR role — clearing the major instead would delete an
            // admin's deliberate assignment on the next save.
            orderedKeys = [...majorKeys, ...minorKeys];
        } else {
            // Majors are locked, so they cannot be cleared: this save will not
            // write them at all, and blanking one on screen would show a change
            // that never reaches the database. Seed them as taken instead.
            majorKeys.forEach(r => {
                const u = next[r];
                if (u) alreadyAssigned.add(u.id);
            });
            orderedKeys = minorKeys;
        }

        let changed = false;
        orderedKeys.forEach(role => {
            const user = next[role];
            if (!user) return;
            if (alreadyAssigned.has(user.id)) {
                next[role] = null;
                changed = true;
            } else {
                alreadyAssigned.add(user.id);
            }
        });

        return changed ? next : prev;
    });
  }, [allowDoubleRoles, preAssigned, allowMajorRoleEdit]);

  // --- Major Role Override Revert ---
  // Switching the override back OFF discards any unsaved major-role edits by
  // restoring the values loaded from the server. Without this the screen would
  // keep showing an edit that `saveFinalAgenda` has been told to ignore.
  const wasAllowingMajorEdit = useRef(allowMajorRoleEdit);
  useEffect(() => {
    const toggledOff = wasAllowingMajorEdit.current && !allowMajorRoleEdit;
    wasAllowingMajorEdit.current = allowMajorRoleEdit;
    if (!toggledOff) return;

    setBackupSpeaker(backupSpeakerBaseline.current);
    setRoleSlots(prev => {
        const next = { ...prev };
        let changed = false;
        Object.entries(majorRoleBaseline.current).forEach(([role, user]) => {
            const current = next[role];
            if ((current?.id || null) !== (user?.id || null)) {
                next[role] = user;
                changed = true;
            }
        });
        return changed ? next : prev;
    });
  }, [allowMajorRoleEdit]);

  useEffect(() => {
    if (emailDraft) {
        localStorage.setItem('dtcgc_email_draft', emailDraft)
    }
  }, [emailDraft])

  useEffect(() => {
    if (emailSubject) {
        localStorage.setItem('dtcgc_email_subject', emailSubject)
    }
  }, [emailSubject])

  const nextDisabled =
    (step === 1 && !emailSubject.trim()) ||
    (step === 2 && (!meetingTheme.trim() || !meetingQotd.trim()))

  /** Advances the wizard by one step. Cleans the email draft on step 1 exit. */
  const handleNextStep = async () => {
      if (step === 1) {
          const cleaned = await formatDraft(emailDraft)
          setEmailDraft(cleaned)
      }
      setStep(prev => prev + 1)
  }

  /**
   * Handles a role dropdown change in Step 3.
   * Enforces single-assignment constraint unless "Allow Multiple Roles" is on.
   */
  const handleRoleChange = (roleName: string, userId: string) => {
    // Locked slots render as plain text, so this is unreachable through the UI.
    // It exists so the rule holds even if a stale render is interacted with.
    if (MAJOR_ROLES.includes(roleName) && !allowMajorRoleEdit) return;

    const selectedUser = roster.find(u => u.id === userId) || null;

    if (!allowDoubleRoles && selectedUser) {
        const hasOtherRole = Object.entries(roleSlots).some(([r, u]) => r !== roleName && u?.id === selectedUser.id);
        const hasLockedRole = preAssigned.some(a => a.userId === selectedUser.id);

        if (hasOtherRole || hasLockedRole) {
            setConflictError(`${selectedUser.displayName} already holds a role. Enable 'Multiple Role Override' to bypass.`)
            setTimeout(() => setConflictError(null), 5000)
            return;
        }
    }

    // The Attendance List recomputes itself from this — no manual pool bookkeeping.
    setRoleSlots(prev => ({
        ...prev,
        [roleName]: selectedUser
    }));
  }

  /**
   * Discards the current minor-role roster and re-runs the heuristic.
   *
   * Only minor roles move: major roles, the locked Toastmaster and the Backup
   * Speaker are left exactly as they are. The result lives in state until the
   * Toastmaster saves, so an unwanted shuffle can be abandoned by leaving.
   */
  const handleRegenerate = async () => {
    setConfirmingRegen(false)
    setIsRegenerating(true)
    try {
        const data = await regenerateRoster(meetingId)
        setRoleSlots(prev => {
            const next = { ...prev }
            // data.assignments only ever contains MINOR_ROLES keys.
            Object.entries(data.assignments).forEach(([role, u]) => { next[role] = u })
            return next
        })
        // A fresh shuffle never doubles anyone up, so drop the override to
        // match — leaving it on would imply conflicts that no longer exist.
        setAllowDoubleRoles(false)
    } catch (e) {
        console.error("Failed to regenerate roster:", e)
        setConflictError('Could not regenerate the roster. Please try again.')
        setTimeout(() => setConflictError(null), 5000)
    } finally {
        setIsRegenerating(false)
    }
  }

  /** Quick save for Step 3 update mode — saves roles and silently updates the sheet. */
  const handleFinish = async () => {
    setIsSaving(true);
    try {
        const saved = await saveFinalAgenda(
            meetingId,
            { ...roleSlots, [BACKUP_SPEAKER]: backupSpeaker },
            { includeMajorRoles: allowMajorRoleEdit }
        );
        if (!saved.success) {
          alert(`Your changes were NOT saved:\n\n${saved.error}`);
          setIsSaving(false);
          return;
        }
        // If a sheet already exists, update it with the new roles. A REPORTED
        // failure blocks the quiet exit: the pipeline's error strings carry
        // instructions the caller must actually read — most importantly the
        // admin case where an older sheet was never shared with the app's
        // service account and needs a one-time manual share to fix.
        let syncError: string | null = null;
        try {
          // Pass the theme and QOTD through as-is, empty or not. Substituting
          // placeholders here is what used to stamp 'TBD' over a real question:
          // this path runs in update mode, where Step 2 was never shown. The
          // server resolves empties against the stored values instead.
          // 'update' mode can never create a sheet or send the email.
          const result = await executeAgendaPipeline(meetingId, 'update', {
            emailSubject,
            emailHtmlBody: emailDraft,
            meetingTheme,
            qotd: meetingQotd,
            meetingType
          });
          // 'NO_SHEET' is the benign case: an admin edited a meeting that was
          // never finalized, so there is simply nothing to sync — the roles
          // saved fine and blocking the exit would only cry wolf.
          if (!result.success && result.code !== 'NO_SHEET') {
            syncError = result.error || 'The Google Sheet could not be updated.';
          }
        } catch { /* network hiccup — sheet update stays best-effort */ }
        if (syncError) {
          alert(`Roles were saved, but the agenda sheet was NOT updated:\n\n${syncError}`);
          setIsSaving(false);
          return;
        }
        router.push('/agenda');
    } catch (e) {
        console.error("Failed to save final agenda:", e);
        alert("Persistence Error: Could not save the finalized roles to the server.");
        setIsSaving(false);
    }
  }

  /** Full pipeline execution (Step 4) — saves roles, creates/updates sheet, sends email. */
  const handleExecute = async () => {
    setIsExecuting(true)
    setExecutionResult(null)

    try {
      // Save the roles first
      const saved = await saveFinalAgenda(
        meetingId,
        { ...roleSlots, [BACKUP_SPEAKER]: backupSpeaker },
        { includeMajorRoles: allowMajorRoleEdit }
      )
      if (!saved.success) {
        setExecutionResult(saved)
        return
      }

      // Those major roles are now the server's truth, so re-baseline them.
      // Otherwise switching the override off after a save would "revert" the
      // screen to values that no longer exist in the database.
      if (allowMajorRoleEdit) {
        const baseline: Record<string, UserWithDisplayName | null> = {};
        Object.entries(roleSlots).forEach(([role, u]) => {
          if (MAJOR_ROLES.includes(role)) baseline[role] = u;
        });
        majorRoleBaseline.current = baseline;
        backupSpeakerBaseline.current = backupSpeaker;
      }

      // Execute the pipeline
      const result = await executeAgendaPipeline(meetingId, 'create', {
        emailSubject,
        emailHtmlBody: emailDraft,
        meetingTheme,
        qotd: meetingQotd,
        meetingType
      })

      setExecutionResult(result)

      if (result.success) {
        // Clear localStorage drafts on success
        localStorage.removeItem('dtcgc_email_draft')
        localStorage.removeItem('dtcgc_email_subject')
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Pipeline execution failed.'
      setExecutionResult({
        success: false,
        error: message
      })
    } finally {
      setIsExecuting(false)
    }
  }

  /** Copies a text summary of the meeting (roles + email) to the clipboard as a fallback. */
  const handleCopy = () => {
      // Convert block-level tags and <br> into real line breaks before
      // extracting text — textContent alone collapses the entire HTML email
      // into a single unbroken paragraph.
      const withBreaks = emailDraft
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\s*li[^>]*>/gi, "• ")
        .replace(/<\s*\/(p|div|h[1-6]|li|tr|blockquote)\s*>/gi, "\n");
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = withBreaks;
      let textData = (tempDiv.textContent || tempDiv.innerText || "")
        .replace(/\n{3,}/g, "\n\n");
      
      textData += `\n\n---\nTheme: ${meetingTheme}\nType: ${meetingType === 'Education' ? 'Guest Education Session' : 'Regular'}\n`;
      textData += `\n[MEETING ROLES - CHRONOLOGICAL]\n`;
      
      ROSTER_ORDER.forEach(roleName => {
          // Keep the copy fallback consistent with the sheet: an active guest
          // override prints the guest under the swapped label, not Speaker 3.
          if (roleName === "Speaker 3" && guestEducationActive) {
              textData += `Guest Speaker: ${guestSpeakerName}\n`;
              return;
          }
          let holder = "TBD";
          if (roleName in FIXED_ROLES) holder = FIXED_ROLES[roleName];
          else {
              const major = preAssigned.find((a) => a.roleName === roleName);
              if (major) {
                  const u = major.user;
                  holder = u?.displayName || "TBD";
              } else {
                  const user = roleSlots[roleName];
                  if (user) holder = user.displayName;
              }
          }
          textData += `${roleName}: ${holder}\n`;
      });

      if (executionResult?.success) {
        textData += `\n📋 Agenda Sheet: ${executionResult.sheetUrl}\n`;
      }

      navigator.clipboard.writeText(textData.trim()).then(() => {
          setClipboardStatus("Copied!")
          setTimeout(() => setClipboardStatus("Copy to Clipboard"), 3000)
      })
  }

  return (
    <div data-shot="wizard" className="rounded-2xl border border-gray-200 bg-white p-6 shadow-md md:p-8">
      {/* Progress Indicator */}
      <div className="relative mt-4 mb-12">
        <div aria-hidden className="absolute top-5 right-[12%] left-[12%] z-0 border-t-2 border-dashed border-gray-300" />
        <ol aria-label="Progress" className="relative z-10 flex justify-between px-4">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1
            const reached = step >= n
            return (
              <li key={label} className="flex w-16 flex-col items-center bg-white" aria-current={step === n ? 'step' : undefined}>
                <span className={cn(
                  "flex size-10 items-center justify-center rounded-full font-bold transition-colors duration-300",
                  reached ? "bg-brand-loyal-blue text-white shadow-md" : "bg-gray-200 text-gray-500"
                )}>
                  {n}
                </span>
                <span className={cn("mt-2 text-xs", reached ? "font-bold tracking-tight text-brand-loyal-blue" : "font-medium text-gray-400")}>
                  {label}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="min-h-100">
        {/* Step 3 Update Mode Info */}
        {initialStepParam === 3 && step === 3 && (
            <div className="mb-6 flex flex-col gap-3 rounded-xl border border-brand-loyal-blue/20 bg-brand-loyal-blue/5 p-4 animate-in fade-in slide-in-from-top-2 duration-500 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-sm font-bold text-brand-loyal-blue">Roster-Only Update Mode</h3>
                    <p className="max-w-md text-xs leading-relaxed text-gray-600">Email and Settings will be bypassed. Changes you make here will instantly update the club dashboard.</p>
                </div>
                <Button size="sm" onClick={handleFinish} disabled={isSaving}>
                    {isSaving && <Spinner />}
                    {isSaving ? 'Saving…' : 'Save & Close'}
                </Button>
            </div>
        )}

        {/* Step 1: WYSIWYG Editor */}
        {step === 1 && (
          <div className="space-y-5 animate-in fade-in zoom-in-95 duration-300">
            <StepHeading>Email Draft</StepHeading>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-gray-600">Draft the email body here. Progress is auto-saved locally.</p>
              <a href="/tutorial#write-the-email" target="_blank" className="flex items-center gap-1 font-bold text-brand-loyal-blue hover:underline">
                <CircleHelp size={14} /> How do I write the email?
              </a>
            </div>
            <div className="space-y-4">
                <div>
                    <Label htmlFor="email-subject">Subject Line</Label>
                    <Input
                        id="email-subject"
                        type="text"
                        placeholder="Gavel Club MM/DD - Theme"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                    />
                </div>
                <div>
                    <Label>Email Body</Label>
                    <TiptapEditor content={emailDraft} onChange={setEmailDraft} />
                </div>
            </div>
          </div>
        )}

        {/* Step 2: Settings */}
        {step === 2 && (
          <div className="max-w-lg space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <StepHeading>Meeting Details</StepHeading>
             <div>
                 <Label htmlFor="meeting-type">Meeting Type</Label>
                 <NativeSelect id="meeting-type" value={meetingType || 'Regular'} onChange={(e) => setMeetingType(e.target.value)}>
                     <option value="Regular">Regular Meeting</option>
                     <option value="Education">Guest Education Session</option>
                     <option value="Contest" disabled>Contest</option>
                 </NativeSelect>
                 {guestEducationActive && (
                     <FieldHint className="font-medium text-brand-true-maroon">
                         Guest speaker &quot;{guestSpeakerName}&quot; (set by the executive team) will replace Speaker 3 on the agenda sheet.
                     </FieldHint>
                 )}
                 {meetingType === 'Education' && !guestSpeakerName.trim() && (
                     <FieldHint>
                         No guest speaker has been entered by the executive team yet — the agenda will keep the regular Speaker 3 slot until one is set.
                     </FieldHint>
                 )}
             </div>
             <div>
                 <Label htmlFor="meeting-theme">Meeting Theme (Required)</Label>
                 <Input id="meeting-theme" type="text" placeholder="e.g., Spring Forward" value={meetingTheme} onChange={(e) => setMeetingTheme(e.target.value)} />
             </div>
             <div>
                 <Label htmlFor="meeting-qotd">Question of The Day (Required)</Label>
                 <Input id="meeting-qotd" type="text" placeholder="e.g., What is your favorite season?" value={meetingQotd} onChange={(e) => setMeetingQotd(e.target.value)} />
             </div>
          </div>
        )}

        {/* Step 3: Roles */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <div className="flex flex-wrap items-center justify-between gap-3">
                 <StepHeading>Role Assignments</StepHeading>
                 <div className="flex flex-wrap items-center gap-2">
                     <ToggleChip checked={allowDoubleRoles} onChange={setAllowDoubleRoles}>Allow Multiple Roles</ToggleChip>
                     <ToggleChip checked={allowMajorRoleEdit} onChange={setAllowMajorRoleEdit}>Edit Major Roles</ToggleChip>
                 </div>
             </div>

             {allowDoubleRoles && (
                 <Notice tone="danger" title="Double roles are enabled">
                     Automatic role shuffle is paused. You must manually assign attendees to resolve conflicts.
                 </Notice>
             )}

             {allowMajorRoleEdit && (
                 <Notice tone="warning" title="Major roles are unlocked">
                     Your changes overwrite what the executive team assigned — switch this back off to discard them.
                 </Notice>
             )}

             {conflictError && (
                 <Notice tone="danger" className="animate-in fade-in slide-in-from-top-2 duration-300">
                     {conflictError}
                 </Notice>
             )}

             {loadingRoles ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-gray-500"><Spinner /> Loading Role History...</div>
             ) : (
                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                    <div>
                        <h3 className="mb-4 flex items-center justify-between gap-2 rounded-xl bg-gray-100 px-3 py-2 text-sm font-bold text-gray-700">
                            <span>Minor Roles</span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setConfirmingRegen(true)}
                                disabled={isRegenerating || confirmingRegen}
                                title="Discard this roster and reshuffle by participation history"
                            >
                                <RefreshCw className={isRegenerating ? 'animate-spin' : ''} />
                                {isRegenerating ? 'Shuffling...' : 'Regenerate'}
                            </Button>
                        </h3>

                        {confirmingRegen && (
                            <Notice tone="warning" icon={false} className="mb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                <p>
                                    Reshuffle all minor roles from participation history? <strong>The current minor-role assignments will be discarded.</strong> Major roles, the Toastmaster and the Backup Speaker are left alone, and nothing is saved until you finish.
                                </p>
                                <div className="flex gap-2 pt-2">
                                    <Button variant="maroon" size="sm" onClick={handleRegenerate}>Yes, reshuffle</Button>
                                    <Button variant="secondary" size="sm" onClick={() => setConfirmingRegen(false)}>Cancel</Button>
                                </div>
                            </Notice>
                        )}

                        <div>
                             {Object.entries(roleSlots)
                                 .filter(([role]) => !MAJOR_ROLES.includes(role))
                                 .map(([role, user]) => {
                                 // Double roles on: any member is selectable. Off: only
                                 // members with no role yet, plus the current holder.
                                 const options = allowDoubleRoles
                                     ? roster
                                     : [...unassigned, ...(user ? [user] : [])].sort((a, b) => a.displayName.localeCompare(b.displayName));

                                 return (
                                 <RoleRow key={role} label={role}>
                                     <RoleSelect value={user?.id || ""} filled={!!user} onChange={(id) => handleRoleChange(role, id)} options={options} />
                                 </RoleRow>
                                 )
                             })}
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div>
                            <h3 className="mb-4 flex items-center justify-between rounded-xl bg-brand-true-maroon px-3 py-2 text-sm font-bold text-white">
                                <span>Major Roles</span>
                                <span className="text-xs font-medium text-white/80">{allowMajorRoleEdit ? 'Unlocked' : 'Admin Entry'}</span>
                            </h3>
                            <div>
                                {Object.entries(roleSlots)
                                    .filter(([role]) => MAJOR_ROLES.includes(role))
                                    .map(([role, user]) => {
                                    // Guest override active: the sheet will print the
                                    // guest, not whatever member sits in this slot — so
                                    // never render an editable dropdown that suggests
                                    // otherwise, even with "Edit Major Roles" on.
                                    if (role === 'Speaker 3' && guestEducationActive) {
                                        return (
                                        <RoleRow key={role} label={<>Guest Speaker <Badge tone="maroon" caps>Education</Badge></>}>
                                            <span className="rounded-lg bg-brand-true-maroon/5 px-2 py-0.5 font-black text-brand-true-maroon">
                                                {guestSpeakerName}
                                            </span>
                                        </RoleRow>
                                        )
                                    }

                                    // Locked by default: these are the executive team's
                                    // picks, and an accidental dropdown nudge here is a
                                    // much bigger deal than one on a minor role.
                                    if (!allowMajorRoleEdit) {
                                        return (
                                        <RoleRow key={role} label={role}>
                                            <HolderChip name={user?.displayName} />
                                        </RoleRow>
                                        )
                                    }

                                    const options = allowDoubleRoles
                                        ? roster
                                        : [...unassigned, ...(user ? [user] : [])].sort((a, b) => a.displayName.localeCompare(b.displayName));

                                    return (
                                    <RoleRow key={role} label={role}>
                                        <RoleSelect value={user?.id || ""} filled={!!user} onChange={(id) => handleRoleChange(role, id)} options={options} />
                                    </RoleRow>
                                    )
                                })}

                                {preAssigned.map((a) => (
                                    <RoleRow key={a.id} label={a.roleName}>
                                        <HolderChip name={a.user?.displayName} />
                                    </RoleRow>
                                ))}
                            </div>

                            {/* Standby slot. Any member is selectable regardless of the
                                double-role setting, because holding it is not holding a role. */}
                            <div className="mt-4 border-t border-dashed border-gray-200 pt-3">
                                <RoleRow label={BACKUP_SPEAKER} bare>
                                    {allowMajorRoleEdit ? (
                                        <RoleSelect
                                            value={backupSpeaker?.id || ""}
                                            filled={!!backupSpeaker}
                                            optional
                                            onChange={(id) => setBackupSpeaker(roster.find(u => u.id === id) || null)}
                                            options={roster}
                                        />
                                    ) : (
                                        <HolderChip name={backupSpeaker?.displayName} />
                                    )}
                                </RoleRow>
                                <FieldHint>
                                    Standby only — still counts as roleless, so they remain eligible for a minor role and stay on the attendance list.
                                </FieldHint>
                            </div>
                        </div>

                        <div className="border-t border-gray-200 pt-6">
                            <h3 className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2 text-sm font-bold text-gray-700">
                                <span>Attendance List</span>
                                <Badge>{unassigned.length} Available</Badge>
                            </h3>
                            <p className="mb-3 text-xs text-gray-500">Members attending without a formal designated role.</p>
                            <div className="flex flex-wrap gap-1.5 text-xs">
                                {unassigned.length > 0 ? unassigned.map(u => (
                                    <span key={u.id} className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium text-gray-600">{u.displayName}</span>
                                )) : (
                                    <span className="text-gray-500 italic">Everyone is currently participating!</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
             )}
          </div>
        )}

        {/* Step 4: Execution */}
        {step === 4 && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <div>
                 <StepHeading>Final Review &amp; Finish</StepHeading>
                 <p className="mt-2 text-sm text-gray-600">Review the summary below, then create the agenda and send the meeting email.</p>
             </div>

             {/* Summary Preview */}
             <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {[
                  ['Email Subject', emailSubject],
                  ['Meeting Theme', meetingTheme],
                  ['Question Of The Day', meetingQotd],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <SectionLabel as="h3" className="mb-2">{label}</SectionLabel>
                      <p className={cn("text-sm font-semibold", value ? "text-gray-800" : "text-gray-400 italic")}>{value || 'Not set'}</p>
                  </div>
                ))}
             </div>

             {/* Execution Result */}
             {executionResult && (executionResult.success ? (
                <Notice tone="success" title={executionResult.isUpdate ? 'Agenda Sheet Updated' : 'Agenda Created and Sent'} className="animate-in fade-in zoom-in-95 duration-300">
                    <p>
                        {executionResult.isUpdate
                            ? 'The existing Google Sheet has been updated with the latest role assignments.'
                            : 'Google Sheet created and email dispatched to all club members.'}
                    </p>
                    {executionResult.warning && (
                        <Notice tone="warning" className="mt-3">{executionResult.warning}</Notice>
                    )}
                    <a
                        href={executionResult.sheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), "mt-3")}
                    >
                        <ExternalLink /> Open Agenda Sheet
                    </a>
                </Notice>
             ) : (
                <Notice tone="danger" title="Something went wrong" className="animate-in fade-in zoom-in-95 duration-300">
                    {executionResult.error}
                </Notice>
             ))}

             {/* Action Buttons */}
             {!executionResult?.success && (
                <div className="space-y-4">
                    <Button size="lg" onClick={handleExecute} disabled={isExecuting} className="h-14 w-full text-lg shadow-md">
                        {isExecuting ? (
                            <>
                                <Spinner size={22} />
                                {initialStepParam === 3 ? 'Updating Sheet...' : 'Generating Sheet & Sending Email...'}
                            </>
                        ) : (
                            initialStepParam === 3 ? 'Update Agenda Sheet' : 'Create Agenda & Send Email'
                        )}
                    </Button>

                    <div className="flex items-center gap-4">
                        <span className="flex-1 border-t border-gray-200" />
                        <SectionLabel as="span">Manual Copy</SectionLabel>
                        <span className="flex-1 border-t border-gray-200" />
                    </div>

                    <Button variant="secondary" onClick={handleCopy} className="w-full">
                        <Copy /> {clipboardStatus}
                    </Button>
                </div>
             )}

             {executionResult?.success && (
                <div className="flex gap-3">
                    <Button onClick={() => router.push('/agenda')} className="flex-1">
                        Return to Dashboard
                    </Button>
                    <Button variant="secondary" onClick={handleCopy}>
                        <Copy /> {clipboardStatus}
                    </Button>
                </div>
             )}
          </div>
        )}
      </div>

      {initialStepParam !== 3 && (
      <div className="mt-8 flex justify-between border-t border-gray-200 pt-6">
          <Button variant="secondary" onClick={() => setStep(prev => prev - 1)} disabled={step === 1} className={step === 1 ? 'invisible' : undefined}>
              Back
          </Button>

          {step < 4 ? (
              <Button onClick={handleNextStep} disabled={nextDisabled}>
                  Next Step
              </Button>
          ) : null}
      </div>
      )}
    </div>
  )
}

const STEP_LABELS = ['Draft', 'Settings', 'Roles', 'Finalize']

function StepHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="border-l-4 border-brand-loyal-blue pl-3 text-xl font-bold text-gray-800">{children}</h2>
}

/** A labelled checkbox styled as a chip (the Step 3 overrides). */
function ToggleChip({ checked, onChange, children }: { checked: boolean; onChange: (next: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={cn(
      "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors select-none",
      checked
        ? "border-brand-true-maroon/30 bg-brand-true-maroon/5 font-bold text-brand-true-maroon"
        : "border-gray-200 bg-gray-50 font-medium text-gray-600 hover:bg-gray-100"
    )}>
      <span>{children}</span>
      <input type="checkbox" className="size-4 cursor-pointer accent-brand-true-maroon" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

/** One role line in Step 3: name on the left, holder or picker on the right. */
function RoleRow({ label, bare = false, children }: { label: React.ReactNode; bare?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 text-sm", !bare && "border-b border-gray-100 py-2 last:border-0")}>
      <span className="flex items-center gap-2 font-semibold text-gray-700">{label}</span>
      {children}
    </div>
  )
}

/** Member picker. Yellow when filled; dashed red when an assignable slot is empty. */
function RoleSelect({ value, filled, optional = false, onChange, options }: {
  value: string
  filled: boolean
  /** Empty is fine (the Backup Speaker), so don't flag it red. */
  optional?: boolean
  onChange: (id: string) => void
  options: UserWithDisplayName[]
}) {
  return (
    <NativeSelect
      size="sm"
      className={cn(
        "w-44",
        filled
          ? "border-brand-happy-yellow bg-brand-happy-yellow/10"
          : optional ? "border-dashed" : "border-dashed border-red-300 bg-red-50"
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">-- UNASSIGNED --</option>
      {options.map((u) => (
        <option key={u.id} value={u.id}>{u.displayName}</option>
      ))}
    </NativeSelect>
  )
}

/** A locked holder's name, or TBD. */
function HolderChip({ name }: { name?: string }) {
  return (
    <span className={cn("rounded-lg px-2 py-0.5 font-black", name ? "bg-brand-loyal-blue/5 text-brand-loyal-blue" : "bg-gray-50 text-gray-400")}>
      {name || 'TBD'}
    </span>
  )
}

export default function AgendaWizard({ meetingId }: { meetingId: string }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center gap-2 p-20 text-gray-500"><Spinner /> Loading the wizard…</div>}>
      <WizardContent meetingId={meetingId} />
    </Suspense>
  )
}
