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

/**
 * Adiciona N meses a uma data ISO (YYYY-MM-DD) e retorna nova data ISO.
 * Usa meio-dia UTC para evitar problemas de fuso horário.
 * Retorna null se qualquer argumento for nulo/indefinido.
 */
export function addMonthsToIso(
  isoDate: string | null | undefined,
  months: number | null | undefined,
): string | null {
  if (!isoDate || !months) return null;
  const d = new Date(isoDate + "T12:00:00Z");
  if (isNaN(d.getTime())) return null;
  d.setUTCMonth(d.getUTCMonth() + months);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}
