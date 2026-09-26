/**
 * Qué partes del texto de un correo resaltar: el valor que se leyó, el
 * comercio y los textos de la regla. Así se ve de dónde sale cada dato.
 *
 * Los textos de la regla se buscan como los busca el servidor (sin tildes,
 * sin mayúsculas, con los espacios juntos), pero se marcan sobre el texto
 * original.
 */

export type Mark = "rule" | "amount" | "merchant";
export interface Piece {
  text: string;
  mark?: Mark;
  bold?: boolean;
  /** Si es parte de un enlace: su dirección (solo http, https o mailto). */
  href?: string;
}

interface Range {
  start: number;
  end: number;
  mark: Mark;
}

/** El texto comparable y, por cada carácter suyo, su posición en el original. */
function normMap(text: string): { out: string; at: number[] } {
  let out = "";
  const at: number[] = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!space && out) {
        out += " ";
        at.push(i);
      }
      space = true;
      continue;
    }
    space = false;
    for (const c of ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()) {
      out += c;
      at.push(i);
    }
  }
  return { out, at };
}

const normWord = (s: string) => normMap(s.trim()).out.trim();

/** Igual que `parseAmount` de pb_hooks/lib/parsers.js. */
function parseAmount(raw: string): number | null {
  const s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const last = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  const decimals = last >= 0 ? s.length - last - 1 : 0;
  let int = s;
  let dec = "";
  if (last >= 0 && (decimals === 1 || decimals === 2)) {
    int = s.slice(0, last);
    dec = s.slice(last + 1);
  }
  const n = parseFloat(int.replace(/[.,]/g, "") + (dec ? `.${dec}` : ""));
  return Number.isFinite(n) ? n : null;
}

function find(text: string, map: { out: string; at: number[] }, needle: string, mark: Mark): Range[] {
  const n = normWord(needle);
  if (!n) return [];
  const out: Range[] = [];
  let p = map.out.indexOf(n);
  while (p >= 0) {
    out.push({ start: map.at[p], end: map.at[p + n.length - 1] + 1, mark });
    p = map.out.indexOf(n, p + n.length);
  }
  return out;
}

// Las marcas de pb_hooks/lib/parsers.js `htmlToRich`.
const B_ON = "\uE000";
const B_OFF = "\uE001";
const A_ON = "\uE002";
const A_HREF_END = "\uE003";
const A_OFF = "\uE004";

/** El texto con formato en pedazos con negrita o enlace; nada de HTML. */
export function parseRich(rich: string): Piece[] {
  const out: Piece[] = [];
  let bold = false;
  let href = "";
  let buf = "";
  const flush = () => {
    if (buf) out.push({ text: buf, ...(bold && { bold }), ...(href && { href }) });
    buf = "";
  };
  for (let i = 0; i < rich.length; i++) {
    const ch = rich[i];
    if (ch === B_ON || ch === B_OFF) {
      flush();
      bold = ch === B_ON;
    } else if (ch === A_ON) {
      flush();
      const end = rich.indexOf(A_HREF_END, i);
      const url = end > i ? rich.slice(i + 1, end) : "";
      // Por si acaso: solo direcciones web o de correo.
      href = /^(https?:|mailto:)/i.test(url) ? url : "";
      if (end > i) i = end;
    } else if (ch === A_OFF) {
      flush();
      href = "";
    } else buf += ch;
  }
  flush();
  return out;
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

/** Las direcciones escritas como texto ("https://…", "www.…") se vuelven enlaces. */
export function linkify(pieces: Piece[]): Piece[] {
  const out: Piece[] = [];
  for (const p of pieces) {
    if (p.href) {
      out.push(p);
      continue;
    }
    let pos = 0;
    URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = URL_RE.exec(p.text))) {
      if (m.index > pos) out.push({ ...p, text: p.text.slice(pos, m.index) });
      out.push({ ...p, text: m[0], href: m[0].startsWith("www.") ? `https://${m[0]}` : m[0] });
      pos = m.index + m[0].length;
    }
    if (pos < p.text.length) out.push({ ...p, text: p.text.slice(pos) });
  }
  return out;
}

/**
 * El texto con formato (`rich`), con lo que se leyó resaltado encima: los
 * pedazos llevan negrita, enlace y marca a la vez.
 */
export function highlightRich(rich: string, opts: { amount?: number; merchant?: string; keys?: string }): Piece[] {
  const segs = parseRich(rich);
  const marks = highlight(segs.map((p) => p.text).join(""), opts);
  const out: Piece[] = [];
  let si = 0;
  let sOff = 0;
  for (const m of marks) {
    let left = m.text.length;
    while (left > 0 && si < segs.length) {
      const seg = segs[si];
      const take = Math.min(left, seg.text.length - sOff);
      out.push({ ...seg, text: seg.text.slice(sOff, sOff + take), ...(m.mark && { mark: m.mark }) });
      left -= take;
      sOff += take;
      if (sOff >= seg.text.length) {
        si++;
        sOff = 0;
      }
    }
  }
  return out;
}

/**
 * Parte el texto en pedazos, marcados o no. `keys` son los textos de la
 * regla separados por coma. Si dos marcas se pisan, gana la regla, luego el
 * valor y luego el comercio.
 */
export function highlight(text: string, opts: { amount?: number; merchant?: string; keys?: string }): Piece[] {
  const map = normMap(text);
  const found: Range[] = [];
  for (const k of (opts.keys ?? "").split(",")) found.push(...find(text, map, k, "rule"));
  if (opts.amount) {
    const re = /(?:\$|COP\s?)\s?\d[\d.,]*/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const v = parseAmount(m[0].replace(/[.,]$/, ""));
      if (v !== null && Math.abs(v - opts.amount) < 0.005) {
        const len = m[0].replace(/[.,]$/, "").length;
        found.push({ start: m.index, end: m.index + len, mark: "amount" });
      }
    }
  }
  if (opts.merchant) found.push(...find(text, map, opts.merchant, "merchant"));

  const chosen: Range[] = [];
  for (const r of found) {
    if (!chosen.some((c) => r.start < c.end && c.start < r.end)) chosen.push(r);
  }
  chosen.sort((a, b) => a.start - b.start);

  const pieces: Piece[] = [];
  let pos = 0;
  for (const r of chosen) {
    if (r.start > pos) pieces.push({ text: text.slice(pos, r.start) });
    pieces.push({ text: text.slice(r.start, r.end), mark: r.mark });
    pos = r.end;
  }
  if (pos < text.length) pieces.push({ text: text.slice(pos) });
  return pieces;
}
