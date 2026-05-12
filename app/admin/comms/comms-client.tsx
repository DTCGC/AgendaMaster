/**
 * Mass Broadcast Client Component
 *
 * Admin-facing rich email composition interface with target group selection.
 * Supports three delivery targets: Active Members, Guest Subscribers, or All.
 * Includes a clipboard fallback for manual email dispatch.
 */
'use client'

import { useState } from 'react'
import TiptapEditor from '@/components/agenda/tiptap-editor'
import { dispatchMassComms } from '@/app/actions/comms'
import { Megaphone, Send, Users, Globe, Copy, CheckCircle2 } from 'lucide-react'

export default function CommsClient() {
    const [subject, setSubject] = useState('')
    const [htmlBody, setHtmlBody] = useState('<p>Enter your professional club update here.</p>')
    const [targetGroup, setTargetGroup] = useState<'MEMBERS' | 'SUBSCRIBERS' | 'ALL'>('MEMBERS')
    const [isDispatching, setIsDispatching] = useState(false)
    const [resultMsg, setResultMsg] = useState('')
    const [copied, setCopied] = useState(false)

    const handleDispatch = async () => {
        if (!subject.trim() || !htmlBody.trim()) {
            setResultMsg("Subject and body are heavily required.");
            return;
        }

        setIsDispatching(true);
        setResultMsg('');
        
        try {
            const result = await dispatchMassComms(subject, htmlBody, targetGroup);
            if (result.success) {
                setResultMsg(`Transmission successful. Reached ${result.recipientCount} inboxes.`);
            } else {
                setResultMsg(result.message || "Failed to dispatch.");
            }
        } catch (e) {
            setResultMsg("Network error occurred during transmission.");
        } finally {
            setIsDispatching(false);
        }
    }

    const handleCopyManual = () => {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = htmlBody;
        const textData = tempDiv.textContent || tempDiv.innerText || "";
        navigator.clipboard.writeText(`[${targetGroup} Blast] - ${subject}\n\n${textData}`).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
        });
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b bg-gray-50 flex items-center gap-2 font-bold text-gray-700">
                        <Megaphone size={18} className="text-brand-true-maroon" /> Composition Output
                    </div>
                    
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="text-sm font-semibold text-gray-600 block mb-1">Subject Header</label>
                            <input 
                                type="text"
                                className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-brand-loyal-blue transition"
                                placeholder="Special Announcement: DTCGC Spring Contest"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="text-sm font-semibold text-gray-600 block mb-1">Body Architecture</label>
                            <TiptapEditor content={htmlBody} onChange={setHtmlBody} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                 <div className="bg-white border rounded-xl shadow-sm overflow-hidden p-6 space-y-6">
                     <div>
                         <h3 className="font-bold text-gray-800 mb-2 border-b pb-2">Target Node</h3>
                         <div className="space-y-2 mt-4">
                             <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${targetGroup === 'MEMBERS' ? 'border-brand-loyal-blue bg-blue-50' : 'hover:bg-gray-50'}`}>
                                 <input type="radio" name="target" value="MEMBERS" className="accent-brand-loyal-blue w-4 h-4" checked={targetGroup === 'MEMBERS'} onChange={() => setTargetGroup('MEMBERS')} />
                                 <Users size={18} className={targetGroup === 'MEMBERS' ? 'text-brand-loyal-blue' : 'text-gray-400'} />
                                 <div className="flex flex-col">
                                     <span className="font-semibold text-sm">Active Members</span>
                                     <span className="text-xs text-gray-500">Internal roster (including Execs)</span>
                                 </div>
                             </label>

                             <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${targetGroup === 'SUBSCRIBERS' ? 'border-brand-loyal-blue bg-blue-50' : 'hover:bg-gray-50'}`}>
                                 <input type="radio" name="target" value="SUBSCRIBERS" className="accent-brand-loyal-blue w-4 h-4" checked={targetGroup === 'SUBSCRIBERS'} onChange={() => setTargetGroup('SUBSCRIBERS')} />
                                 <Globe size={18} className={targetGroup === 'SUBSCRIBERS' ? 'text-brand-loyal-blue' : 'text-gray-400'} />
                                 <div className="flex flex-col">
                                     <span className="font-semibold text-sm">Guest Subscribers</span>
                                     <span className="text-xs text-gray-500">External public waitlist</span>
                                 </div>
                             </label>
                             
                             <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${targetGroup === 'ALL' ? 'border-brand-true-maroon bg-red-50' : 'hover:bg-gray-50'}`}>
                                 <input type="radio" name="target" value="ALL" className="accent-brand-true-maroon w-4 h-4" checked={targetGroup === 'ALL'} onChange={() => setTargetGroup('ALL')} />
                                 <Megaphone size={18} className={targetGroup === 'ALL' ? 'text-brand-true-maroon' : 'text-gray-400'} />
                                 <div className="flex flex-col">
                                     <span className="font-semibold text-sm">Global Blast</span>
                                     <span className="text-xs text-gray-500">All recorded non-pending emails</span>
                                 </div>
                             </label>
                         </div>
                     </div>

                     <div className="pt-2 border-t space-y-3">
                         <button 
                             onClick={handleDispatch}
                             disabled={isDispatching || !subject.trim()}
                             className="w-full flex items-center justify-center gap-2 bg-brand-loyal-blue text-white font-bold py-3 rounded-lg hover:bg-opacity-90 transition-opacity disabled:opacity-50"
                         >
                            <Send size={18} />
                            {isDispatching ? 'Transmitting Data...' : 'Dispatch Protocol'}
                         </button>

                         <button 
                             onClick={handleCopyManual}
                             className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-600 font-bold py-3 rounded-lg hover:bg-gray-200 transition-colors border"
                         >
                            {copied ? <CheckCircle2 size={18} className="text-green-600" /> : <Copy size={18} />}
                            {copied ? 'Copied to Clipboard' : 'Manual Txt Fallback'}
                         </button>

                         {resultMsg && (
                             <div className={`p-3 text-sm rounded ${resultMsg.includes('successful') ? 'bg-green-100 text-green-800' : 'bg-brand-happy-yellow/30 text-yellow-800'}`}>
                                 {resultMsg}
                             </div>
                         )}
                     </div>
                 </div>
            </div>
        </div>
    )
}
