/**
 * Lo que la pantalla de Análisis calcula aparte de las sumas: contra qué
 * periodo compararse, el ritmo acumulado, las frases del resumen y el
 * diagrama de a dónde fue el dinero.
 */
import { addMonths, dayOf, lastDayOf, monthRange, type Granularity, type Kind, type TxLike } from "./finance";
import { money } from "./format";

const pad = (n: number) => String(n).padStart(2, "0");

/** El día siguiente, para cerrar un rango `[desde, hasta)`. */
function nextDay(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  const n = new Date(y, m - 1, d + 1);
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

export interface Previous {
  /** El periodo anterior entero, para la línea punteada del ritmo. */
  full: [string, string];
  /**
   * El periodo anterior hasta el mismo punto: si el actual va por el 25 de
   * septiembre, se compara con lo que iba al 25 de septiembre del año pasado
   * y no con el año completo.
   */
  same: [string, string];
  /** El periodo actual todavía no termina. */
  ongoing: boolean;
  /** "el mes pasado", "el año pasado". */
  name: string;
  /** "agosto", "2025": para las etiquetas cortas. */
  short: string;
}

/**
 * Contra qué comparar lo que se ve: el mes anterior en la vista semanal y el
 * año anterior en la mensual. La anual ya muestra los años lado a lado.
 */
export function previousPeriod(g: Granularity, ym: string, year: number, now: string): Previous | null {
  const today = dayOf(now);
  if (g === "week") {
    const prev = addMonths(ym, -1);
    const full = monthRange(prev);
    const [a, b] = monthRange(ym);
    const ongoing = today >= a && today < b;
    const d = Math.min(Number(today.slice(8, 10)), lastDayOf(prev));
    const same: [string, string] = ongoing ? [full[0], nextDay(`${prev}-${pad(d)}`)] : full;
    const short = new Intl.DateTimeFormat("es-CO", { month: "long" }).format(new Date(Number(prev.slice(0, 4)), Number(prev.slice(5, 7)) - 1, 1));
    return { full, same, ongoing, name: "el mes pasado", short };
  }
  if (g === "month") {
    const full: [string, string] = [`${year - 1}-01-01`, `${year}-01-01`];
    const ongoing = today.slice(0, 4) === String(year);
    const m = today.slice(5, 7);
    const d = Math.min(Number(today.slice(8, 10)), lastDayOf(`${year - 1}-${m}`));
    const same: [string, string] = ongoing ? [full[0], nextDay(`${year - 1}-${m}-${pad(d)}`)] : full;
    return { full, same, ongoing, name: "el año pasado", short: String(year - 1) };
  }
  return null;
}

/** Cuánto cambió, en porcentaje; `null` si antes no había nada con qué comparar. */
export function change(now: number, before: number): number | null {
  return before > 0 ? ((now - before) / before) * 100 : null;
}

/**
 * La suma acumulada de un tipo de movimiento a lo largo de `n` casillas
 * (días del mes o meses del año). `slot` dice en qué casilla (desde 0) cae
 * cada fecha.
 */
export function cumulative(txs: TxLike[], kind: Kind, n: number, slot: (date: string) => number): number[] {
  const per = new Array<number>(n).fill(0);
  for (const t of txs) {
    if (t.type !== kind) continue;
    const i = slot(t.date);
    if (i >= 0 && i < n) per[i] += t.amount;
  }
  let run = 0;
  return per.map((v) => (run += v));
}

// ---------- El resumen en palabras ----------

export interface Insight {
  icon: string;
  tone: "good" | "bad" | "neutral";
  text: string;
}

export interface InsightInput {
  kind: Kind;
  income: number;
  expense: number;
  /** Lo del periodo anterior hasta el mismo punto; sin él no se compara. */
  prev: { income: number; expense: number; name: string; ongoing: boolean } | null;
  /** Por categoría, del tipo que se está mirando. */
  cats: { name: string; total: number }[];
  /** Lo del periodo anterior por nombre de categoría. */
  prevCats: Map<string, number>;
}

const pct = (n: number) => `${Math.round(Math.abs(n))}%`;

/**
 * Tres o cuatro frases que cuentan lo importante sin tener que leer la
 * gráfica, como el resumen del mes de las apps de finanzas: cuánto quedó, si
 * se va gastando más o menos que antes, qué se llevó la mayor parte y qué
 * cambió más.
 */
export function insights(i: InsightInput): Insight[] {
  const out: Insight[] = [];
  const spend = i.kind === "expense";
  const word = spend ? "gastos" : "ingresos";

  if (i.income > 0 || i.expense > 0) {
    const left = i.income - i.expense;
    if (i.income === 0) out.push({ icon: "alert-02", tone: "bad", text: `Salieron ${money(i.expense)} y no se anotaron ingresos.` });
    else if (left >= 0)
      out.push({
        icon: "piggy-bank",
        tone: "good",
        text: `Te quedaron ${money(left)}: guardaste ${pct((left / i.income) * 100)} de lo que entró.`,
      });
    else out.push({ icon: "alert-02", tone: "bad", text: `Gastaste ${money(-left)} más de lo que entró.` });
  }

  if (i.prev) {
    const now = spend ? i.expense : i.income;
    const before = spend ? i.prev.expense : i.prev.income;
    const c = change(now, before);
    const when = i.prev.ongoing ? `a esta altura ${i.prev.name.replace(/^el /, "del ")}` : i.prev.name;
    if (c !== null && Math.abs(c) >= 1) {
      const up = c > 0;
      out.push({
        icon: up ? "chart-increase" : "chart-decrease",
        tone: up === spend ? "bad" : "good",
        text: `${spend ? "Gastaste" : "Recibiste"} ${pct(c)} ${up ? "más" : "menos"} que ${when} (${money(before)}).`,
      });
    } else if (c !== null) {
      out.push({ icon: "tick-02", tone: "neutral", text: `Vas casi igual que ${when}.` });
    }
  }

  const total = i.cats.reduce((s, c) => s + c.total, 0);
  const top = i.cats[0];
  if (top && total > 0) {
    out.push({ icon: "crown", tone: spend ? "bad" : "neutral", text: `${top.name} se llevó ${pct((top.total / total) * 100)} de tus ${word}.` });
  }

  if (i.prev) {
    // Lo que más se movió en pesos; si fue poca cosa, no vale la frase.
    let best: { name: string; diff: number } | null = null;
    const names = new Set([...i.cats.map((c) => c.name), ...i.prevCats.keys()]);
    for (const name of names) {
      const now = i.cats.find((c) => c.name === name)?.total ?? 0;
      const diff = now - (i.prevCats.get(name) ?? 0);
      if (!best || Math.abs(diff) > Math.abs(best.diff)) best = { name, diff };
    }
    if (best && total > 0 && Math.abs(best.diff) >= total * 0.03) {
      const up = best.diff > 0;
      out.push({
        icon: up ? "arrow-up-right-01" : "arrow-down-right-01",
        tone: up === spend ? "bad" : "good",
        text: `Lo que más ${up ? "subió" : "bajó"}: ${best.name}, ${up ? "+" : "−"}\u2060${money(Math.abs(best.diff))} frente ${i.prev.name.replace(/^el /, "al ")}.`,
      });
    }
  }
  return out;
}

// ---------- A dónde fue el dinero ----------

export interface FlowItem {
  id: string;
  label: string;
  value: number;
  /** Clase de tinte (`tint-3`) o una clase propia (`flow-left`). */
  tint: string;
}

export interface FlowNode extends FlowItem {
  /** Arriba y alto en su columna. */
  y: number;
  h: number;
  /** Arriba y alto de su tramo en la barra del centro. */
  my: number;
  mh: number;
}

export interface Flow {
  left: FlowNode[];
  right: FlowNode[];
  total: number;
}

/**
 * Deja los `max` más grandes y junta el resto en uno solo, para que las
 * etiquetas no se monten.
 */
export function topN(items: FlowItem[], max: number, rest: Omit<FlowItem, "value">): FlowItem[] {
  const sorted = [...items].filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;
  const keep = sorted.slice(0, max - 1);
  const value = sorted.slice(max - 1).reduce((s, x) => s + x.value, 0);
  return [...keep, { ...rest, value }];
}

/**
 * Coloca un diagrama de flujo de tres columnas: lo que entró a la izquierda,
 * una barra al centro con el total y a dónde fue a la derecha. Cada nodo
 * tiene un alto mínimo para que su etiqueta quepa; lo que sobra se reparte
 * según el monto. En la barra del centro cada tramo es proporcional exacto.
 */
export function flowLayout(left: FlowItem[], right: FlowItem[], height: number, gap: number, minH: number): Flow {
  const total = Math.max(
    left.reduce((s, x) => s + x.value, 0),
    right.reduce((s, x) => s + x.value, 0),
  );
  const place = (items: FlowItem[]): FlowNode[] => {
    const n = items.length;
    const room = height - gap * Math.max(0, n - 1);
    const free = room - n * minH;
    const sum = items.reduce((s, x) => s + x.value, 0) || 1;
    let y = 0;
    let my = 0;
    return items.map((x) => {
      const h = free > 0 ? minH + (free * x.value) / sum : room / n;
      const mh = total ? (height * x.value) / total : 0;
      const node = { ...x, y, h, my, mh };
      y += h + gap;
      my += mh;
      return node;
    });
  };
  return { left: place(left), right: place(right), total };
}

/**
 * La banda entre un nodo y su tramo en el centro: dos curvas que se abren
 * y cierran a lo ancho. `x0` es el borde del nodo y `x1` el del centro.
 */
export function band(x0: number, y0: number, h0: number, x1: number, y1: number, h1: number): string {
  const mid = (x0 + x1) / 2;
  return [
    `M${x0},${y0}`,
    `C${mid},${y0} ${mid},${y1} ${x1},${y1}`,
    `L${x1},${y1 + h1}`,
    `C${mid},${y1 + h1} ${mid},${y0 + h0} ${x0},${y0 + h0}`,
    "Z",
  ].join(" ");
}
