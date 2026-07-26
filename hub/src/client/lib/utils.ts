import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * shadcn/ui's class-name helper: `clsx` for conditionals, `twMerge` to make
 * the last conflicting Tailwind utility win (so a caller's `className` can
 * override a component's defaults instead of losing to source order).
 *
 * Every generated component in components/ui/ imports this by name from
 * '@/lib/utils'. It is not optional and must not be renamed.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
