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

// ---------- Descripción: marcas y filtros (como pb_hooks/lib/merchants.js) ----------

/** Municipios que los bancos ponen al final del comercio. Igual que en merchants.js. */
const CITIES = new Set([
  "bogota", "bogota dc", "bogota d.c", "bogota d.c.", "medellin", "cali", "barranquilla", "cartagena", "cucuta", "bucaramanga",
  "pereira", "manizales", "armenia", "ibague", "villavicencio", "santa marta", "pasto", "neiva", "monteria", "valledupar",
  "sincelejo", "popayan", "tunja", "riohacha", "quibdo", "florencia", "yopal", "leticia", "san andres", "mocoa", "arauca",
  "envigado", "sabaneta", "itagui", "bello", "la estrella", "caldas", "copacabana", "girardota", "rionegro", "la ceja",
  "marinilla", "guarne", "el retiro", "la union", "el carmen de viboral", "carmen de viboral", "santa fe de antioquia",
  "apartado", "turbo", "caucasia", "soacha", "chia", "cajica", "zipaquira", "mosquera", "funza", "madrid", "facatativa",
  "fusagasuga", "girardot", "cota", "tocancipa", "sopo", "la calera", "tenjo", "tabio", "palmira", "jamundi", "yumbo",
  "tulua", "buga", "cartago", "buenaventura", "soledad", "malambo", "puerto colombia", "floridablanca", "giron",
  "piedecuesta", "barrancabermeja", "dosquebradas", "santa rosa de cabal", "la dorada", "duitama", "sogamoso", "chiquinquira",
  "espinal", "melgar", "colombia", "col", "co",
]);
const SMALL = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "en"]);

const words = (t: string) => String(t ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

export const TEXT_FILTERS: Record<string, (t: string) => string> = {
  capitalizar: (t) =>
    words(t)
      .map((w, i) => {
        const low = w.toLowerCase();
        if (i > 0 && SMALL.has(low)) return low;
        if (/^([a-z]\.)+[a-z]?\.?$/i.test(w)) return w.toUpperCase();
        return low.charAt(0).toUpperCase() + low.slice(1);
      })
      .join(" "),
  mayusculas: (t) => String(t ?? "").toUpperCase(),
  minusculas: (t) => String(t ?? "").toLowerCase(),
  sin_ciudad: (t) => {
    let list = words(t);
    for (let round = 0; round < 2; round++) {
      let cut = 0;
      for (let n = Math.min(4, list.length - 1); n >= 1; n--) {
        if (CITIES.has(norm(list.slice(list.length - n).join(" ")))) {
          cut = n;
          break;
        }
      }
      if (!cut) break;
      list = list.slice(0, list.length - cut);
    }
    return list.join(" ");
  },
  primera_palabra: (t) => words(t)[0] ?? "",
};

const MARK = /\{\s*([a-zñ]+)\s*((?:\|\s*[a-z_]*\s*)*)\}/gi;

/**
 * La descripción de la regla con sus marcas resueltas; `date` es "AAAA-MM-DD".
 * `comercio`: el que se leyó del correo (sin él, `original`); `alias`: su
 * nombre limpio, que gana y no pasa por los filtros ({comercio|capitalizar}
 * no vuelve «EPM» «Epm»).
 */
export function renderDescription(template: string, date: string, original: string, comercio = "", alias = ""): string {
  const values: Record<string, string> = {
    mes: monthName(+date.slice(5, 7)) ?? "",
    año: date.slice(0, 4),
    ano: date.slice(0, 4),
    original,
    comercio: alias || comercio || original,
  };
  return template
    .replace(MARK, (raw, mark: string, filters: string) => {
      const key = mark.toLowerCase();
      if (!(key in values)) return raw;
      if (key === "comercio" && alias) return values[key];
      return filters
        .split("|")
        .map((f) => f.trim().toLowerCase())
        .filter(Boolean)
        .reduce((v, f) => (TEXT_FILTERS[f] ? TEXT_FILTERS[f](v) : v), values[key]);
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** El alias que le queda a un comercio (el de texto más largo), como merchants.find en el servidor. */
export function findMerchant<T extends { match: string }>(text: string, list: readonly T[]): T | null {
  const hay = ` ${norm(text)} `;
  let best: T | null = null;
  let len = 0;
  for (const m of list) {
    for (const k of m.match.split(",").map(norm).filter(Boolean)) {
      if (k.length > len && hay.includes(k)) {
        best = m;
        len = k.length;
      }
    }
  }
  return best;
}

/** Cómo se llama una regla en la lista: su nombre, o sus textos. */
export function ruleLabel(r: { name?: string; match?: string; sender?: string } | undefined | null): string {
  if (!r) return "una regla";
  return r.name?.trim() || r.match?.split(",").map((k) => k.trim()).filter(Boolean).join(", ") || r.sender || "una regla";
}
