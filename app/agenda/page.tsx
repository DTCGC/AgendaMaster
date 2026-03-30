import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AgendaPage() {
  const session = await auth();
  
  // Example of role-based conditional rendering defined in spec
  const isToastmaster = session?.user?.role === 'ADMIN'; // Mock logic for now

  return (
    <div className="flex-1 p-8 bg-brand-cool-grey/10">
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-md border-t-4 border-brand-loyal-blue">
        <h1 className="text-4xl font-extrabold text-brand-loyal-blue mb-4">Club Agenda</h1>
        <p className="text-gray-600 mb-8 border-b pb-4">
          Welcome back, {session?.user?.name}. You are viewing the read-only schedule for the upcoming meeting.
        </p>

        {isToastmaster && (
          <div className="mb-8 p-6 bg-brand-happy-yellow/20 rounded-lg border-l-4 border-brand-happy-yellow">
            <h2 className="text-xl font-bold mb-2">Toastmaster Controls</h2>
            <p className="text-sm text-gray-700 mb-4">You have been designated as the Toastmaster. You may begin the automated agenda creation workflow.</p>
            <Link href="/agenda/create" className="bg-brand-loyal-blue text-white font-bold py-2 px-6 rounded shadow hover:opacity-90 transition-all inline-block mt-2">
              Start Workflow
            </Link>
          </div>
        )}
        
        <div className="p-12 text-center text-gray-400 border-2 border-dashed rounded-lg">
          [Upcoming Meeting Agenda Data]
        </div>
      </div>
    </div>
  );
}
