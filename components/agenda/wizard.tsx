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

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, ExternalLink, Copy, Loader2 } from 'lucide-react'
import TiptapEditor from './tiptap-editor'
import { fetchRoleAssignments, formatDraft, saveFinalAgenda } from '@/app/actions/agenda'
import { executeAgendaPipeline } from '@/app/actions/execute-agenda'
import { MAJOR_ROLES } from '@/lib/agenda-logic'

// Empty default — most Toastmasters write the email from scratch each week
const DEFAULT_TEMPLATE = ``

function WizardContent({ meetingId }: { meetingId: string }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialStepParam = parseInt(searchParams.get('step') || '1')

  const [step, setStep] = useState(initialStepParam)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailDraft, setEmailDraft] = useState('')
  const [meetingType, setMeetingType] = useState('Regular')
  const [meetingTheme, setMeetingTheme] = useState('')
  const [meetingQotd, setMeetingQotd] = useState('')
  
  // Roles Data
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [minorRoles, setMinorRoles] = useState<Record<string, any>>({})
  const [unassigned, setUnassigned] = useState<any[]>([])
  const [preAssigned, setPreAssigned] = useState<any[]>([])
  
  const [allowDoubleRoles, setAllowDoubleRoles] = useState(false)
  const [clipboardStatus, setClipboardStatus] = useState('Copy to Clipboard')
  const [isSaving, setIsSaving] = useState(false)
  const [conflictError, setConflictError] = useState<string | null>(null)

  // Step 4 execution state
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    sheetUrl?: string;
    error?: string;
    isUpdate?: boolean;
  } | null>(null)

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

    const loadRoles = async () => {
        try {
            const data = await fetchRoleAssignments(meetingId)
            
            const editableRoles = { ...data.assignments };
            const lockedRoles: any[] = [];
            
            data.preAssignedMajor.forEach((a: any) => {
                if (a.roleName === 'Toastmaster') {
                    lockedRoles.push(a);
                } else {
                    editableRoles[a.roleName] = a.user;
                }
            });

            setMinorRoles(editableRoles)
            setUnassigned(data.unassigned)
            setPreAssigned(lockedRoles)
            setLoadingRoles(false)
        } catch (e) {
            console.error("Failed to load roles:", e)
        }
    }
    loadRoles()
  }, [meetingId])

  // --- Double Role Cleansing ---
  // When "Allow Multiple Roles" is toggled OFF, automatically remove
  // duplicate assignments and return displaced members to the unassigned pool.
  useEffect(() => {
    if (!allowDoubleRoles) {
        const newMinorRoles = { ...minorRoles };
        const pool = [...unassigned];
        const alreadyAssigned = new Set();
        
        preAssigned.forEach(a => {
            if (a.userId) alreadyAssigned.add(a.userId);
        });

        let changed = false;
        Object.keys(newMinorRoles).forEach(role => {
            const user = newMinorRoles[role];
            if (user && alreadyAssigned.has(user.id)) {
                pool.push(user);
                newMinorRoles[role] = null;
                changed = true;
            } else if (user) {
                alreadyAssigned.add(user.id);
            }
        });

        if (changed) {
            setMinorRoles(newMinorRoles);
            setUnassigned(pool);
        }
    }
  }, [allowDoubleRoles, preAssigned]);

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
    const allUsers = [...unassigned, ...Object.values(minorRoles).filter(Boolean), ...preAssigned.map(a => a.user).filter(Boolean)];
    const selectedUser = allUsers.find(u => u.id === userId) || null;
    const displacedUser = minorRoles[roleName];

    if (!allowDoubleRoles && selectedUser) {
        const hasOtherMinor = Object.values(minorRoles).some(u => u?.id === selectedUser.id);
        const hasMajor = preAssigned.some(a => a.userId === selectedUser.id);
        
        if (hasOtherMinor || hasMajor) {
            setConflictError(`${selectedUser.displayName} already holds a role. Enable 'Multiple Role Override' to bypass.`)
            setTimeout(() => setConflictError(null), 5000)
            return;
        }
    }

    setMinorRoles(prev => ({
        ...prev,
        [roleName]: selectedUser
    }));

    setUnassigned(prev => {
        let newUnassigned = [...prev].filter(u => u.id !== userId);
        if (displacedUser) newUnassigned.push(displacedUser);
        return newUnassigned;
    });
  }

  /** Quick save for Step 3 update mode — saves roles and silently updates the sheet. */
  const handleFinish = async () => {
    setIsSaving(true);
    try {
        await saveFinalAgenda(meetingId, minorRoles);
        // If a sheet already exists, silently update it with the new roles
        try {
          await executeAgendaPipeline(
            meetingId,
            emailSubject || `Gavel Club MM/DD - Theme`,
            emailDraft,
            meetingTheme || 'Meeting',
            meetingQotd || 'TBD'
          );
        } catch { /* silent — sheet update is best-effort */ }
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
      await saveFinalAgenda(meetingId, minorRoles)

      // Execute the pipeline
      const result = await executeAgendaPipeline(
        meetingId,
        emailSubject || `Gavel Club MM/DD - Theme`,
        emailDraft,
        meetingTheme,
        meetingQotd || 'TBD'
      )

      setExecutionResult(result)

      if (result.success) {
        // Clear localStorage drafts on success
        localStorage.removeItem('dtcgc_email_draft')
        localStorage.removeItem('dtcgc_email_subject')
      }
    } catch (error: any) {
      setExecutionResult({
        success: false,
        error: error.message || 'Pipeline execution failed.'
      })
    } finally {
      setIsExecuting(false)
    }
  }

  /** Copies a text summary of the meeting (roles + email) to the clipboard as a fallback. */
  const handleCopy = () => {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = emailDraft;
      let textData = tempDiv.textContent || tempDiv.innerText || "";
      
      textData += `\n\n---\nTheme: ${meetingTheme}\nType: ${meetingType}\n`;
      textData += `\n[MEETING ROLES - CHRONOLOGICAL]\n`;
      
      const roleSequence = [
          "Sergeant at Arms", "Toastmaster", "Timer", "Grammarian", "Filler Word Counter", "Quizmaster",
          "Speaker 1", "Speaker 2", "Speaker 3", "Evaluator 1", "Evaluator 2", "Evaluator 3",
          "Roles For Next Meeting", "Business Meeting", "Table Topics Master", "Table Topics Evaluator 1", "Table Topics Evaluator 2"
      ];

      roleSequence.forEach(roleName => {
          let holder = "TBD";
          if (roleName === "Roles For Next Meeting") holder = "John";
          else if (roleName === "Business Meeting") holder = "Andrew";
          else {
              const major = preAssigned.find((a: any) => a.roleName === roleName);
              if (major) {
                  const u = (major as any).user;
                  holder = u?.displayName || "TBD";
              } else {
                  const user = minorRoles[roleName];
                  if (user) holder = user.displayName;
              }
          }
          textData += `${roleName}: ${holder}\n`;
      });

      if (executionResult?.sheetUrl) {
        textData += `\n📋 Agenda Sheet: ${executionResult.sheetUrl}\n`;
      }

      navigator.clipboard.writeText(textData.trim()).then(() => {
          setClipboardStatus("Copied!")
          setTimeout(() => setClipboardStatus("Copy to Clipboard"), 3000)
      })
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border p-8">
      {/* Progress Indicator */}
      <div className="relative mb-12 mt-4">
        <div className="absolute top-5 left-[12%] right-[12%] border-t-2 border-dashed border-gray-300 z-0"></div>
        <div className="flex justify-between relative z-10 px-4">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex flex-col items-center w-16 bg-white">
               <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors duration-300 ${step >= s ? 'bg-brand-loyal-blue text-white shadow-md' : 'bg-gray-200 text-gray-500 border border-transparent'}`}>
                  {s}
               </div>
               <span className={`text-xs mt-2 font-medium ${step >= s ? 'text-brand-loyal-blue font-bold tracking-tight' : 'text-gray-400'}`}>
                   {s === 1 && 'Draft'}
                   {s === 2 && 'Settings'}
                   {s === 3 && 'Roles'}
                   {s === 4 && 'Finalize'}
               </span>
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-[400px]">
        {/* Step 3 Update Mode Info */}
        {initialStepParam === 3 && step === 3 && (
            <div className="mb-6 p-4 bg-brand-loyal-blue/5 border border-brand-loyal-blue/20 rounded-xl animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-brand-loyal-blue font-bold text-sm">Roster-Only Update Mode</h3>
                        <p className="text-xs text-gray-500 max-w-md">Email and Settings will be bypassed. Changes you make here will instantly update the club dashboard.</p>
                    </div>
                    <button 
                        onClick={handleFinish}
                        disabled={isSaving}
                        className="bg-brand-loyal-blue text-white text-xs font-bold px-5 py-2 rounded-lg hover:bg-opacity-90 shadow-sm transition-all disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : 'Save & Close'}
                    </button>
                </div>
            </div>
        )}

        {/* Step 1: WYSIWYG Editor */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-xl font-bold border-l-4 pl-3 border-brand-loyal-blue">Email Draft</h2>
            <div className="flex justify-between items-center text-sm">
              <p className="text-gray-600">Draft the email body here. Progress is auto-saved locally.</p>
              <a href="/assets/docs/toastmaster-tutorial.pdf" target="_blank" className="text-brand-loyal-blue font-bold flex items-center gap-1 hover:underline">
                <AlertCircle size={14} /> How do I write the email?
              </a>
            </div>
            <div className="space-y-3">
                <div>
                    <label className="text-sm font-semibold text-gray-600 block mb-1">Subject Line</label>
                    <input 
                        type="text" 
                        className="w-full border p-3 rounded-lg outline-none focus:ring-2 focus:ring-brand-loyal-blue transition text-sm" 
                        placeholder="Gavel Club MM/DD - Theme"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-sm font-semibold text-gray-600 block mb-1">Email Body</label>
                    <TiptapEditor content={emailDraft} onChange={setEmailDraft} />
                </div>
            </div>
          </div>
        )}

        {/* Step 2: Settings */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 max-w-lg">
             <h2 className="text-xl font-bold border-l-4 pl-3 border-brand-loyal-blue">Meeting Details</h2>
             <div className="space-y-2">
                 <label className="font-semibold text-sm">Meeting Type</label>
                 <select className="w-full border p-3 rounded" value={meetingType} onChange={(e) => setMeetingType(e.target.value)}>
                     <option value="Regular">Regular Meeting</option>
                     <option value="Education" disabled>Education Session</option>
                     <option value="Contest" disabled>Contest</option>
                 </select>
             </div>
             <div className="space-y-2">
                 <label className="font-semibold text-sm">Meeting Theme (Required)</label>
                 <input type="text" placeholder="e.g., Spring Forward" className="w-full border p-3 rounded" value={meetingTheme} onChange={(e) => setMeetingTheme(e.target.value)} />
             </div>
             <div className="space-y-2">
                 <label className="font-semibold text-sm">Question of The Day (Required)</label>
                 <input type="text" placeholder="e.g., What is your favorite season?" className="w-full border p-3 rounded" value={meetingQotd} onChange={(e) => setMeetingQotd(e.target.value)} />
             </div>
          </div>
        )}

        {/* Step 3: Roles */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <div className="flex justify-between items-center">
                 <h2 className="text-xl font-bold border-l-4 pl-3 border-brand-loyal-blue">Role Assignments</h2>
                 <div className="flex items-center text-sm bg-gray-100 p-2 rounded cursor-pointer border border-gray-200" onClick={() => setAllowDoubleRoles(!allowDoubleRoles)}>
                     <span className={allowDoubleRoles ? 'text-brand-true-maroon font-bold mr-2' : 'text-gray-600 font-medium mr-2'}>Allow Multiple Roles</span>
                     <input type="checkbox" className="accent-brand-true-maroon w-4 h-4 cursor-pointer" checked={allowDoubleRoles} readOnly />
                 </div>
             </div>

             {allowDoubleRoles && (
                 <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm border border-red-200 shadow-sm font-medium">
                     <strong>Warning:</strong> Double roles are enabled. Automatic role shuffle is paused. You must manually assign attendees to resolve conflicts.
                 </div>
             )}

             {conflictError && (
                 <div className="bg-red-100 text-red-800 p-4 rounded-lg text-sm border-l-4 border-red-500 shadow-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                     <AlertCircle size={20} />
                     <span>{conflictError}</span>
                 </div>
             )}

             {loadingRoles ? (
                  <div className="py-12 text-center text-gray-400">Loading Role History...</div>
             ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <h3 className="font-bold text-gray-700 mb-4 bg-gray-100 p-2 rounded text-sm">Minor Roles</h3>
                        <div className="space-y-2">
                             {Object.entries(minorRoles)
                                 .filter(([role]) => !MAJOR_ROLES.includes(role))
                                 .map(([role, user]) => {
                                 // Safely construct a unique list of all known users
                                 const staticUsers = [...unassigned];
                                 Object.values(minorRoles).forEach(u => { if (u && !staticUsers.some(existing => existing.id === u.id)) staticUsers.push(u); });
                                 preAssigned.forEach(a => { if (a.user && !staticUsers.some(existing => existing.id === a.user.id)) staticUsers.push(a.user); });
                                 staticUsers.sort((a, b) => a.displayName.localeCompare(b.displayName));

                                 return (
                                 <div key={role} className="flex justify-between items-center text-sm border-b border-gray-100 pb-2">
                                     <span className="font-medium text-gray-600">{role}</span>
                                     <select 
                                        className={`px-2 py-1 rounded text-xs border bg-white focus:ring-2 focus:ring-brand-loyal-blue outline-none transition-shadow ${user ? 'bg-brand-happy-yellow/10 border-brand-happy-yellow/50' : 'bg-red-50 border-red-200 border-dashed'}`} 
                                        value={user?.id || ""} 
                                        onChange={(e) => handleRoleChange(role, e.target.value)}
                                     >
                                         <option value="">-- UNASSIGNED --</option>
                                         {(allowDoubleRoles ? staticUsers : [...unassigned, ...(user ? [user] : [])]).filter((u, i, arr) => arr.findIndex(t => t.id === u.id) === i).map((u: any) => (
                                             <option key={u.id} value={u.id}>{u.displayName}</option>
                                         ))}
                                     </select>
                                 </div>
                                 )
                             })}
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div>
                            <h3 className="font-bold text-gray-700 mb-4 bg-brand-true-maroon text-white p-2 rounded text-sm flex justify-between">
                                <span>Major Roles</span>
                                <span className="text-[10px] font-normal opacity-75">Admin/TM Entry</span>
                            </h3>
                            <div className="space-y-3 text-sm">
                                {Object.entries(minorRoles)
                                    .filter(([role]) => MAJOR_ROLES.includes(role))
                                    .map(([role, user]) => {
                                    const staticUsers = [...unassigned];
                                    Object.values(minorRoles).forEach(u => { if (u && !staticUsers.some(existing => existing.id === u.id)) staticUsers.push(u); });
                                    preAssigned.forEach(a => { if (a.user && !staticUsers.some(existing => existing.id === a.user.id)) staticUsers.push(a.user); });
                                    staticUsers.sort((a, b) => a.displayName.localeCompare(b.displayName));
   
                                    return (
                                    <div key={role} className="flex justify-between items-center border-b pb-2 last:border-0">
                                        <span className="font-semibold text-gray-600">{role}</span>
                                        <select 
                                           className={`px-2 py-1 rounded text-xs border bg-white focus:ring-2 focus:ring-brand-true-maroon outline-none transition-shadow ${user ? 'bg-brand-happy-yellow/10 border-brand-happy-yellow/50' : 'bg-red-50 border-red-200 border-dashed'}`} 
                                           value={user?.id || ""} 
                                           onChange={(e) => handleRoleChange(role, e.target.value)}
                                        >
                                            <option value="">-- UNASSIGNED --</option>
                                            {(allowDoubleRoles ? staticUsers : [...unassigned, ...(user ? [user] : [])]).filter((u, i, arr) => arr.findIndex(t => t.id === u.id) === i).map((u: any) => (
                                                <option key={u.id} value={u.id}>{u.displayName}</option>
                                            ))}
                                        </select>
                                    </div>
                                    )
                                })}

                                {preAssigned.map((a: any) => (
                                    <div key={a.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                                        <span className="font-semibold text-gray-600">{a.roleName}</span>
                                        <span className="text-brand-loyal-blue font-black bg-brand-loyal-blue/5 px-2 py-0.5 rounded">{a.user ? `${a.user.firstName} ${a.user.lastName}` : "TBD"}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-6 border-t border-gray-100">
                            <h3 className="font-bold text-gray-700 mb-2 border-b border-gray-100 pb-2 flex justify-between items-center text-sm">
                                <span>Attendance List</span>
                                <span className="bg-gray-100 text-gray-400 text-[10px] px-2 py-0.5 rounded-full font-normal">{unassigned.length} Available</span>
                            </h3>
                            <p className="text-xs text-gray-400 mb-3">Members attending without a formal designated role.</p>
                            <div className="flex flex-wrap gap-1.5 text-xs">
                                {unassigned.length > 0 ? unassigned.map(u => (
                                    <span key={u.id} className="bg-gray-50 border border-gray-200 px-2.5 py-1 text-gray-500 rounded-lg shadow-sm">{u.displayName}</span>
                                )) : (
                                    <span className="text-gray-400 italic">Everyone is currently participating!</span>
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
             <div className="bg-brand-loyal-blue/10 border-l-4 border-brand-loyal-blue p-6 rounded-r">
                 <h2 className="text-lg font-bold text-brand-loyal-blue mb-1">Final Review & Finish</h2>
                 <p className="text-sm text-gray-600">Review the summary below, then create the agenda and send the meeting email.</p>
             </div>
             
             {/* Summary Preview */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg border flex-1">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Email Subject</h3>
                    <p className="text-sm font-semibold text-gray-800">{emailSubject || `Gavel Club MM/DD - Theme`}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border flex-1">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Meeting Theme</h3>
                    <p className="text-sm font-semibold text-gray-800">{meetingTheme || 'Not set'}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border flex-1">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Question Of The Day</h3>
                    <p className="text-sm font-semibold text-gray-800">{meetingQotd || 'Not set'}</p>
                </div>
             </div>

             {/* Execution Result */}
             {executionResult && (
                <div className={`p-6 rounded-xl border-2 animate-in fade-in zoom-in-95 duration-300 ${executionResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    {executionResult.success ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 size={28} className="text-green-600" />
                                <div>
                                    <h3 className="font-bold text-green-800 text-lg">
                                        {executionResult.isUpdate ? 'Agenda Sheet Updated' : 'Pipeline Executed Successfully'}
                                    </h3>
                                    <p className="text-sm text-green-700">
                                        {executionResult.isUpdate 
                                            ? 'The existing Google Sheet has been updated with the latest role assignments.'
                                            : 'Google Sheet created and email dispatched to all club members.'}
                                    </p>
                                </div>
                            </div>
                            {executionResult.sheetUrl && (
                                <a 
                                    href={executionResult.sheetUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 bg-white px-4 py-3 rounded-lg border border-green-200 text-brand-loyal-blue font-bold text-sm hover:bg-green-50 transition-colors w-fit"
                                >
                                    <ExternalLink size={16} />
                                    Open Agenda Sheet
                                </a>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <AlertCircle size={28} className="text-red-600" />
                            <div>
                                <h3 className="font-bold text-red-800">Execution Failed</h3>
                                <p className="text-sm text-red-700">{executionResult.error}</p>
                            </div>
                        </div>
                    )}
                </div>
             )}

             {/* Action Buttons */}
             {!executionResult?.success && (
                <div className="space-y-3">
                    <button 
                        onClick={handleExecute}
                        disabled={isExecuting}
                        className="w-full flex items-center justify-center gap-2 bg-brand-loyal-blue text-white font-bold py-4 rounded-xl shadow-lg hover:bg-opacity-90 transition-all disabled:opacity-50 text-lg"
                    >
                        {isExecuting ? (
                            <>
                                <Loader2 size={22} className="animate-spin" />
                                {initialStepParam === 3 ? 'Updating Sheet...' : 'Generating Sheet & Sending Email...'}
                            </>
                        ) : (
                            initialStepParam === 3 ? 'Update Agenda Sheet' : 'Create Agenda & Send Email'
                        )}
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200"></div>
                        </div>
                        <div className="relative flex justify-center text-xs">
                            <span className="bg-white px-4 text-gray-400 font-bold uppercase tracking-widest">Manual Copy</span>
                        </div>
                    </div>

                    <button 
                        onClick={handleCopy} 
                        className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl border border-gray-200 hover:bg-gray-200 transition-all text-sm"
                    >
                        <Copy size={16} />
                        {clipboardStatus}
                    </button>
                </div>
             )}

             {executionResult?.success && (
                <div className="flex gap-3">
                    <button 
                        onClick={() => router.push('/agenda')}
                        className="flex-1 bg-brand-loyal-blue text-white font-bold py-3 rounded-xl shadow hover:bg-opacity-90 transition-all"
                    >
                        Return to Dashboard
                    </button>
                    <button 
                        onClick={handleCopy} 
                        className="flex items-center justify-center gap-2 bg-gray-100 text-gray-600 font-bold py-3 px-6 rounded-xl border border-gray-200 hover:bg-gray-200 transition-all text-sm"
                    >
                        <Copy size={16} />
                        {clipboardStatus}
                    </button>
                </div>
             )}
          </div>
        )}
      </div>

      {initialStepParam !== 3 && (
      <div className="mt-8 flex justify-between border-t pt-4">
          <button onClick={() => setStep(prev => prev - 1)} disabled={step === 1} className={`px-6 py-2 rounded font-medium ${step === 1 ? 'opacity-0 cursor-default' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Back</button>
          
          {step < 4 ? (
              <button 
                  onClick={handleNextStep}
                  disabled={(step === 2 && (!meetingTheme || !meetingQotd))}
                  className={`px-6 py-2 rounded font-bold transition-all ${step === 2 && (!meetingTheme || !meetingQotd) ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-brand-loyal-blue text-white shadow hover:opacity-90 active:scale-95'}`}
              >
                  Next Step
              </button>
          ) : null}
      </div>
      )}
    </div>
  )
}

export default function AgendaWizard({ meetingId }: { meetingId: string }) {
  return (
    <Suspense fallback={<div className="p-20 text-center text-gray-400">Loading Wizard Environment...</div>}>
      <WizardContent meetingId={meetingId} />
    </Suspense>
  )
}
