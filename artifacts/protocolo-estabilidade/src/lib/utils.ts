import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converte data do formato ISO YYYY-MM-DD para DD/MM/YYYY.
 * Datas já no formato DD/MM/YYYY ou valores nulos/vazios são retornados sem alteração.
 */
export function fmtDate(date: string | null | undefined): string | null | undefined {
  if (!date) return date;
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return date;
}
