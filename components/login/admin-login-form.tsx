'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, AlertCircle } from 'lucide-react'

export default function AdminLoginForm() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError('')

        try {
            const result = await signIn('credentials', {
                email,
                password,
                redirect: false,
            })

            if (result?.error) {
                setError('Invalid admin credentials.')
            } else {
                router.push('/admin/calendar')
                router.refresh()
            }
        } catch {
            setError('Authentication failed.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3 w-full">
            <div className="flex items-center gap-2 mb-4">
                <ShieldCheck size={16} className="text-brand-true-maroon" />
                <span className="text-[10px] font-bold text-brand-true-maroon uppercase tracking-widest">Executive Login</span>
            </div>

            {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 text-xs font-medium animate-in fade-in duration-200">
                    <AlertCircle size={14} />
                    {error}
                </div>
            )}

            <div>
                <input 
                    name="email" 
                    type="email" 
                    placeholder="Admin Email" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-true-maroon/20 outline-none transition-all placeholder:text-gray-300" 
                />
            </div>
            <div>
                <input 
                    name="password" 
                    type="password" 
                    placeholder="Administrator Password" 
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-true-maroon/20 outline-none transition-all placeholder:text-gray-300" 
                />
            </div>
            <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-brand-true-maroon text-white font-bold rounded-xl p-3 hover:opacity-90 transition-opacity shadow-lg shadow-brand-true-maroon/20 text-sm disabled:opacity-50"
            >
                {isLoading ? 'Authenticating...' : 'Authenticate Admin'}
            </button>
        </form>
    )
}
