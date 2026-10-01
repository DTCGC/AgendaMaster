/**
 * Cache invalidation for every page that shows meeting or roster data.
 * One helper, so a new view can't be forgotten by half the actions.
 */
import { revalidatePath } from 'next/cache'

export function revalidateMeetingViews() {
  revalidatePath('/agenda')
  revalidatePath('/agenda/create')
  revalidatePath('/admin/calendar')
  revalidatePath('/admin/roles')
}
