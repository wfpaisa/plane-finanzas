/**
 * Colores de la app.
 *
 * - El **tinte del fondo**: un color a mano (o ninguno, la bruma de partida)
 *   que tiñe el lienzo de toda la app. Lo elige cada quien en Ajustes; ver
 *   `tint.svelte.ts`.
 * - El **color de una cuenta o un ahorro**: un solo hexadecimal, para el
 *   punto que los identifica en las listas.
 * - El **tinte de una categoría o etiqueta**: uno de los veinte fijos de
 *   `theme.css` y `finanzas.css`.
 */

/** Los colores rápidos: los que se ofrecen sin abrir la rueda. */
export const PRESET_COLORS = [
  { name: "Rojo", hex: "#fb2c36" },
  { name: "Naranja", hex: "#ff6900" },
  { name: "Ámbar", hex: "#fe9a00" },
  { name: "Amarillo", hex: "#f0b100" },
  { name: "Lima", hex: "#7ccf00" },
  { name: "Verde", hex: "#00c950" },
  { name: "Esmeralda", hex: "#00bc7d" },
  { name: "Turquesa", hex: "#00bba7" },
  { name: "Cielo", hex: "#00a6f4" },
  { name: "Azul", hex: "#2b7fff" },
  { name: "Índigo", hex: "#615fff" },
  { name: "Violeta", hex: "#8e51ff" },
  { name: "Púrpura", hex: "#ad46ff" },
  { name: "Rosa", hex: "#f6339a" },
  { name: "Carmín", hex: "#ff2056" },
  { name: "Pizarra", hex: "#62748e" },
] as const;

const PRESET = Object.fromEntries(PRESET_COLORS.map((p) => [p.name, p.hex]));

/* Las cuentas y ahorros de antes guardaban el id de una paleta entera; se
   leen con el color rápido más parecido hasta que se vuelvan a guardar. */
const LEGACY: Record<string, string> = {
  "mono-red": "Rojo", "mono-orange": "Naranja", "mono-amber": "Ámbar", "mono-yellow": "Amarillo",
  "mono-lime": "Lima", "mono-green": "Verde", "mono-emerald": "Esmeralda", "mono-teal": "Turquesa",
  "mono-sky": "Cielo", "mono-blue": "Azul", "mono-indigo": "Índigo", "mono-violet": "Violeta",
  "mono-purple": "Púrpura", "mono-pink": "Rosa", "mono-rose": "Carmín", "mono-slate": "Pizarra",
  electrico: "Azul", tropico: "Turquesa", frambuesa: "Rosa", bosque: "Verde", lava: "Naranja",
  cyberpunk: "Púrpura", "v-solar": "Amarillo", "v-naranja": "Naranja", "v-ambar": "Ámbar",
  "v-lima": "Lima", "v-esmeralda": "Esmeralda", "v-turquesa": "Turquesa", "v-oceano": "Cielo",
  "v-violeta": "Violeta", "v-carmin": "Carmín", algodon: "Rosa", durazno: "Naranja", cielo: "Cielo",
  salvia: "Verde", lavanda: "Violeta", vainilla: "Amarillo", "p-coral": "Rojo", "p-limon": "Amarillo",
  "p-pistacho": "Lima", "p-menta": "Esmeralda", "p-aguamarina": "Turquesa", "p-nube": "Pizarra",
  "p-lila": "Púrpura", "p-chicle": "Rosa", "p-cuarzo": "Carmín",
};

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/**
 * El tono (0-360) y el croma OKLCH de un hexadecimal. CSS no deja sacar el
 * tono de un color como número, y el tinte del fondo lo necesita así para
 * repartirlo en todos los tokens (`glass.css`). La misma cuenta, en corto,
 * la hace el guion de `index.html`.
 */
export function oklchOf(hex: string): { h: number; c: number } {
  const lin = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(1), lin(3), lin(5)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360, c: Math.hypot(A, B) };
}

/** Deja lo escrito en forma de color: admite `#abc` y el hex sin almohadilla. */
export function parseHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${[...raw].map((c) => c + c).join("")}`.toLowerCase();
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toLowerCase()}` : null;
}

/** El color de una cuenta o ahorro, listo para CSS. Sin color, el de las gráficas. */
export function colorOf(value?: string | null): string {
  if (isHex(value)) return value;
  if (!value) return "var(--chart-1)";
  return PRESET[LEGACY[value] ?? ""] ?? "var(--chart-1)";
}

/** Un color base distinto para cada cuenta nueva, sin repetir pronto. */
export const nextColor = (used: string[]) =>
  PRESET_COLORS.find((p) => !used.map(colorOf).includes(p.hex))?.hex ?? PRESET_COLORS[9].hex;

/** Los diez tintes fijos del sistema (`theme.css`): el color de las etiquetas. */
export const TINT_NAMES = ["Azul", "Violeta", "Ciruela", "Rojo", "Teja", "Ámbar", "Oliva", "Verde", "Turquesa", "Pizarra"] as const;
export const TINTS = TINT_NAMES.map((_, i) => `tint-${i + 1}`);

/** Las categorías tienen veinte: los diez del sistema y diez más de `finanzas.css`. */
export const CATEGORY_TINT_NAMES = [
  ...TINT_NAMES,
  ...["Cielo", "Púrpura", "Rosa", "Naranja", "Mostaza", "Lima", "Esmeralda", "Índigo", "Café", "Malva"],
] as const;
export const CATEGORY_TINTS = CATEGORY_TINT_NAMES.map((_, i) => `tint-${i + 1}`);

/**
 * El color de una categoría nueva: el tinte que menos se repite entre las de
 * su mismo tipo (gasto o ingreso), y entre todas si hay empate. Así cada una
 * tiene uno propio hasta que se acaban los veinte. El servidor hace la misma
 * cuenta cuando una categoría llega sin color (`pb_hooks/lib/tints.js`).
 */
export function nextCategoryTint(cats: readonly { kind: string; color?: string }[], kind: string): string {
  const score = (t: string) => {
    const same = cats.filter((c) => c.kind === kind && c.color === t).length;
    const all = cats.filter((c) => c.color === t).length;
    return same * 1000 + all;
  };
  return CATEGORY_TINTS.reduce((best, t) => (score(t) < score(best) ? t : best));
}

/** Un tinte estable para un texto: la misma etiqueta siempre del mismo color. */
export function tintFor(text: string): string {
  let h = 0;
  for (const ch of text.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}
