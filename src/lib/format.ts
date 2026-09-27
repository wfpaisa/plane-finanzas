/** Pesos colombianos, fechas y otras formas de escribir. */

const num = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** $9.917.228 · −$169.000: el número completo, nunca abreviado. */
export function money(n: number | null | undefined): string {
  const v = Number.isFinite(n) ? (n as number) : 0;
  // El redondeo, igual para los dos lados: −1,5 da −$2 como 1,5 da $2.
  const abs = Math.round(Math.abs(v));
  return `${v < 0 && abs ? "−" : ""}$${num.format(abs)}`;
}

/**
 * $14.2M · $7.0M · $850K: abreviado, para los ejes de las gráficas en el
 * celular. Los millones llevan siempre un decimal, así las marcas del eje
 * miden lo mismo y se leen en columna.
 */
export function moneyShort(n: number | null | undefined): string {
  const v = Number.isFinite(n) ? (n as number) : 0;
  const abs = Math.abs(v);
  const sign = v < 0 && Math.round(abs) ? "−" : "";
  if (abs >= 999_950) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${String(Math.round(abs / 100) / 10)}K`;
  return money(v);
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

const pad2 = (n: number) => String(n).padStart(2, "0");
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** "2026/09/22": las fechas que se eligen o se escriben van año/mes/día. "" si no hay. */
export function dateYmd(s: string): string {
  const [y, m, d] = parts(s);
  return y && m && d ? `${y}/${pad2(m)}/${pad2(d)}` : "";
}

/** "2026/09/22" (o "2026-9-22") -> "2026-09-22"; null si no es una fecha que exista. */
export function parseYmd(text: string): string | null {
  const m = /^\s*(\d{4})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*$/.exec(text);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const t = new Date(y, mo - 1, d);
  if (t.getFullYear() !== y || t.getMonth() !== mo - 1 || t.getDate() !== d) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/** "2026 · Septiembre" ("2026 · Sep" corto): un mes, con el año primero como las fechas. */
export function monthYm(ym: string, short = false): string {
  const [y, m] = parts(ym);
  return `${y} · ${cap((short ? MONTHS : MONTHS_LONG)[m - 1])}`;
}

/** Los nombres para el calendario (lib vanilla-calendar-pro), en español. */
export const calendarLocale = {
  months: { long: MONTHS_LONG.map(cap), short: MONTHS.map(cap) },
  weekdays: { long: DAYS.map(cap), short: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] },
};

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
