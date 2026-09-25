import { afterEach, describe, expect, test } from "bun:test";

import { occurrenceDate, type RecurringLike } from "../src/lib/finance";

// scheduler.js corre en PocketBase (goja): aquí se le da un `app` de mentira
// con lo poco que usa y el `Record` global.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const s = require("../pocketbase/pb_hooks/lib/scheduler.js");

type Fields = Record<string, unknown>;

class FakeRecord {
  id = "";
  fields: Fields = {};
  constructor(public collection: string) {}
  set(k: string, v: unknown) {
    this.fields[k] = v;
  }
}

function record(id: string, fields: Fields) {
  return {
    id,
    getString: (k: string) => (typeof fields[k] === "object" ? JSON.stringify(fields[k]) : String(fields[k] ?? "")),
    getInt: (k: string) => Math.trunc(Number(fields[k]) || 0),
    getFloat: (k: string) => Number(fields[k]) || 0,
  };
}

function fakeApp(rows: { recurring?: Fields[]; savings?: Fields[]; accounts?: Fields[] }) {
  const saved: FakeRecord[] = [];
  return {
    saved,
    findRecordsByFilter: (col: "recurring" | "savings") => (rows[col] ?? []).map((f, i) => record(String(f.id ?? `${col}${i}`), f)),
    findCollectionByNameOrId: (name: string) => name,
    findRecordById: (_col: string, id: string) => {
      const a = (rows.accounts ?? []).find((x) => x.id === id);
      if (!a) throw new Error("no está");
      return record(id, a);
    },
    // "¿Ya existe esta marca?": se busca entre lo guardado en esta corrida.
    findFirstRecordByFilter: (_col: string, _filter: string, params: { k: string }) => {
      const hit = saved.find((r) => r.fields.external_id === params.k);
      if (!hit) throw new Error("no está");
      return hit;
    },
    save: (r: FakeRecord) => saved.push(r),
  };
}

const realNow = Date.now;
/** Pone el reloj en una hora de Colombia (UTC-5). */
function at(colombia: string) {
  const ms = Date.parse(`${colombia}T12:00:00-05:00`);
  Date.now = () => ms;
}

(globalThis as Record<string, unknown>).Record = FakeRecord;

afterEach(() => {
  Date.now = realNow;
});

describe("fijos automáticos", () => {
  // El programador y la proyección del plan (occurrenceDate) tienen que
  // decir lo mismo: si ya pasó el día que toca, se crea; si no, no.
  const cases: (RecurringLike & { day_of_month?: number })[] = [
    { kind: "expense", amount: 10, day_of_month: 5 },
    { kind: "expense", amount: 10, day_of_month: 5, start_date: "2026-09-20" },
    { kind: "expense", amount: 10, day_of_month: 25, start_date: "2026-09-20" },
    { kind: "expense", amount: 10, day_of_month: 5, end_date: "2026-09-03" },
    { kind: "expense", amount: 10, day_of_month: 31 },
    { kind: "income", amount: 10, day_of_month: 1, frequency: "yearly", month: 9 },
    { kind: "income", amount: 10, day_of_month: 1, frequency: "yearly", month: 10 },
    { kind: "expense", amount: 10, frequency: "once", start_date: "2026-09-10" },
    { kind: "expense", amount: 10, frequency: "once", start_date: "2026-09-28" },
  ];

  test.each(cases.map((c, i) => [i, c] as const))("caso %d", (_i, r) => {
    at("2026-09-26");
    const app = fakeApp({ recurring: [{ ...r, id: "r", owner: "u", account: "acc", auto_create: true }] });
    s.runRecurring(app, "u");
    const date = occurrenceDate(r, "2026-09");
    const expected = date && date <= "2026-09-26" ? date : null;
    expect(app.saved[0]?.fields.date?.toString().slice(0, 10) ?? null).toBe(expected);
  });

  test("no se crea dos veces", () => {
    at("2026-09-26");
    const app = fakeApp({ recurring: [{ id: "r", owner: "u", account: "acc", kind: "expense", amount: 10, day_of_month: 5 }] });
    s.runRecurring(app, "u");
    s.runRecurring(app, "u");
    expect(app.saved.length).toBe(1);
    expect(app.saved[0].fields).toMatchObject({ external_id: "rec:r:2026-09", tags: ["fijo"], source: "recurrente" });
  });
});

describe("aportes automáticos", () => {
  test("el reparto suma justo el aporte", () => {
    at("2026-09-26");
    const app = fakeApp({
      savings: [
        {
          id: "s",
          owner: "u",
          monthly_amount: 100000,
          day_of_month: 15,
          allocations: [
            { account: "a", percent: 33 },
            { account: "b", percent: 33 },
            { account: "c", percent: 34 },
          ],
        },
      ],
      accounts: ["a", "b", "c"].map((id) => ({ id, owner: "u" })),
    });
    s.runSavings(app, "u");
    expect(app.saved.map((r) => r.fields.amount)).toEqual([33000, 33000, 34000]);
    const odd = fakeApp({
      savings: [{ id: "s", owner: "u", monthly_amount: 100001, day_of_month: 1, allocations: [{ account: "a", percent: 50 }, { account: "b", percent: 50 }] }],
      accounts: ["a", "b"].map((id) => ({ id, owner: "u" })),
    });
    s.runSavings(odd, "u");
    expect(odd.saved.reduce((a, r) => a + Number(r.fields.amount), 0)).toBe(100001);
  });

  test("un reparto viejo con la cuenta repetida se suma en una parte", () => {
    at("2026-09-26");
    const app = fakeApp({
      savings: [{ id: "s", owner: "u", monthly_amount: 1000, day_of_month: 1, allocations: [{ account: "a", percent: 60 }, { account: "a", percent: 40 }] }],
      accounts: [{ id: "a", owner: "u" }],
    });
    s.runSavings(app, "u");
    expect(app.saved.map((r) => r.fields.amount)).toEqual([1000]);
  });

  test("en un compartido, cada parte la aporta el dueño de su cuenta", () => {
    at("2026-09-26");
    const app = fakeApp({
      savings: [{ id: "s", owner: "u", monthly_amount: 1000, day_of_month: 1, allocations: [{ account: "mia", percent: 50 }, { account: "suya", percent: 50 }] }],
      accounts: [
        { id: "mia", owner: "u" },
        { id: "suya", owner: "otra" },
      ],
    });
    s.runSavings(app, "u");
    expect(app.saved.map((r) => [r.fields.account, r.fields.created_by, r.fields.amount])).toEqual([
      ["mia", "u", 500],
      ["suya", "otra", 500],
    ]);
  });

  test("antes de su día no aporta", () => {
    at("2026-09-10");
    const app = fakeApp({ savings: [{ id: "s", owner: "u", monthly_amount: 1000, day_of_month: 15 }] });
    s.runSavings(app, "u");
    expect(app.saved.length).toBe(0);
  });
});
