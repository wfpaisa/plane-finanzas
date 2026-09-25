import { describe, expect, test } from "bun:test";

import {
  activeIn,
  addMonths,
  bucketize,
  budgetUse,
  daysBetween,
  futureValue,
  lastDayOf,
  monthlyEquivalent,
  monthlyNeeded,
  monthlyRate,
  monthsBetween,
  monthsToTarget,
  occurrenceDate,
  occursIn,
  periodSpan,
  planSummary,
  simulate,
  splitByPercent,
  weekStart,
  weeksOfMonth,
} from "../src/lib/finance";
import { money } from "../src/lib/format";

describe("fechas", () => {
  test("addMonths cruza años", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
  test("meses y días entre dos fechas, contando los dos", () => {
    expect(monthsBetween("2026-01", "2026-09")).toBe(9);
    expect(monthsBetween("2025-11", "2026-02")).toBe(4);
    expect(monthsBetween("2026-05", "2026-05")).toBe(1);
    expect(monthsBetween("2026-06", "2026-05")).toBe(0);
    expect(daysBetween("2026-09-01", "2026-09-30")).toBe(30);
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(31);
    expect(daysBetween("2026-09-10", "2026-09-09")).toBe(0);
  });
  test("último día del mes", () => {
    expect(lastDayOf("2026-02")).toBe(28);
    expect(lastDayOf("2028-02")).toBe(29);
    expect(lastDayOf("2026-09")).toBe(30);
    expect(lastDayOf("2026-12")).toBe(31);
  });
  test("weekStart es lunes", () => {
    expect(weekStart("2026-09-23")).toBe("2026-09-21");
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
    expect(weekStart("2026-09-27")).toBe("2026-09-21");
  });
  test("semanas de un mes", () => {
    expect(weeksOfMonth("2026-09")).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  });
});

describe("plan", () => {
  // El plan real de la hoja: sueldo 8M, fijos 3.702.121, ahorros 2.700.000.
  const recurring = [
    { kind: "income" as const, amount: 8000000 },
    ...[2132121, 300000, 80000, 390000, 500000, 100000, 150000, 50000].map((amount) => ({ kind: "expense" as const, amount })),
  ];
  const savings = [1000000, 200000, 1000000, 400000, 100000].map((m, i) => ({
    id: String(i),
    name: String(i),
    monthly_amount: m,
    annual_rate: 0,
  }));

  test("me puedo gastar", () => {
    const p = planSummary(recurring, savings);
    expect(p.fixed).toBe(3702121);
    expect(p.savings).toBe(2700000);
    expect(p.free).toBe(1597879);
  });

  test("anual cae solo en su mes", () => {
    const r = { kind: "expense" as const, amount: 1200000, frequency: "yearly" as const, month: 3 };
    expect(occursIn(r, "2027-03")).toBe(1200000);
    expect(occursIn(r, "2027-04")).toBe(0);
  });

  test("respeta fin", () => {
    const r = { kind: "expense" as const, amount: 10, end_date: "2026-10-15" };
    expect(occursIn(r, "2026-10")).toBe(10);
    expect(occursIn(r, "2026-11")).toBe(0);
  });

  // Lo mismo que hace el programador (pb_hooks/lib/scheduler.js): el día del
  // mes tiene que caer entre el inicio y el fin.
  test("el día del mes cuenta contra el inicio y el fin", () => {
    const empiezaTarde = { kind: "expense" as const, amount: 10, day_of_month: 5, start_date: "2026-09-20" };
    expect(occursIn(empiezaTarde, "2026-09")).toBe(0);
    expect(occurrenceDate(empiezaTarde, "2026-10")).toBe("2026-10-05");
    const terminaAntes = { kind: "expense" as const, amount: 10, day_of_month: 5, end_date: "2026-10-03" };
    expect(occursIn(terminaAntes, "2026-09")).toBe(10);
    expect(occursIn(terminaAntes, "2026-10")).toBe(0);
    const justo = { kind: "expense" as const, amount: 10, day_of_month: 5, start_date: "2026-09-05", end_date: "2026-11-05" };
    expect(["2026-09", "2026-10", "2026-11", "2026-12"].map((m) => occursIn(justo, m))).toEqual([10, 10, 10, 0]);
  });

  test("un día que el mes no tiene cae en su último día", () => {
    const r = { kind: "expense" as const, amount: 10, day_of_month: 31 };
    expect(occurrenceDate(r, "2026-02")).toBe("2026-02-28");
    expect(occurrenceDate(r, "2026-04")).toBe("2026-04-30");
    expect(occurrenceDate(r, "2026-05")).toBe("2026-05-31");
  });

  test("anual con inicio y una sola vez", () => {
    const anual = { kind: "expense" as const, amount: 1200, frequency: "yearly" as const, month: 3, day_of_month: 10, start_date: "2027-03-15" };
    expect(occursIn(anual, "2027-03")).toBe(0);
    expect(occursIn(anual, "2028-03")).toBe(1200);
    const unaVez = { kind: "income" as const, amount: 500, frequency: "once" as const, start_date: "2026-12-24" };
    expect(occurrenceDate(unaVez, "2026-12")).toBe("2026-12-24");
    expect(occursIn(unaVez, "2027-12")).toBe(0);
    expect(occursIn({ ...unaVez, paused: true }, "2026-12")).toBe(0);
  });

  test("el plan del mes deja fuera lo que ya terminó y lo que aún no empieza", () => {
    const credito = { kind: "expense" as const, amount: 1000000, end_date: "2025-12-01" };
    const sueldoNuevo = { kind: "income" as const, amount: 500000, start_date: "2027-06-01" };
    const arriendo = { kind: "expense" as const, amount: 300000, day_of_month: 5, start_date: "2026-09-25" };
    expect(activeIn(credito, "2026-09")).toBe(false);
    expect(activeIn(sueldoNuevo, "2026-09")).toBe(false);
    // Empezó este mes, aunque su día ya pasó: es parte del plan de hoy.
    expect(activeIn(arriendo, "2026-09")).toBe(true);
    expect(planSummary([credito, sueldoNuevo, arriendo], [], "2026-09")).toEqual({ income: 0, fixed: 300000, savings: 0, free: -300000 });
    expect(planSummary([credito, sueldoNuevo, arriendo], [], "2027-06").income).toBe(500000);
    // Sin mes, el promedio de siempre: el anual en doce y el de una vez fuera.
    expect(monthlyEquivalent({ kind: "expense", amount: 1200, frequency: "yearly" })).toBe(100);
    expect(monthlyEquivalent({ kind: "expense", amount: 1200, frequency: "once", start_date: "2026-09-01" }, "2026-09")).toBe(0);
  });

  describe("lo libre del mes", () => {
    // Sueldo 6,5 M, fijos 2,8 M, ahorros 0,2 M: quedan 3,5 M libres.
    const plan = { income: 6500000, fixed: 2800000, savings: 200000, free: 3500000 };

    test("los fijos pagados no se descuentan dos veces", () => {
      const u = budgetUse(plan, [
        { amount: 1800000, fixed: true },
        { amount: 95000, fixed: true },
        { amount: 457900, fixed: false },
      ]);
      expect(u).toMatchObject({ budget: 3500000, fixed: 1895000, variable: 457900, fixedOver: 0, used: 457900, left: 3042100 });
      expect(u.pct).toBeCloseTo(13.08, 2);
    });

    test("lo que los fijos pasan de lo planeado sale de lo libre", () => {
      const u = budgetUse(plan, [
        { amount: 3000000, fixed: true },
        { amount: 100000, fixed: false },
      ]);
      expect(u).toMatchObject({ fixedOver: 200000, used: 300000, left: 3200000 });
    });

    test("sin plan no hay nada libre: todo lo variable es de más", () => {
      const u = budgetUse({ income: 0, fixed: 0, savings: 0, free: 0 }, [{ amount: 50000, fixed: false }]);
      expect(u).toMatchObject({ budget: 0, left: -50000, pct: 0 });
    });
  });

  test("de un ahorro compartido cuenta solo la parte propia", () => {
    const viaje = { id: "v", name: "Viaje", monthly_amount: 1000000, annual_rate: 0, share: 0.5 };
    const propio = { id: "p", name: "Propio", monthly_amount: 200000, annual_rate: 0 };
    const ajeno = { id: "a", name: "Ajeno", monthly_amount: 300000, annual_rate: 0, share: 0 };
    const p = planSummary([{ kind: "income", amount: 3000000 }], [viaje, propio, ajeno]);
    expect(p.savings).toBe(700000);
    expect(p.free).toBe(2300000);
  });

  test("simulación sin rendimiento y gastando todo lo libre", () => {
    const rows = simulate({
      from: "2026-09",
      months: 12,
      total: 110295299,
      recurring,
      savings: savings.map((s) => ({ ...s, current: 0 })),
      spendRatio: 1,
    });
    // Cada mes crece exactamente lo que se ahorra.
    expect(rows[11].total).toBeCloseTo(110295299 + 12 * 2700000, 0);
    expect(rows[11].savingsTotal).toBeCloseTo(12 * 2700000, 0);
    expect(rows[0].month).toBe("2026-10");
  });

  test("simulación con un ahorro compartido: crece solo lo que pongo yo", () => {
    const rows = simulate({
      from: "2026-09",
      months: 10,
      total: 5000000,
      recurring: [{ kind: "income", amount: 4000000 }],
      // Lleva 600.000 en mis cuentas y yo pongo la mitad del aporte.
      savings: [{ id: "v", name: "Viaje", monthly_amount: 1000000, annual_rate: 0, share: 0.5, current: 600000 }],
      spendRatio: 1,
    });
    expect(rows[9].perSaving.v).toBe(600000 + 10 * 500000);
    expect(rows[9].total).toBe(5000000 + 10 * 500000);
  });

  test("simulación con interés en lo suelto y sin gastar nada", () => {
    const rows = simulate({ from: "2026-09", months: 12, total: 1000, recurring: [], savings: [], spendRatio: 0, baseRate: 12 });
    expect(rows[11].total).toBeCloseTo(1120, 6);
  });
});

describe("ahorros", () => {
  test("sin tasa es lineal", () => {
    expect(futureValue(1000, 100, 0, 10)).toBe(2000);
    expect(monthsToTarget(0, 1000000, 0, 12000000)).toBe(12);
  });
  test("con tasa crece más", () => {
    expect(futureValue(0, 1000000, 10, 12)).toBeGreaterThan(12000000);
    const need = monthlyNeeded(0, 10, 12000000, 12);
    expect(futureValue(0, need, 10, 12)).toBeCloseTo(12000000, 0);
  });
  test("la tasa efectiva anual se reparte en doce meses que componen", () => {
    expect(Math.pow(1 + monthlyRate(10), 12)).toBeCloseTo(1.1, 12);
    expect(futureValue(1000, 0, 10, 12)).toBeCloseTo(1100, 9);
  });
  test("una tasa imposible no rompe las cuentas", () => {
    expect(monthlyRate(-300)).toBe(-1);
    expect(monthlyRate(Number.NaN)).toBe(0);
    expect(Number.isFinite(futureValue(100, 10, -300, 12))).toBe(true);
  });
  test("sin aporte no se llega; con lo que ya hay, ya", () => {
    expect(monthsToTarget(100, 0, 0, 200)).toBeNull();
    expect(monthsToTarget(300, 0, 0, 200)).toBe(0);
  });
});

describe("repartir en pesos", () => {
  test("las partes suman justo el total", () => {
    expect(splitByPercent(100001, [50, 50])).toEqual([50001, 50000]);
    expect(splitByPercent(100000, [33, 33, 34])).toEqual([33000, 33000, 34000]);
    expect(splitByPercent(100, [33.33, 33.33, 33.34])).toEqual([33, 33, 34]);
    for (const total of [1, 7, 999, 1234567]) {
      const parts = splitByPercent(total, [10, 20, 30, 40]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  test("son proporciones: no tienen que sumar 100", () => {
    expect(splitByPercent(500000, [30, 20])).toEqual([300000, 200000]);
  });
  test("lo que no tiene porcentaje no recibe nada", () => {
    expect(splitByPercent(10, [0, 100, 0])).toEqual([0, 10, 0]);
    expect(splitByPercent(10, [0, 0])).toEqual([0, 0]);
  });
  test("también un retiro", () => {
    expect(splitByPercent(-101, [50, 50]).reduce((a, b) => a + b, 0)).toBe(-101);
  });
});

describe("formato", () => {
  test("pesos redondeados igual para los dos lados", () => {
    expect(money(1.5)).toBe("$2");
    expect(money(-1.5)).toBe("−$2");
    expect(money(-0.4)).toBe("$0");
    expect(money(9917228)).toBe("$9.917.228");
    expect(money(Number.NaN)).toBe("$0");
  });
});

describe("lo que va de un periodo", () => {
  test("un año en curso se promedia entre los meses que van", () => {
    const s = periodSpan(["2026-01-01", "2027-01-01"], "2026-01-03", "2026-09-25", "month");
    expect(s.months).toBe(9);
    // El presupuesto es el del año entero.
    expect(s.budgetMonths).toBe(12);
  });

  test("si se empezó a anotar en junio, desde junio", () => {
    const s = periodSpan(["2026-01-01", "2027-01-01"], "2026-06-15 12:00:00.000Z", "2026-09-25", "month");
    expect(s.months).toBe(4);
    expect(s.budgetMonths).toBe(7);
  });

  test("un año que ya pasó cuenta completo", () => {
    const s = periodSpan(["2025-01-01", "2026-01-01"], "2025-01-02", "2026-09-25", "month");
    expect(s).toMatchObject({ months: 12, budgetMonths: 12, years: 1 });
  });

  test("seis años con datos desde el anterior", () => {
    const s = periodSpan(["2021-01-01", "2027-01-01"], "2025-03-01", "2026-09-25", "year");
    expect(s.years).toBe(2);
    expect(s.budgetMonths).toBe(22);
  });

  test("semanal: las semanas que van del mes, sin estirar tres días a una semana", () => {
    expect(periodSpan(["2026-09-01", "2026-10-01"], "2026-09-01", "2026-09-25", "week").weeks).toBeCloseTo(25 / 7, 9);
    expect(periodSpan(["2026-08-01", "2026-09-01"], "2026-08-01", "2026-09-25", "week").weeks).toBeCloseTo(31 / 7, 9);
    expect(periodSpan(["2026-09-01", "2026-10-01"], "2026-09-01", "2026-09-03", "week").weeks).toBe(1);
    expect(periodSpan(["2026-09-01", "2026-10-01"], null, "2026-09-25", "week").budgetMonths).toBe(1);
  });

  test("sin datos o en el futuro, se divide entre uno", () => {
    const s = periodSpan(["2027-01-01", "2028-01-01"], null, "2026-09-25", "month");
    expect(s).toMatchObject({ months: 1, years: 1 });
  });
});

describe("estados", () => {
  test("bucketize ignora transferencias", () => {
    const b = bucketize(
      [
        { type: "income", date: "2026-09-02", amount: 100 },
        { type: "expense", date: "2026-09-03", amount: 40 },
        { type: "transfer", date: "2026-09-03", amount: 999 },
        { type: "expense", date: "2026-10-01", amount: 5 },
      ],
      "month",
    );
    expect(b).toEqual([
      { key: "2026-09", income: 100, expense: 40, net: 60 },
      { key: "2026-10", income: 0, expense: 5, net: -5 },
    ]);
  });
});
