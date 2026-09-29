import { describe, expect, test } from "bun:test";

import * as f from "../src/lib/finance";

(globalThis as Record<string, unknown>).__hooks = `${import.meta.dir}/../pocketbase/pb_hooks`;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plan = require("../pocketbase/pb_hooks/lib/plan.js");

// Los programados de prueba: mensual con y sin día, anual, de una vez, con inicio y fin, en pausa.
const cases: f.RecurringLike[] & { id: string }[] = [
  { id: "a", kind: "expense", amount: 1_200_000, frequency: "monthly", day_of_month: 5 },
  { id: "b", kind: "income", amount: 3_000_000, frequency: "monthly", day_of_month: 31 },
  { id: "c", kind: "expense", amount: 80_000, frequency: "monthly", day_of_month: 0 },
  { id: "d", kind: "expense", amount: 900_000, frequency: "yearly", month: 3, day_of_month: 15 },
  { id: "e", kind: "expense", amount: 450_000, frequency: "once", start_date: "2026-11-20" },
  { id: "f", kind: "expense", amount: 200_000, frequency: "monthly", day_of_month: 5, start_date: "2026-09-20", end_date: "2027-02-03" },
  { id: "g", kind: "transfer", amount: 500_000, frequency: "monthly", day_of_month: 10 },
  { id: "h", kind: "expense", amount: 60_000, frequency: "monthly", day_of_month: 1, paused: true },
] as never;

const months = ["2026-02", "2026-03", "2026-09", "2026-10", "2026-11", "2027-02", "2027-03"];

describe("el servidor calcula el plan igual que la pantalla", () => {
  test("fechas, marcas, lo que toca y lo que vale cada mes", () => {
    for (const r of cases) {
      for (const ym of months) {
        const label = `${(r as { id: string }).id} ${ym}`;
        expect([label, plan.occurrenceDate(r, ym)]).toEqual([label, f.occurrenceDate(r, ym)]);
        expect([label, plan.dueDate(r, ym)]).toEqual([label, f.dueDate(r, ym)]);
        expect([label, plan.recurringKey(r, ym)]).toEqual([label, f.recurringKey(r as never, ym)]);
        expect([label, plan.occursIn(r, ym)]).toEqual([label, f.occursIn(r, ym)]);
        expect([label, plan.monthlyEquivalent(r, ym)]).toEqual([label, f.monthlyEquivalent(r, ym)]);
        expect([label, plan.nextDueMonth(r, ym)]).toEqual([label, f.nextDueMonth(r, ym)]);
        expect([label, plan.reserveMonths(r, ym, "2026-01")]).toEqual([label, f.reserveMonths(r, ym, "2026-01")]);
      }
    }
  });

  test("resumen del mes", () => {
    const savings = [
      { id: "s1", name: "Viajes", monthly_amount: 300_000, annual_rate: 0 },
      { id: "s2", name: "Compartido", monthly_amount: 400_000, annual_rate: 0, share: 0.5 },
    ];
    for (const ym of months) expect(plan.summary(cases, savings, ym)).toEqual(f.planSummary(cases, savings, ym));
  });
});

describe("estado y candidatos", () => {
  test("estado de un pendiente", () => {
    const r = { auto_create: false };
    expect(plan.statusOf(r, null, "2026-09-28")).toBe("sin_fecha");
    expect(plan.statusOf(r, "2026-09-05", "2026-09-28")).toBe("vencido");
    expect(plan.statusOf(r, "2026-09-28", "2026-09-28")).toBe("hoy");
    expect(plan.statusOf(r, "2026-09-30", "2026-09-28")).toBe("previsto");
    expect(plan.statusOf({ auto_create: true }, "2026-09-30", "2026-09-28")).toBe("automatico");
  });

  test("candidatos: mismo tipo, monto parecido, sin marca; el más parecido primero", () => {
    const r = { kind: "expense", amount: 1_200_000, account: "a1", category: "c1", to_account: "" };
    const pool = [
      { id: "lejos", type: "expense", amount: 1_150_000, date: "2026-09-20", account: "a1", category: "c1", key: "" },
      { id: "igual", type: "expense", amount: 1_200_000, date: "2026-09-06", account: "a1", category: "c1", key: "" },
      { id: "marcado", type: "expense", amount: 1_200_000, date: "2026-09-05", account: "a1", category: "c1", key: "rec:x:2026-09" },
      { id: "otro-tipo", type: "income", amount: 1_200_000, date: "2026-09-05", account: "a1", category: "", key: "" },
      { id: "caro", type: "expense", amount: 2_000_000, date: "2026-09-05", account: "a1", category: "c1", key: "" },
    ];
    expect(plan.candidatesFor(r, "2026-09-05", pool).map((t: { id: string }) => t.id)).toEqual(["igual", "lejos"]);
  });
});
