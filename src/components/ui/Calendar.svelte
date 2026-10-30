<!--
  El calendario de la app, en español y con la semana desde el lunes. Es el
  de vanilla-calendar-pro, pintado con los colores de la app (ver
  `styles/calendar.css`), en cuatro formas:

  - `day`: un día ("AAAA-MM-DD").
  - `range`: dos días, desde y hasta; `onpick` llega al marcar el segundo.
  - `month`: un mes ("AAAA-MM"). Tocar el año abre la lista de años.
  - `year`: un año ("AAAA").

  No lleva disparador ni menú: va dentro de uno (DateInput, PeriodPicker) o
  suelto en una hoja (la pantalla de anotar del teléfono).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { Calendar, months, type Options } from "vanilla-calendar-pro";
  import "vanilla-calendar-pro/styles/core.css";
  import "vanilla-calendar-pro/styles/months.css";
  import "../../styles/calendar.css";

  import { today } from "../../lib/finance";
  import { calendarLocale } from "../../lib/format";

  type Mode = "day" | "range" | "month" | "year";

  let {
    mode = "day",
    value = "",
    to = "",
    twoMonths = false,
    onpick,
  }: {
    mode?: Mode;
    /** El día, el mes o el año elegido; en `range`, el primer día. */
    value?: string;
    /** En `range`, el último día. */
    to?: string;
    /** En `range`, dos meses lado a lado (en pantallas anchas). */
    twoMonths?: boolean;
    onpick?: (value: string, to?: string) => void;
  } = $props();

  const pad = (n: number) => String(n).padStart(2, "0");

  let el: HTMLDivElement;
  let cal: Calendar | null = null;

  /** Lo elegido, como lo guarda el calendario: días, mes (0-11) y año a la vista. */
  function picked() {
    const base = value || today();
    const y = Number(base.slice(0, 4));
    const m = mode === "year" ? 0 : Number(base.slice(5, 7) || "1") - 1;
    const dates = mode === "range" ? (value && to ? [value, to] : []) : mode === "day" && value ? [value] : [];
    return { selectedDates: dates as NonNullable<Options["selectedDates"]>, selectedMonth: m as Options["selectedMonth"], selectedYear: y };
  }

  function options(): Options {
    const common: Options = {
      locale: calendarLocale,
      firstWeekday: 1,
      // Los fines de semana no van en rojo: aquí no significan nada.
      selectedWeekends: [],
      enableDateToggle: false,
      dateToday: today() as Options["dateToday"],
      labels: {
        application: "Calendario",
        navigation: "Navegación del calendario",
        arrowNext: { month: "Mes siguiente", year: "Años siguientes" },
        arrowPrev: { month: "Mes anterior", year: "Años anteriores" },
        month: "Elegir mes",
        months: "Meses",
        year: "Elegir año",
        years: "Años",
        week: "Días de la semana",
        weekNumber: "Semana",
        dates: "Días",
        collapse: "Contraer",
        expand: "Expandir",
      },
      ...picked(),
    };
    if (mode === "day")
      return {
        ...common,
        onClickDate(self) {
          const d = self.context.selectedDates[0];
          if (d) onpick?.(d);
        },
      };
    if (mode === "range")
      return {
        ...common,
        type: twoMonths ? "multiple" : "default",
        displayMonthsCount: twoMonths ? 2 : undefined,
        // Con dos meses, los días de relleno de uno repetirían los del otro.
        displayDatesOutside: !twoMonths,
        monthsToSwitch: 1,
        extensions: twoMonths ? [months] : [],
        selectionDatesMode: "multiple-ranged",
        onClickDate(self) {
          const s = [...self.context.selectedDates].sort();
          if (s.length >= 2) onpick?.(s[0], s[s.length - 1]);
        },
      };
    if (mode === "month")
      return {
        ...common,
        type: "month",
        onClickMonth(self) {
          onpick?.(`${self.context.selectedYear}-${pad(self.context.selectedMonth + 1)}`);
        },
      };
    return {
      ...common,
      type: "year",
      onClickYear(self) {
        onpick?.(String(self.context.selectedYear));
      },
    };
  }

  onMount(() => {
    cal = new Calendar(el, options());
    cal.init();
    return () => {
      cal?.destroy();
      cal = null;
    };
  });

  // Si lo elegido cambia desde afuera (las flechas del mes, otra fecha
  // escrita a mano), el calendario lo muestra.
  $effect(() => {
    const next = picked();
    if (!cal) return;
    const ctx = cal.context;
    const same =
      ctx.selectedDates.join() === next.selectedDates.join() &&
      (mode === "day" || mode === "range" || (ctx.selectedYear === next.selectedYear && (mode === "year" || ctx.selectedMonth === next.selectedMonth)));
    if (!same) cal.set(next, { dates: true, month: true, year: true });
  });
</script>

<!-- La librería se queda con la clase del elemento que recibe: va dentro. -->
<div class="calendar"><div bind:this={el}></div></div>
