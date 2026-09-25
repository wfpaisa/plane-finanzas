import { describe, expect, test } from "bun:test";

import {
  addMonths,
  bucketize,
  futureValue,
  monthlyNeeded,
  monthsToTarget,
  occursIn,
  planSummary,
  simulate,
  weekStart,
  weeksOfMonth,
} from "../src/lib/finance";

describe("fechas", () => {
  test("addMonths cruza años", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
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
