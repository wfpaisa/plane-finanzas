/**
 * Atajos de teclado.
 *
 * Una pantalla los pide con `<svelte:window onkeydown={keys({ ArrowLeft: … })} />`.
 * Solo corren cuando el teclado no está ocupado en otra cosa: escribiendo en
 * un campo, dentro de un modal o de un menú abierto, o con una tecla de
 * control apretada (esos son del navegador), salvo los que se piden como
 * `"mod+a"`: Ctrl, o Cmd en Mac, más la tecla.
 */

/** Lo que ve la ayuda: tecla y qué hace, agrupado por pantalla. */
export const SHORTCUTS: { where: string; items: [string, string][] }[] = [
  {
    where: "En cualquier pantalla",
    items: [
      ["N", "Agregar un movimiento"],
      ["1 … 7", "Ir a Resumen, Proyección, Ahorros, Movimientos, Cuentas, Correos o Ajustes"],
      ["?", "Ver estos atajos"],
      ["Esc", "Cerrar la ventana abierta"],
    ],
  },
  {
    where: "Movimientos",
    items: [
      ["← →", "Mes anterior / siguiente"],
      ["H", "Volver al mes actual"],
      ["/", "Buscar"],
      ["T", "Ver todo el historial o solo el mes"],
      ["G", "Mostrar u ocultar la gráfica"],
      ["V", "Cambiar entre vista ampliada y compacta"],
      ["Ctrl A", "Marcar todos los movimientos que se ven"],
      ["Esc", "Quitar lo marcado con clic derecho"],
    ],
  },
  {
    where: "Resumen (análisis)",
    items: [
      ["← →", "Periodo anterior / siguiente"],
      ["H", "Volver al periodo actual"],
      ["S M A", "Ver por semana, mes o año"],
    ],
  },
];

function busy(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return true;
  const el = e.target as HTMLElement | null;
  if (el?.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return true;
  // Un modal o un menú abierto se queda con el teclado.
  return !!document.querySelector("[aria-modal='true'], :popover-open");
}

/** Las teclas van como `KeyboardEvent.key`; las letras, en minúscula. */
export function keys(map: Record<string, () => void>) {
  return (e: KeyboardEvent) => {
    if (e.altKey) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const mod = e.ctrlKey || e.metaKey;
    const run = mod ? !e.shiftKey && map[`mod+${key}`] : (map[key] ?? map[e.key]);
    if (!run || busy(e)) return;
    e.preventDefault();
    run();
  };
}
