/**
 * Shadcn/UI Utility Module
 *
 * Provides the `cn()` helper used across all UI components to merge
 * Tailwind CSS class names. Combines clsx (conditional classes) with
 * tailwind-merge (deduplication of conflicting Tailwind utilities).
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** Merges and deduplicates Tailwind class names. Accepts conditional class values. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
