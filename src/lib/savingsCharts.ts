/**
 * Las gráficas de los ahorros, compartidas por la página de escritorio y la
 * del celular: lo que ha tenido cada ahorro mes a mes (estado) y lo que
 * tendría si sigue aportando (simulación).
 */
import type { ChartConfiguration } from "chart.js";

import { alpha, resolveColor, token } from "./colors";
import { addMonths, futureValue } from "./finance";
import { money, monthLabel } from "./format";
import { colorOf } from "./palettes";
import type { Saving, SavingMovement } from "./types";

type Current = (id: string) => number;

export const valueAt = (s: Saving, current: number, months: number) =>
  futureValue(current, s.monthly_amount || 0, s.annual_rate || 0, months);
export const paidAt = (s: Saving, current: number, months: number) => current + (s.monthly_amount || 0) * months;

/** Saldo de cada ahorro al cierre de cada mes, desde su primer movimiento
 *  (y al menos los últimos 6 meses) hasta `ym`. */
export function savingsHistory(savings: Saving[], movements: SavingMovement[], ym: string) {
  const ids = new Set(savings.map((s) => s.id));
  const movs = movements.filter((m) => ids.has(m.saving));
  const first = movs.reduce((a, m) => (m.date.slice(0, 7) < a ? m.date.slice(0, 7) : a), addMonths(ym, -5));
  const months: string[] = [];
  for (let m = first; m <= ym; m = addMonths(m, 1)) months.push(m);
  // Lo de cada mes y luego la suma corrida: una pasada, no una por mes.
  const lines = savings.map((s) => {
    const byMonth = new Map<string, number>();
    for (const m of movs) {
      if (m.saving === s.id) byMonth.set(m.date.slice(0, 7), (byMonth.get(m.date.slice(0, 7)) ?? 0) + m.amount);
    }
    let sum = 0;
    return { s, data: months.map((mo) => (sum += byMonth.get(mo) ?? 0)) };
  });
  return { months, lines };
}

export type SavingsHistory = ReturnType<typeof savingsHistory>;

const lineOptions = (legend = true): ChartConfiguration["options"] => ({
  interaction: { mode: "index", intersect: false },
  scales: {
    x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
    y: { ticks: { callback: (v) => money(Number(v)) }, border: { display: false } },
  },
  plugins: {
    legend: { display: legend, position: "top", align: "end" },
    tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(Number(c.raw))}` } },
  },
});

/** La línea del total, en tinta y no en color: así no se confunde con ningún ahorro. */
const totalLine = (data: number[], tension: number) => {
  const ink = token("--text-primary");
  return {
    label: "Total",
    data,
    borderColor: ink,
    backgroundColor: alpha(ink, 0.06),
    fill: true,
    borderWidth: 2.5,
    pointRadius: 0,
    pointHoverRadius: 5,
    tension,
  };
};

/** Lo que ha tenido: una línea por ahorro y, con varios, el total. */
export function stateChart(history: SavingsHistory, legend = true): ChartConfiguration {
  const labels = history.months.map((m) => monthLabel(m));
  const one = history.lines.length === 1;
  const lines = history.lines.map(({ s, data }) => {
    const color = resolveColor(colorOf(s.palette));
    return {
      label: s.name,
      data,
      borderColor: color,
      backgroundColor: alpha(color, 0.08),
      fill: one,
      borderWidth: one ? 2 : 1.75,
      pointRadius: 2,
      pointHoverRadius: 5,
      tension: 0,
    };
  });
  const total = labels.map((_, i) => history.lines.reduce((a, l) => a + l.data[i], 0));
  return {
    type: "line",
    data: { labels, datasets: one ? lines : [totalLine(total, 0), ...lines] },
    options: lineOptions(legend),
  };
}

/** Lo que tendría si sigue aportando: con varios ahorros, una línea por cada
 *  uno y el total encima; con uno, el ahorro, sin intereses y la meta. */
export function simChart(savings: Saving[], current: Current, horizon: number, ym: string, legend = true): ChartConfiguration {
  const labels = Array.from({ length: horizon + 1 }, (_, i) => monthLabel(addMonths(ym, i)));
  if (savings.length > 1) {
    const lines = savings.map((s) => ({ s, data: labels.map((_, i) => valueAt(s, current(s.id), i)) }));
    const total = labels.map((_, i) => lines.reduce((a, l) => a + l.data[i], 0));
    return {
      type: "line",
      data: {
        labels,
        datasets: [
          totalLine(total, 0.25),
          ...lines.map(({ s, data }) => ({
            label: s.name,
            data,
            borderColor: resolveColor(colorOf(s.palette)),
            borderWidth: 1.75,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: false,
          })),
        ],
      },
      options: lineOptions(legend),
    };
  }

  const s = savings[0];
  const now = current(s.id);
  // El ahorro en su color; la comparación sin intereses y la meta, en
  // gris, para que no se confundan con él.
  const c1 = resolveColor(colorOf(s.palette));
  const datasets: ChartConfiguration<"line">["data"]["datasets"] = [
    {
      label: s.annual_rate ? `Con interés anual del ${s.annual_rate}%` : "Saldo estimado",
      data: labels.map((_, i) => valueAt(s, now, i)),
      borderColor: c1,
      backgroundColor: alpha(c1, 0.08),
      fill: true,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.25,
    },
  ];
  if (s.annual_rate) {
    datasets.push({
      label: "Sin intereses",
      data: labels.map((_, i) => paidAt(s, now, i)),
      borderColor: token("--viz-muted"),
      borderDash: [5, 4],
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
    });
  }
  if (s.target_amount) {
    datasets.push({
      label: "Meta",
      data: labels.map(() => s.target_amount),
      borderColor: token("--text-muted"),
      borderDash: [2, 3],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
    });
  }
  return { type: "line", data: { labels, datasets }, options: lineOptions(legend) } as ChartConfiguration;
}
