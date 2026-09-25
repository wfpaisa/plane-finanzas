/** Pesos colombianos, fechas y otras formas de escribir. */

const num = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** $9.917.228 · −$169.000: el número completo, nunca abreviado. */
export function money(n: number | null | undefined): string {
  const v = Math.round(n ?? 0);
  return `${v < 0 ? "−" : ""}$${num.format(Math.abs(v))}`;
}

export const plainNumber = (n: number) => num.format(Math.round(n));

/** "9.917.228" -> 9917228. Acepta lo que escribe una persona. */
export function parseMoney(s: string): number {
  const clean = String(s ?? "").replace(/[^\d,-]/g, "").replace(",", ".");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const parts = (s: string) => String(s).slice(0, 10).split("-").map(Number);

/** "22 sep" */
export function dateShort(s: string): string {
  const [, m, d] = parts(s);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "lunes 22 de septiembre" */
export function dateLong(s: string): string {
  const [y, m, d] = parts(s);
  const dow = new Date(y, m - 1, d).getDay();
  const thisYear = new Date().getFullYear() === y;
  return `${DAYS[dow]} ${d} de ${MONTHS_LONG[m - 1]}${thisYear ? "" : ` de ${y}`}`;
}

/** "2026-09" -> "sep 2026" / "septiembre 2026" */
export function monthLabel(ym: string, long = false): string {
  const [y, m] = parts(ym);
  return `${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${y}`;
}

export const monthName = (m: number) => MONTHS_LONG[m - 1];

/** "Semana del 21 sep" */
export const weekLabel = (monday: string) => `Sem ${dateShort(monday)}`;

/** Duración en meses -> "2 años y 3 meses". */
export function monthsLabel(n: number): string {
  if (n <= 0) return "ya";
  const y = Math.floor(n / 12);
  const m = n % 12;
  const ys = y ? `${y} ${y === 1 ? "año" : "años"}` : "";
  const ms = m ? `${m} ${m === 1 ? "mes" : "meses"}` : "";
  return [ys, ms].filter(Boolean).join(" y ");
}

export const percent = (n: number) => `${Math.round(n)}%`;
