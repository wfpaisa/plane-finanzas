/**
 * Lo mismo que hace el servidor con las reglas (pb_hooks/lib/rules.js), para
 * mostrarlo en el formulario antes de guardar: si un correo cumple la
 * condición y cómo queda la descripción.
 */
import { monthName } from "./format";

/** Texto comparable: sin tildes, en minúscula y con los espacios juntos. */
export function norm(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const list = (s: string) => s.split(",").map(norm).filter(Boolean);

/**
 * Las cuentas cuyo remitente aparece en el "De:" del correo, como las busca
 * el servidor (`accountBySender` en pb_hooks/lib/inbox.js, que usa la primera).
 */
export function accountsBySender<T extends { senders: string[] | null }>(from: string, accounts: readonly T[]): T[] {
  const who = norm(from);
  if (!who) return [];
  return accounts.filter((a) => (a.senders ?? []).map(norm).some((s) => s && who.includes(s)));
}

/** Si un correo cumple la condición: remitente (si hay) y alguno de los textos (si hay). */
export function mailMatches(cond: { sender: string; match: string; amount?: number }, mail: { sender: string; subject: string; text: string; amount?: number }): boolean {
  const senders = list(cond.sender);
  const keys = list(cond.match);
  if (!senders.length && !keys.length) return false;
  const who = norm(mail.sender);
  if (senders.length && !senders.some((s) => who.includes(s))) return false;
  const hay = ` ${norm(`${mail.subject}\n${mail.text}`)} `;
  if (keys.length && !keys.some((k) => hay.includes(k))) return false;
  if (cond.amount && Math.abs(cond.amount - Math.abs(mail.amount ?? 0)) >= 0.005) return false;
  return true;
}

/** Qué campos de la condición no se cumplen en el correo (uno vacío siempre se cumple). */
export function mailMisses(cond: { sender: string; match: string; amount?: number }, mail: { sender: string; subject: string; text: string; amount?: number }): { sender: boolean; match: boolean; amount: boolean } {
  const senders = list(cond.sender);
  const keys = list(cond.match);
  const who = norm(mail.sender);
  const hay = ` ${norm(`${mail.subject}\n${mail.text}`)} `;
  return {
    sender: senders.length > 0 && !senders.some((s) => who.includes(s)),
    match: keys.length > 0 && !keys.some((k) => hay.includes(k)),
    amount: !!cond.amount && Math.abs(cond.amount - Math.abs(mail.amount ?? 0)) >= 0.005,
  };
}

/** La descripción de la regla con sus marcas resueltas; `date` es "AAAA-MM-DD". */
export function renderDescription(template: string, date: string, original: string): string {
  return template
    .replace(/\{mes\}/gi, monthName(+date.slice(5, 7)) ?? "")
    .replace(/\{año\}|\{ano\}/gi, date.slice(0, 4))
    .replace(/\{original\}/gi, original)
    .replace(/\s+/g, " ")
    .trim();
}

/** Cómo se llama una regla en la lista: su nombre, o sus textos. */
export function ruleLabel(r: { name?: string; match?: string; sender?: string } | undefined | null): string {
  if (!r) return "una regla";
  return r.name?.trim() || r.match?.split(",").map((k) => k.trim()).filter(Boolean).join(", ") || r.sender || "una regla";
}
