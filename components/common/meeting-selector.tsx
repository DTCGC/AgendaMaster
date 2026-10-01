/**
 * Upcoming-meeting picker for the admin views that edit one meeting at a
 * time (/admin/roles and the admin side of /agenda/create).
 */
import Link from "next/link"
import { ChevronRight, FileSpreadsheet } from "lucide-react"
import { SectionLabel } from "@/components/common/page"
import { formatMeetingDateShort } from "@/lib/meeting-time"
import { cn } from "@/lib/utils"

export function MeetingSelector({ meetings, currentId, hrefFor, showSheetStatus = false, note }: {
  meetings: { id: string; date: Date; theme: string | null; googleSheetId?: string | null }[]
  currentId: string
  hrefFor: (meetingId: string) => string
  /** Show whether each meeting's agenda sheet exists yet. */
  showSheetStatus?: boolean
  note?: React.ReactNode
}) {
  return (
    <nav aria-label="Upcoming meetings" className="space-y-4">
      <SectionLabel className="px-1">Upcoming Meetings</SectionLabel>
      <ul className="space-y-2">
        {meetings.map((meeting) => {
          const selected = meeting.id === currentId
          return (
            <li key={meeting.id}>
              <Link
                href={hrefFor(meeting.id)}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border p-4 transition-colors",
                  selected
                    ? "border-brand-true-maroon bg-brand-true-maroon text-white shadow-md"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                )}
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-lg font-black">{formatMeetingDateShort(meeting.date)}</p>
                  <p className={cn("truncate text-xs", selected ? "text-white/80" : "text-gray-500")}>
                    {meeting.theme || "Theme not set"}
                  </p>
                  {showSheetStatus && (
                    <p className={cn(
                      "flex items-center gap-1 text-xs font-semibold",
                      selected ? "text-white/80" : meeting.googleSheetId ? "text-green-700" : "text-gray-500"
                    )}>
                      <FileSpreadsheet size={12} />
                      {meeting.googleSheetId ? "Sheet generated" : "No sheet yet"}
                    </p>
                  )}
                </div>
                <ChevronRight size={18} className={cn("shrink-0", selected ? "text-white" : "text-gray-400")} />
              </Link>
            </li>
          )
        })}
      </ul>
      {note && <p className="px-1 text-xs leading-relaxed text-gray-500">{note}</p>}
    </nav>
  )
}
