/**
 * Las gráficas de la proyección, compartidas por la página de escritorio y la
 * del celular: en qué se va el ingreso de los próximos meses y la simulación
 * del dinero total.
 */
import type { ChartConfiguration } from "chart.js";

import { alpha, colorsFor, token } from "./colors";
import { addMonths, occursIn, type SimRow } from "./finance";
import { money, monthLabel } from "./format";
import { colorOf } from "./palettes";
import type { Recurring, Saving } from "./types";

/** $2,5 M · $800 mil: para los ejes, donde el número entero no cabe. */
export const short = (n: number) => {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e6) return `${sign}$${(a / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)} mil`;
  return money(n);
};

/*
 * Cada columna es el ingreso del mes repartido: gastos frecuentes, ahorros y
 * lo que queda libre, uno encima del otro y sin redondear, para que se lea
 * como un solo bloque. La línea punteada marca el ingreso: si la columna la
 * pasa, ese mes lo planeado no alcanza.
 */
export function nextMonthsChart(recurring: Recurring[], savings: number, ym: string): ChartConfiguration {
  const labels: string[] = [];
  const fixed: number[] = [];
  const saving: number[] = [];
  const free: number[] = [];
  const income: number[] = [];
  for (let i = 1; i <= 12; i++) {
    const m = addMonths(ym, i);
    labels.push(monthLabel(m));
    let inc = 0;
    let exp = 0;
    for (const r of recurring) {
      const v = occursIn(r, m);
      if (r.kind === "income") inc += v;
      else exp += v;
    }
    income.push(inc);
    fixed.push(exp);
    saving.push(savings);
    free.push(Math.max(0, inc - exp - savings));
  }
  const paper = token("--bg-level2");
  const bar = (label: string, data: number[], color: string) => ({
    type: "bar" as const,
    label,
    data,
    backgroundColor: color,
    hoverBackgroundColor: color,
    // Una raya del color de la tarjeta entre tramos, para que se distingan.
    borderColor: paper,
    borderWidth: { top: 1.5 },
    stack: "s",
    barPercentage: 0.72,
    categoryPercentage: 0.86,
  });
  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        bar("Gastos frecuentes", fixed, token("--viz-expense")),
        bar("Ahorros", saving, token("--viz-saving")),
        bar("Disponible", free, token("--viz-free")),
        {
          type: "line",
          label: "Ingresos",
          data: income,
          borderColor: token("--viz-income"),
          backgroundColor: token("--viz-income"),
          borderWidth: 2,
          borderDash: [5, 4],
          pointRadius: 0,
          stepped: "middle",
          order: -1,
        },
      ],
    },
    options: {
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { maxTicksLimit: 5, callback: (v) => short(Number(v)) },
          border: { display: false },
        },
      },
      plugins: {
        legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "rectRounded", boxHeight: 8, padding: 16 } },
        tooltip: {
          filter: (item) => item.dataset.type !== "line",
          itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
          callbacks: {
            label: (c) => ` ${c.dataset.label}: ${money(Number(c.raw))}`,
            footer: (items) => {
              const i = items[0]?.dataIndex ?? 0;
              const lack = fixed[i] + saving[i] - income[i];
              return lack > 0 ? [`Ingresos: ${money(income[i])}`, `Faltan: ${money(lack)}`] : [`Ingresos: ${money(income[i])}`];
            },
          },
        },
      },
    },
  } as ChartConfiguration;
}

export function simulationChart(sim: SimRow[], simSavings: (Saving & { current: number })[], total: number): ChartConfiguration {
  const labels = ["Hoy", ...sim.map((r) => monthLabel(r.month))];
  // Cada ahorro en su color.
  const colors = colorsFor(simSavings.map((s) => colorOf(s.palette)));
  const pots = simSavings.map((s, i) => {
    const color = colors[i];
    return {
      type: "line" as const,
      label: s.name,
      data: [s.current, ...sim.map((r) => r.perSaving[s.id] ?? 0)],
      borderColor: color,
      backgroundColor: alpha(color, 0.5),
      borderWidth: 1,
      pointRadius: 0,
      fill: i === 0 ? "origin" : "-1",
      stack: "pots",
      tension: 0.2,
    };
  });
  return {
    type: "line",
    data: {
      labels,
      datasets: [
        ...pots,
        {
          label: "Saldo neto",
          data: [total, ...sim.map((r) => r.total)],
          borderColor: token("--viz-line"),
          backgroundColor: token("--viz-line"),
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.2,
          fill: false,
          stack: "total",
        },
      ],
    },
    options: {
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
        y: { stacked: true, ticks: { callback: (v) => money(Number(v)) }, border: { display: false } },
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(Number(c.raw))}` } },
      },
    },
  } as ChartConfiguration;
}
