<!--
  Una gráfica de Chart.js que se viste con el tema.

  `config` es una función y no un objeto: se vuelve a llamar cuando cambian
  sus datos, el modo claro/oscuro o el tinte del fondo, porque los colores se leen del tema en
  ese momento (ver `lib/colors.ts`).

  Encima de lo que pida cada pantalla, todas se visten igual, al estilo de
  las referencias: las áreas no llevan velo sino un rayado diagonal fino de
  su color, las líneas son finas con puntos macizos pequeños, las barras son
  cápsulas delgadas, las donas se separan en porciones redondeadas y la
  cuadrícula es una línea punteada apenas visible.
-->
<script lang="ts">
  import { Chart, registerables, type ChartConfiguration, type Plugin } from "chart.js";

  import { alpha, token } from "../lib/colors";
  import { tint } from "../lib/tint.svelte";
  import { theme } from "../lib/theme.svelte";

  Chart.register(...registerables);

  let {
    config,
    height = 260,
    label,
    square = false,
  }: {
    config: () => ChartConfiguration;
    height?: number;
    /** Barras rectas, sin cápsula: para columnas apiladas que deben leerse como un todo. */
    square?: boolean;
    /** Lo que dice la gráfica en voz alta. */
    label: string;
  } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);

  /** Las líneas proyectan una sombra corta de su color. */
  const glowing = (chart: Chart, index: number) => {
    const meta = chart.getDatasetMeta(index);
    const color = chart.data.datasets[index]?.borderColor;
    return meta.type === "line" && typeof color === "string" ? color : null;
  };
  const glow: Plugin = {
    id: "glow",
    beforeDatasetDraw(chart, { index }) {
      const color = glowing(chart, index);
      if (!color) return;
      chart.ctx.save();
      chart.ctx.shadowColor = alpha(color, 0.25);
      chart.ctx.shadowBlur = 10;
      chart.ctx.shadowOffsetY = 6;
    },
    afterDatasetDraw(chart, { index }) {
      if (glowing(chart, index)) chart.ctx.restore();
    },
  };

  /**
   * El relleno rayado de un área: un velo muy tenue del color y encima
   * líneas diagonales finas. `dense` es para las áreas apiladas, que tienen
   * que leerse como bloques y no como sombra.
   */
  function hatch(color: string, dense = false): CanvasPattern | string {
    const size = dense ? 6 : 8;
    const tile = document.createElement("canvas");
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    tile.width = tile.height = size * dpr;
    const ctx = tile.getContext("2d");
    if (!ctx) return alpha(color, dense ? 0.4 : 0.1);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = alpha(color, dense ? 0.22 : 0.05);
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = alpha(color, dense ? 0.7 : 0.4);
    ctx.lineWidth = 1;
    ctx.lineCap = "square";
    ctx.beginPath();
    // La diagonal y sus dos puntas en las esquinas, para que el dibujo
    // empalme sin cortes de una baldosa a la siguiente.
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.moveTo(-1, 1);
    ctx.lineTo(1, -1);
    ctx.moveTo(size - 1, size + 1);
    ctx.lineTo(size + 1, size - 1);
    ctx.stroke();
    const pattern = ctx.createPattern(tile, "repeat");
    if (!pattern) return alpha(color, 0.1);
    // La baldosa se dibujó a la densidad de la pantalla; el lienzo de la
    // gráfica ya viene escalado, así que se devuelve a su medida.
    pattern.setTransform(new DOMMatrix().scale(1 / dpr));
    return pattern;
  }

  function dress(cfg: ChartConfiguration) {
    const paper = token("--glass-2");
    const stackedX = Boolean((cfg.options?.scales?.x as { stacked?: boolean } | undefined)?.stacked);
    for (const ds of cfg.data.datasets as unknown as Record<string, unknown>[]) {
      const type = (ds.type as string | undefined) ?? cfg.type;
      if (type === "line") {
        const color = ds.borderColor;
        if (typeof color !== "string") continue;
        if (ds.fill) ds.backgroundColor = hatch(color, ds.stack === "pots");
        ds.borderWidth = Math.min(Number(ds.borderWidth ?? 2), 2);
        ds.borderCapStyle = "round";
        ds.borderJoinStyle = "round";
        ds.pointRadius ??= 2.5;
        if (Number(ds.pointRadius) > 0) ds.pointRadius = Math.min(Number(ds.pointRadius), 2.5);
        ds.pointBackgroundColor = color;
        ds.pointBorderWidth = 0;
        ds.pointHoverRadius = 5;
        ds.pointHoverBackgroundColor = color;
        ds.pointHoverBorderColor = paper;
        ds.pointHoverBorderWidth = 3;
      } else if (type === "bar") {
        // Cápsulas delgadas; apiladas, cada tramo solo se redondea un poco
        // para que la columna se lea entera.
        const stacked = stackedX || ds.stack != null;
        ds.borderRadius = square ? 0 : stacked ? 6 : 999;
        ds.borderSkipped = false;
        if (!square) ds.maxBarThickness = Math.min(Number(ds.maxBarThickness ?? 18), stacked ? 22 : 18);
      } else if (type === "doughnut" || type === "pie") {
        ds.borderWidth = 0;
        ds.spacing = 4;
        ds.borderRadius = 8;
        ds.hoverOffset = 6;
      }
    }
  }

  $effect(() => {
    void theme.name;
    void tint.value;
    if (!canvas) return;
    const muted = token("--text-muted");
    const grid = token("--chart-grid");
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    // Las cifras de los ejes, en la letra de los números.
    const num = getComputedStyle(document.documentElement).getPropertyValue("--font-num").trim();
    for (const axis of ["linear", "logarithmic"] as const) {
      Chart.defaults.scales[axis].ticks.font = { family: num };
    }
    // La cuadrícula, punteada y sin el filo del eje.
    for (const axis of ["linear", "logarithmic", "category", "time"] as const) {
      const scale = Chart.defaults.scales[axis as "linear"];
      if (scale) scale.border = { ...scale.border, dash: [2, 5], display: false };
    }
    // Aire arriba del valor más alto: la punta de una cápsula no se corta.
    Chart.defaults.scales.linear.grace = "6%";
    Chart.defaults.font.size = 12;
    Chart.defaults.font.weight = 500;
    Chart.defaults.color = muted;
    Chart.defaults.borderColor = grid;
    const cfg = config();
    dress(cfg);
    cfg.plugins = [...(cfg.plugins ?? []), glow];
    // El lienzo no desenfoca lo de detrás: el globo es vidrio casi opaco,
    // con la cifra grande y fina como en la referencia.
    const tooltip = {
      backgroundColor: alpha(token("--glass-2"), 0.96),
      titleColor: token("--text-muted"),
      bodyColor: token("--text-primary"),
      borderColor: token("--border-float"),
      borderWidth: 1,
      padding: { x: 14, y: 12 },
      cornerRadius: 16,
      caretSize: 0,
      caretPadding: 10,
      boxPadding: 6,
      usePointStyle: true,
      titleFont: { weight: 500, size: 12 },
      titleMarginBottom: 8,
      bodyFont: { family: num, weight: 500, size: 13 },
      bodySpacing: 6,
    };
    cfg.options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: "easeOutQuart" },
      ...cfg.options,
      plugins: {
        ...cfg.options?.plugins,
        legend: {
          labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 7, boxHeight: 7, padding: 16 },
          ...cfg.options?.plugins?.legend,
        },
        tooltip: { ...tooltip, ...cfg.options?.plugins?.tooltip },
      },
    };
    const chart = new Chart(canvas, cfg);
    return () => chart.destroy();
  });
</script>

<div class="chart-box" style:height="{height}px" role="img" aria-label={label}>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .chart-box {
    position: relative;
    width: 100%;
  }
</style>
