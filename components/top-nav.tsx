'use client'

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { LogOut, X } from "lucide-react";

export function TopNav({ role }: { role?: string }) {
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const isAdmin = role === 'ADMIN';
  const isMember = role === 'MEMBER' || role === 'ADMIN';

  // Toggle based on Admin vs Standard view semantics prescribed by the design system
  const bgColor = isAdmin ? 'bg-brand-true-maroon' : 'bg-brand-loyal-blue';

  return (
    <>
    <div className={`w-full ${bgColor} text-white px-6 py-4 shadow-md flex justify-between items-center z-40 relative`}>
        <Link href="/" className="flex items-center gap-3 group">
            <div className="bg-white p-1.5 rounded shadow-sm group-hover:scale-105 transition-transform">
                <Image 
                    src={isAdmin ? "/assets/images/TrueMaroon/GavelClubLogoTrueMaroon-RGB.png" : "/assets/images/LoyalBlue/GavelClubLogoLoyalBlue-RGB.png"} 
                    alt="Logo" 
                    width={100} 
                    height={30} 
                    className="mix-blend-multiply"
                />
            </div>
            <div className="font-bold text-xl tracking-wider select-none hidden sm:block">
                DTCGC
            </div>
        </Link>
        
        <NavigationMenu>
            <NavigationMenuList className="space-x-1 lg:space-x-2">
                {isMember && (
                    <NavigationMenuItem>
                    <Link 
                        href="/agenda" 
                        className={`${navigationMenuTriggerStyle()} bg-transparent text-white hover:bg-white/20 hover:text-white cursor-pointer`}
                    >
                        Agenda
                    </Link>
                    </NavigationMenuItem>
                )}
                
                {isAdmin && (
                    <>
                        <NavigationMenuItem>
                        <Link 
                            href="/admin/calendar" 
                            className={`${navigationMenuTriggerStyle()} bg-transparent text-white hover:bg-white/20 hover:text-white cursor-pointer`}
                        >
                            Calendar
                        </Link>
                        </NavigationMenuItem>
                        
                        <NavigationMenuItem>
                        <Link 
                            href="/admin/roles" 
                            className={`${navigationMenuTriggerStyle()} bg-transparent text-white hover:bg-white/20 hover:text-white cursor-pointer`}
                        >
                            Roles
                        </Link>
                        </NavigationMenuItem>

                        <NavigationMenuItem className="hidden md:block">
                        <Link 
                            href="/admin/accounts" 
                            className={`${navigationMenuTriggerStyle()} bg-transparent text-white hover:bg-white/20 hover:text-white cursor-pointer`}
                        >
                            Approvals
                        </Link>
                        </NavigationMenuItem>
                        
                        <NavigationMenuItem className="hidden md:block">
                        <Link 
                            href="/admin/comms" 
                            className={`${navigationMenuTriggerStyle()} bg-transparent text-white hover:bg-white/20 hover:text-white cursor-pointer`}
                        >
                            Comms
                        </Link>
                        </NavigationMenuItem>
                    </>
                )}
            </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center">
            {role ? (
                <button 
                    onClick={() => setShowSignOutModal(true)} 
                    className="text-sm font-bold opacity-80 hover:opacity-100 transition-opacity bg-white/10 px-4 py-2 rounded-lg border border-white/20"
                >
                    Sign Out
                </button>
            ) : (
                <Link href="/api/auth/signin" className="text-sm font-bold opacity-80 hover:opacity-100 transition-opacity border border-white/40 px-4 py-2 rounded-lg">
                    Login
                </Link>
            )}
        </div>
    </div>

    {/* Sign Out Modal */}
    {showSignOutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
                onClick={() => setShowSignOutModal(false)}
            />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className={`${isAdmin ? 'bg-brand-true-maroon' : 'bg-brand-loyal-blue'} p-6 text-white text-center`}>
                    <div className="mx-auto w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
                        <LogOut size={32} />
                    </div>
                    <h2 className="text-xl font-bold">Leaving so soon?</h2>
                    <p className="text-sm opacity-80 mt-1">Confirm your departure from the DTCGC portal.</p>
                </div>
                
                <div className="p-6 space-y-3">
                    <button 
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className={`w-full py-3 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 ${isAdmin ? 'bg-brand-true-maroon hover:bg-opacity-90' : 'bg-brand-loyal-blue hover:bg-opacity-90'}`}
                    >
                        Sign Out
                    </button>
                    <button 
                        onClick={() => setShowSignOutModal(false)}
                        className="w-full py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
                    >
                        <X size={18} /> Cancel
                    </button>
                </div>
            </div>
        </div>
    )}
    </>
  );
}
