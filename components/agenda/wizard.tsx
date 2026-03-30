'use client'

import { useState, useEffect } from 'react'
import TiptapEditor from './tiptap-editor'
import { fetchRoleAssignments, formatDraft, saveFinalAgenda } from '@/app/actions/agenda'
import { MINOR_ROLES } from '@/lib/agenda-logic'

// Boilerplate Template 
const DEFAULT_TEMPLATE = `
  <p>Good evening Toastmasters,</p>
  <p>The theme for this week is: <strong>[THEME]</strong>!</p>
  <p>Please review the attached agenda. If you cannot attend, please reply to this email to let us know immediately.</p>
  <p>Best,<br>Toastmaster</p>
`

export default function AgendaWizard({ meetingId }: { meetingId: string }) {
  const [step, setStep] = useState(1)
  const [emailDraft, setEmailDraft] = useState('')
  const [meetingType, setMeetingType] = useState('Regular')
  const [meetingTheme, setMeetingTheme] = useState('')
  
  // Roles Data
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [minorRoles, setMinorRoles] = useState<Record<string, any>>({})
  const [unassigned, setUnassigned] = useState<any[]>([])
  const [preAssigned, setPreAssigned] = useState<any[]>([])
  
  const [allowDoubleRoles, setAllowDoubleRoles] = useState(false)
  const [clipboardStatus, setClipboardStatus] = useState('Copy to Clipboard')

  // Load Initial Setup on Mount
  useEffect(() => {
    const savedDraft = localStorage.getItem('dtcgc_email_draft')
    if (savedDraft) {
      setEmailDraft(savedDraft)
    } else {
      setEmailDraft(DEFAULT_TEMPLATE)
    }

    const loadRoles = async () => {
        try {
            const data = await fetchRoleAssignments(meetingId)
            setMinorRoles(data.assignments)
            setUnassigned(data.unassigned)
            setPreAssigned(data.preAssignedMajor)
            setLoadingRoles(false)
        } catch (e) {
            console.error("Failed to load roles:", e)
        }
    }
    loadRoles()
  }, [meetingId])

  // --- Double Role Cleansing ---
  useEffect(() => {
    if (!allowDoubleRoles) {
        const newMinorRoles = { ...minorRoles };
        const pool = [...unassigned];
        const alreadyAssigned = new Set();
        
        // Major roles are primary, add them to the "already occupied" set first
        preAssigned.forEach(a => {
            if (a.userId) alreadyAssigned.add(a.userId);
        });

        let changed = false;
        Object.keys(newMinorRoles).forEach(role => {
            const user = newMinorRoles[role];
            if (user && alreadyAssigned.has(user.id)) {
                // Conflict! This person already has a role. Revert this specific minor assignment.
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
  }, [allowDoubleRoles]);

  // Save draft incrementally
  useEffect(() => {
    if (emailDraft) {
        localStorage.setItem('dtcgc_email_draft', emailDraft)
    }
  }, [emailDraft])

  const handleNextStep = async () => {
      if (step === 1) {
          const cleaned = await formatDraft(emailDraft)
          setEmailDraft(cleaned)
      }
      setStep(prev => prev + 1)
  }

  const handleRoleChange = (roleName: string, userId: string) => {
    const selectedUser = unassigned.find(u => u.id === userId) || null;
    const displacedUser = minorRoles[roleName];

    // Enforcement: If double roles are disabled, check for existing commitments
    if (!allowDoubleRoles && selectedUser) {
        const hasOtherMinor = Object.values(minorRoles).some(u => u?.id === selectedUser.id);
        const hasMajor = preAssigned.some(a => a.userId === selectedUser.id);
        
        if (hasOtherMinor || hasMajor) {
            alert(`Conflict: ${selectedUser.displayName} is already assigned to another role. Please enable 'Allow Double Roles' or unassign their other commitment first.`);
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

  const handleFinish = async () => {
    try {
        await saveFinalAgenda(meetingId, minorRoles);
        window.location.href = '/agenda';
    } catch (e) {
        console.error("Failed to save final agenda:", e);
        alert("Persistence Error: Could not save the finalized roles to the server.");
    }
  }

  const handleCopy = () => {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = emailDraft;
      let textData = tempDiv.textContent || tempDiv.innerText || "";
      
      textData += `\n\n---\nTheme: ${meetingTheme}\nType: ${meetingType}\n`;
      textData += `\n[MEETING ROLES - CHRONOLOGICAL]\n`;
      
      const roleSequence = [
          "Sergeant at Arms",
          "Toastmaster",
          "Timer",
          "Grammarian",
          "Filler Word Counter",
          "Quizmaster",
          "Speaker 1",
          "Speaker 2",
          "Speaker 3",
          "Evaluator 1",
          "Evaluator 2",
          "Evaluator 3",
          "Roles For Next Meeting",
          "Business Meeting",
          "Table Topics Master",
          "Table Topics Evaluator 1",
          "Table Topics Evaluator 2"
      ];

      roleSequence.forEach(roleName => {
          let holder = "TBD";
          
          if (roleName === "Roles For Next Meeting") holder = "John";
          else if (roleName === "Business Meeting") holder = "Andrew";
          else {
              // Check Major roles
              const major = preAssigned.find((a: any) => a.roleName === roleName);
              if (major) {
                  const u = (major as any).user;
                  holder = u?.displayName || "TBD";
              } else {
                  // Check Minor roles
                  const user = minorRoles[roleName];
                  if (user) holder = user.displayName;
              }
          }
          
          textData += `${roleName}: ${holder}\n`;
      });

      navigator.clipboard.writeText(textData.trim()).then(() => {
          setClipboardStatus("Copied!")
          setTimeout(() => setClipboardStatus("Copy to Clipboard"), 3000)
      })
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border p-8">
      {/* Progress Indicator */}
      <div className="flex justify-between border-b pb-4 mb-8">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className="flex flex-col items-center">
             <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white transition-colors duration-300 ${step >= s ? 'bg-brand-loyal-blue' : 'bg-gray-200'}`}>
                {s}
             </div>
             <span className="text-xs text-gray-500 mt-2 font-medium">
                 {s === 1 && 'Draft'}
                 {s === 2 && 'Settings'}
                 {s === 3 && 'Roles'}
                 {s === 4 && 'Execute'}
             </span>
          </div>
        ))}
      </div>

      <div className="min-h-[400px]">
        {/* Step 1: WYSIWYG Editor */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-xl font-bold border-l-4 pl-3 border-brand-loyal-blue">Email Draft</h2>
            <p className="text-gray-600 text-sm">Draft the email body here. Progress is auto-saved locally. <span className="font-semibold text-brand-true-maroon cursor-help underline underline-offset-4 decoration-dashed" title="Use the [THEME] tag to dynamically inject the chosen theme in step 2. Be warm and welcoming!">How do I write this?</span></p>
            <TiptapEditor content={emailDraft} onChange={setEmailDraft} />
          </div>
        )}

        {/* Step 2: Settings */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 max-w-lg">
             <h2 className="text-xl font-bold border-l-4 pl-3 border-brand-loyal-blue">Agenda Parameters</h2>
             <div className="space-y-2">
                 <label className="font-semibold text-sm">Meeting Type</label>
                 <select 
                     className="w-full border p-3 rounded"
                     value={meetingType}
                     onChange={(e) => setMeetingType(e.target.value)}
                 >
                     <option value="Regular">Regular Meeting</option>
                     <option value="Education">Education Session</option>
                     <option value="Contest">Contest</option>
                 </select>
             </div>
             <div className="space-y-2">
                 <label className="font-semibold text-sm">Meeting Theme (Required)</label>
                 <input 
                     type="text"
                     placeholder="e.g., Spring Forward"
                     className="w-full border p-3 rounded focus:ring-2 focus:ring-brand-loyal-blue outline-none transition"
                     value={meetingTheme}
                     onChange={(e) => setMeetingTheme(e.target.value)}
                 />
             </div>
          </div>
        )}

        {/* Step 3: Roles */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <div className="flex justify-between items-center">
                 <h2 className="text-xl font-bold border-l-4 pl-3 border-brand-loyal-blue">Role Assignments</h2>
                 
                 <label className="flex items-center space-x-2 text-sm bg-gray-100 p-2 rounded cursor-pointer">
                     <input 
                        type="checkbox" 
                        className="accent-brand-true-maroon w-4 h-4"
                        checked={allowDoubleRoles}
                        onChange={(e) => setAllowDoubleRoles(e.target.checked)}
                     />
                     <span className={allowDoubleRoles ? 'text-brand-true-maroon font-bold' : 'text-gray-600'}>
                         Allow Double Roles
                     </span>
                 </label>
             </div>

             {allowDoubleRoles && (
                 <div className="bg-red-50 text-red-700 p-3 rounded text-sm border border-red-200">
                     <strong>Warning:</strong> Double roles are enabled. The heuristic shuffle has been paused. You must manually assign attendees.
                 </div>
             )}

             {loadingRoles ? (
                 <div className="py-12 text-center text-gray-400">Computing Historical Assignments...</div>
             ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div>
                         <h3 className="font-bold text-gray-700 mb-4 bg-gray-100 p-2 rounded">Minor Roles (Auto-Shuffled)</h3>
                         <div className="space-y-2">
                             {Object.entries(minorRoles).map(([role, user]) => (
                                 <div key={role} className="flex justify-between items-center text-sm border-b pb-2">
                                     <span className="font-medium text-gray-600">{role}</span>
                                     <select 
                                        className={`px-2 py-1 rounded text-xs outline-none border ${user ? 'bg-brand-happy-yellow/30 border-brand-happy-yellow/50 text-yellow-800' : 'bg-red-50 border-red-200 text-red-800'}`}
                                        value={user?.id || ""}
                                        onChange={(e) => handleRoleChange(role, e.target.value)}
                                     >
                                        <option value="">-- UNASSIGNED --</option>
                                        {user && <option value={user.id}>{user.displayName}</option>}
                                        {unassigned.map(u => (
                                            <option key={u.id} value={u.id}>{u.displayName}</option>
                                        ))}
                                     </select>
                                 </div>
                             ))}
                         </div>
                     </div>

                     <div className="space-y-6">
                         <div>
                             <h3 className="font-bold text-gray-700 mb-4 bg-brand-true-maroon text-white p-2 rounded flex justify-between">
                                 <span>Major Roles</span>
                                 <span className="text-xs opacity-75 font-normal self-center">(Admin Controlled)</span>
                             </h3>
                             {preAssigned.length === 0 ? (
                                 <p className="text-sm text-gray-500 italic">No major roles assigned yet.</p>
                             ) : (
                                 <div className="space-y-3 text-sm">
                                      {preAssigned.map((a: any) => (
                                          <div key={a.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                                              <span className="font-semibold text-gray-600">{a.roleName}</span>
                                              <span className="text-brand-loyal-blue font-black tracking-tight bg-brand-loyal-blue/5 px-2 py-0.5 rounded">
                                                  {a.user ? `${a.user.firstName} ${a.user.lastName}` : "TBD"}
                                              </span>
                                          </div>
                                      ))}
                                 </div>
                             )}
                         </div>

                         <div>
                             <h3 className="font-bold text-gray-700 mb-2 border-b border-gray-300 pb-1">Unassigned Members</h3>
                             <p className="text-xs text-gray-400 mb-2">Members attending without a formal designated action role.</p>
                             <div className="flex flex-wrap gap-2 text-xs">
                                 {unassigned.length > 0 ? unassigned.map(u => (
                                     <span key={u.id} className="bg-gray-100 border px-2 py-1 text-gray-600 rounded-full">{u.displayName}</span>
                                 )) : (
                                     <span className="text-gray-400 italic">Everyone is participating!</span>
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
             <div className="bg-brand-loyal-blue/10 border-l-4 border-brand-loyal-blue p-4 rounded-r flex justify-between items-center">
                 <div>
                     <h2 className="text-lg font-bold text-brand-loyal-blue">Final Review</h2>
                     <p className="text-sm text-gray-600">The agenda schema is fully mapped. The Google API is currently pending integration.</p>
                 </div>
                 <button className="bg-gray-300 text-gray-500 px-6 py-2 rounded font-bold cursor-not-allowed" disabled>
                     Generate & Send via API
                 </button>
             </div>

             <div className="bg-gray-50 p-6 rounded border border-gray-200 text-center space-y-4">
                 <h3 className="font-bold text-xl text-brand-true-maroon text-center">Manual Fallback Pipeline</h3>
                 <p className="text-gray-600">Use the manual clipboard functionality to bypass the API restrictions.</p>
                 <button 
                     onClick={handleCopy}
                     className="bg-brand-true-maroon text-white px-8 py-3 rounded-lg shadow-md hover:bg-opacity-90 transition font-bold"
                 >
                     {clipboardStatus}
                 </button>
             </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex justify-between border-t pt-4">
          <button 
              onClick={() => setStep(prev => prev - 1)} 
              disabled={step === 1}
              className={`px-6 py-2 rounded font-medium ${step === 1 ? 'opacity-0 cursor-default' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
              Back
          </button>
          
          {step < 4 ? (
              <button 
                  onClick={handleNextStep}
                  disabled={(step === 2 && !meetingTheme)} // Require theme
                  className={`px-6 py-2 rounded font-bold transition-opacity ${step === 2 && !meetingTheme ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-brand-loyal-blue text-white shadow hover:opacity-90'}`}
              >
                  Next Step
              </button>
          ) : (
              <button className="bg-green-600 px-6 py-2 text-white font-bold rounded shadow hover:opacity-90" onClick={handleFinish}>Finish</button>
          )}
      </div>
    </div>
  )
}
