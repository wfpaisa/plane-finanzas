/**
 * Colores del tema resueltos a valores que Chart.js entiende.
 *
 * Los tokens son `oklch()`, `light-dark()` y mezclas; `getComputedStyle` de
 * una variable devuelve el texto sin resolver. Pintar un elemento de prueba
 * con `color: var(--x)` y leer su `color` calculado sí da un color final, que
 * el lienzo acepta tal cual.
 */

let probe: HTMLElement | null = null;
let pixel: CanvasRenderingContext2D | null = null;

/**
 * Cualquier color CSS a `[r, g, b, a]`, pintándolo en un lienzo de un pixel:
 * así da igual si el navegador lo calculó en oklch, oklab o `color(srgb)`.
 */
function toRgba(color: string): [number, number, number, number] {
  if (!pixel) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    pixel = c.getContext("2d", { willReadFrequently: true });
  }
  if (!pixel) return [128, 128, 128, 1];
  pixel.clearRect(0, 0, 1, 1);
  pixel.fillStyle = "#808080";
  pixel.fillStyle = color;
  pixel.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}

export function resolveColor(cssValue: string, className = ""): string {
  if (!probe) {
    probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;";
    document.body.appendChild(probe);
  }
  probe.className = className;
  probe.style.color = cssValue;
  const [r, g, b, a] = toRgba(getComputedStyle(probe).color);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export const token = (name: string, className = "") => resolveColor(`var(${name})`, className);

/** El color de un tinte (`tint-3`). */
export const tintColor = (tint: string) => token(`--tinte-${tint.replace("tint-", "") || "1"}`);

/** Con transparencia: `alpha(color, 0.2)`. */
export function alpha(color: string, a: number): string {
  const [r, g, b] = toRgba(color);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Los veinte tintes en un orden que salta de matiz en matiz: dos partes
 * seguidas de una gráfica nunca quedan en colores vecinos.
 */
const RAMP = [1, 4, 8, 6, 2, 9, 14, 12, 17, 13, 5, 11, 16, 3, 18, 15, 7, 20, 19, 10].map((n) => `tint-${n}`);

/**
 * `n` colores distintos para repartir una gráfica entre varias partes. Pasadas
 * las veinte, vuelven los mismos más cerca del papel. `skip` son tintes que
 * ya usa otra parte de la gráfica y conviene no repetir.
 */
export function chartRamp(n: number, skip: readonly string[] = []): string[] {
  const free = RAMP.filter((t) => !skip.includes(t));
  const order = free.length ? free : RAMP;
  return Array.from({ length: Math.max(0, n) }, (_, i) => {
    const tint = `var(--tinte-${order[i % order.length].slice(5)})`;
    const pct = [100, 60, 35][Math.min(2, Math.floor(i / order.length))];
    return pct === 100 ? resolveColor(tint) : resolveColor(`color-mix(in oklab, ${tint} ${pct}%, var(--bg-level2))`);
  });
}

/**
 * El color de cada parte cuando las partes tienen el suyo (una categoría con
 * su tinte, una cuenta con su hex): se usa ese, y a las que no tienen se les
 * da uno de la rampa que no choque con los ya usados.
 */
export function colorsFor(own: readonly (string | null | undefined)[]): string[] {
  const used = own.filter((c): c is string => !!c && c.startsWith("tint-"));
  const ramp = chartRamp(own.filter((c) => !c).length, used);
  let k = 0;
  return own.map((c) => (!c ? ramp[k++] : c.startsWith("tint-") ? tintColor(c) : resolveColor(c)));
}
