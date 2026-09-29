import { describe, expect, test } from "bun:test";

// provisions.js corre en PocketBase (goja): aquí se le da un `app` de mentira
// con lo poco que usa y el `Record` global, como en scheduler.test.ts.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const p = require("../pocketbase/pb_hooks/lib/provisions.js");

type Fields = Record<string, unknown>;

class FakeRecord {
  id = "";
  fields: Fields = {};
  constructor(public collection: string) {}
  set(k: string, v: unknown) {
    this.fields[k] = v;
  }
  getString(k: string) {
    return String(this.fields[k] ?? "");
  }
  getFloat(k: string) {
    return Number(this.fields[k]) || 0;
  }
}

(globalThis as Record<string, unknown>).Record = FakeRecord;

function rec(collection: string, id: string, fields: Fields) {
  const r = new FakeRecord(collection);
  r.id = id;
  r.fields = { ...fields };
  return r;
}

function fakeApp(recurring: FakeRecord[], movements: FakeRecord[]) {
  const has = (r: FakeRecord, params: Record<string, string>) =>
    (!params.s || r.fields.saving === params.s) &&
    (!params.k || r.fields.external_id === params.k) &&
    (!params.u || r.fields.created_by === params.u);
  return {
    movements,
    findRecordById: (_c: string, id: string) => {
      const r = recurring.find((x) => x.id === id);
      if (!r) throw new Error("no está");
      return r;
    },
    findRecordsByFilter: (_c: string, _f: string, _s: string, _l: number, _o: number, params: Record<string, string>) =>
      movements.filter((m) => has(m, params)),
    findFirstRecordByFilter: (_c: string, _f: string, params: Record<string, string>) => {
      const m = movements.find((x) => has(x, params));
      if (!m) throw new Error("no está");
      return m;
    },
    findCollectionByNameOrId: (n: string) => n,
    save: (r: FakeRecord) => movements.push(r),
    delete: (r: FakeRecord) => movements.splice(movements.indexOf(r), 1),
  };
}

const predial = rec("recurring", "r", { owner: "u", name: "Predial", account: "a", saving: "s" });
const pago = rec("transactions", "t", { owner: "u", external_id: "rec:r:2027", account: "b", date: "2027-03-15 12:00:00.000Z" });

describe("provisiones", () => {
  test("al pagar se libera todo lo apartado, una sola vez", () => {
    const app = fakeApp([predial], [
      rec("saving_movements", "m1", { saving: "s", amount: 600000, created_by: "u" }),
      rec("saving_movements", "m2", { saving: "s", amount: 500000, created_by: "u" }),
    ]);
    p.onPaid(app, pago);
    p.onPaid(app, pago);
    const out = app.movements.filter((m) => Number(m.fields.amount) < 0);
    expect(out.map((m) => m.fields)).toEqual([
      expect.objectContaining({ saving: "s", account: "a", amount: -1100000, external_id: "pay:rec:r:2027", created_by: "u" }),
    ]);
  });

  test("sin provisión o sin nada apartado, no hace nada", () => {
    const sin = rec("recurring", "x", { owner: "u", name: "Arriendo", account: "a", saving: "" });
    const app = fakeApp([predial, sin], []);
    p.onPaid(app, rec("transactions", "t", { owner: "u", external_id: "rec:x:2027-03" }));
    p.onPaid(app, pago);
    p.onPaid(app, rec("transactions", "t", { owner: "u", external_id: "" }));
    expect(app.movements.length).toBe(0);
  });

  test("al borrar el pago lo apartado vuelve", () => {
    const app = fakeApp([predial], [rec("saving_movements", "m1", { saving: "s", amount: 1200000, created_by: "u" })]);
    p.onPaid(app, pago);
    p.onUnpaid(app, pago);
    expect(app.movements.map((m) => m.fields.amount)).toEqual([1200000]);
  });
});
