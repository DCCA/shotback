import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * "1 note" / "2 notes". The whole of the pluralisation rule for this UI: every
 * count the sidebar, the timeline and the export statuses render goes through
 * here, so no surface can be left saying "1 notes".
 */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}
