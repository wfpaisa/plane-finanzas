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

function fakeApp(rows: { recurring?: Fields[]; savings?: Fields[]; accounts?: Fields[]; saving_movements?: Fields[] }) {
  const saved: FakeRecord[] = [];
  return {
    saved,
    findRecordsByFilter: (col: "recurring" | "savings" | "saving_movements") =>
      (rows[col] ?? []).map((f, i) => record(String(f.id ?? `${col}${i}`), f)),
    findCollectionByNameOrId: (name: string) => name,
    findRecordById: (_col: string, id: string) => {
      const a = (rows.accounts ?? []).find((x) => x.id === id);
      if (!a) throw new Error("no está");
      return record(id, a);
    },
    // "¿Ya existe esta marca?": se busca entre lo guardado en esta corrida y
    // los aportes de antes. Con `~`, la marca empieza así.
    findFirstRecordByFilter: (_col: string, filter: string, params: { k: string }) => {
      const same = (ext: unknown) => (filter.includes("~") ? String(ext ?? "").startsWith(params.k) : ext === params.k);
      const hit = saved.find((r) => same(r.fields.external_id)) ?? (rows.saving_movements ?? []).find((m) => same(m.external_id));
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

  test("si la persona lo borró, no vuelve", () => {
    at("2026-09-26");
    const app = fakeApp({ recurring: [{ id: "r", owner: "u", account: "acc", kind: "expense", amount: 10, day_of_month: 5 }] });
    const find = app.findFirstRecordByFilter;
    app.findFirstRecordByFilter = (col: string, filter: string, params: { k: string }) => {
      if (col === "ignored_imports" && params.k === "rec:r:2026-09") return new FakeRecord(col);
      return find(col, filter, params);
    };
    s.runRecurring(app, "u");
    expect(app.saved.length).toBe(0);
  });
});

describe("aportes automáticos", () => {
  test("va a la cuenta del último aporte del dueño", () => {
    at("2026-09-26");
    const app = fakeApp({
      savings: [{ id: "s", owner: "u", monthly_amount: 100000, day_of_month: 15 }],
      saving_movements: [{ saving: "s", account: "b", created_by: "u", amount: 50000, external_id: "" }],
    });
    s.runSavings(app, "u");
    expect(app.saved.map((r) => r.fields)).toEqual([
      expect.objectContaining({ account: "b", created_by: "u", amount: 100000, external_id: "auto:2026-09:b" }),
    ]);
  });

  test("sin aportes antes, queda sin cuenta", () => {
    at("2026-09-26");
    const app = fakeApp({ savings: [{ id: "s", owner: "u", monthly_amount: 1000, day_of_month: 1 }] });
    s.runSavings(app, "u");
    expect(app.saved[0].fields.account).toBeUndefined();
    expect(app.saved[0].fields.external_id).toBe("auto:2026-09:sin-cuenta");
  });

  test("uno por mes, también si el de este mes se hizo con el reparto de antes", () => {
    at("2026-09-26");
    const app = fakeApp({
      savings: [{ id: "s", owner: "u", monthly_amount: 1000, day_of_month: 1 }],
      saving_movements: [{ saving: "s", account: "a", created_by: "u", amount: 500, external_id: "auto:2026-09:a" }],
    });
    s.runSavings(app, "u");
    s.runSavings(app, "u");
    expect(app.saved.length).toBe(0);
  });

  test("antes de su día no aporta", () => {
    at("2026-09-10");
    const app = fakeApp({ savings: [{ id: "s", owner: "u", monthly_amount: 1000, day_of_month: 15 }] });
    s.runSavings(app, "u");
    expect(app.saved.length).toBe(0);
  });
});
