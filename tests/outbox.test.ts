import { describe, expect, test } from "bun:test";
import { ClientResponseError } from "pocketbase";

import { balanceDelta, classify, coalesce, newId, overlay, type OutboxItem } from "../src/lib/outbox";

const item = (p: Partial<OutboxItem>): OutboxItem => ({
  key: `transactions/${p.id ?? "a"}`,
  owner: "u",
  op: "create",
  collection: "transactions",
  id: "a",
  at: "2026-09-25T12:00:00Z",
  ...p,
});

const fail = (status: number, data: object = {}) =>
  new ClientResponseError({ status, response: { data, message: "x" } });

describe("id propio", () => {
  test("15 caracteres [a-z0-9], como los de PocketBase", () => {
    for (let i = 0; i < 200; i++) expect(newId()).toMatch(/^[a-z0-9]{15}$/);
  });

  test("no se repiten", () => {
    const ids = new Set(Array.from({ length: 5000 }, newId));
    expect(ids.size).toBe(5000);
  });
});

describe("juntar cambios del mismo registro", () => {
  test("crear y editar: un solo crear con los datos nuevos", () => {
    const r = coalesce(item({ op: "create", data: { amount: 1, description: "café" } }), item({ op: "update", data: { amount: 2 } }));
    expect(r).toEqual({ put: expect.objectContaining({ op: "create", data: { amount: 2, description: "café" } }) });
  });

  test("crear y borrar sin haber salido: no se envía nada", () => {
    expect(coalesce(item({ op: "create" }), item({ op: "delete" }))).toEqual({ drop: true });
  });

  test("editar y borrar: basta con borrar, y se conserva el antes", () => {
    const base = { id: "a", amount: 5 };
    const r = coalesce(item({ op: "update", data: { amount: 9 }, base }), item({ op: "delete" }));
    expect(r).toEqual({ put: expect.objectContaining({ op: "delete", data: undefined, base }) });
  });

  test("uno que ya falló no se toca", () => {
    expect(coalesce(item({ op: "create", error: "x" }), item({ op: "update" }))).toBeNull();
  });
});

describe("qué hacer con la respuesta", () => {
  test("crear con un id que ya existe: el envío anterior sí llegó", () => {
    expect(classify({ op: "create" }, fail(400, { id: { code: "validation_not_unique" } }))).toBe("done");
  });

  test("otro error de validación al crear: lo decide la persona", () => {
    expect(classify({ op: "create" }, fail(400, { amount: { code: "validation_min" } }))).toBe("fatal");
  });

  test("borrar lo que ya no está: hecho", () => {
    expect(classify({ op: "delete" }, fail(404))).toBe("done");
  });

  test("editar lo que otro borró: lo decide la persona", () => {
    expect(classify({ op: "update" }, fail(404))).toBe("fatal");
  });

  test("sin red, tiempo agotado o servidor caído: otra vez luego", () => {
    expect(classify({ op: "create" }, fail(0))).toBe("retry");
    expect(classify({ op: "create" }, fail(503))).toBe("retry");
    expect(classify({ op: "create" }, new TypeError("Failed to fetch"))).toBe("retry");
  });

  test("sesión vencida: a entrar de nuevo", () => {
    expect(classify({ op: "update" }, fail(401))).toBe("auth");
  });
});

describe("la lista con lo pendiente encima", () => {
  type T = { id: string; date: string; amount: number };
  const sept = (t: T) => t.date.startsWith("2026-09");
  const server: T[] = [
    { id: "x", date: "2026-09-10", amount: 10 },
    { id: "y", date: "2026-09-11", amount: 20 },
  ];

  test("lo nuevo aparece marcado como pendiente", () => {
    const out = overlay("transactions", server, [item({ id: "n", data: { date: "2026-09-12", amount: 5 } })], sept);
    expect(out.find((t) => t.id === "n")).toMatchObject({ amount: 5, _pending: true });
  });

  test("lo editado cambia, lo borrado se va", () => {
    const out = overlay(
      "transactions",
      server,
      [item({ id: "x", op: "update", data: { amount: 99 } }), item({ id: "y", op: "delete" })],
      sept,
    );
    expect(out).toEqual([{ id: "x", date: "2026-09-10", amount: 99, _pending: true, created: expect.any(String) }]);
  });

  test("editado a otro mes: sale de esta lista", () => {
    const out = overlay("transactions", server, [item({ id: "x", op: "update", data: { date: "2026-10-01" } })], sept);
    expect(out.map((t) => t.id)).toEqual(["y"]);
  });

  test("editado desde otro mes: entra, con lo que se sabía de antes", () => {
    const base = { id: "z", date: "2026-08-30", amount: 7 };
    const out = overlay("transactions", server, [item({ id: "z", op: "update", data: { date: "2026-09-01" }, base })], sept);
    expect(out.find((t) => t.id === "z")).toMatchObject({ amount: 7, date: "2026-09-01" });
  });

  test("el que falló se ve con su error", () => {
    const out = overlay("transactions", [], [item({ id: "n", data: { date: "2026-09-12" }, error: "no" })], sept);
    expect(out[0]).toMatchObject({ _error: "no" });
  });
});

describe("saldos mientras tanto", () => {
  test("gasto nuevo resta, ingreso suma", () => {
    const d = balanceDelta([
      item({ id: "a", data: { type: "expense", amount: 100, account: "A" } }),
      item({ id: "b", data: { type: "income", amount: 30, account: "A" } }),
    ]);
    expect(d).toEqual({ A: -70 });
  });

  test("transferencia: sale de una y entra a la otra", () => {
    expect(balanceDelta([item({ data: { type: "transfer", amount: 50, account: "A", to_account: "B" } })])).toEqual({ A: -50, B: 50 });
  });

  test("editar el valor mueve solo la diferencia", () => {
    const base = { type: "expense", amount: 100, account: "A" };
    expect(balanceDelta([item({ op: "update", data: { amount: 120 }, base })])).toEqual({ A: -20 });
  });

  test("cambiar de cuenta devuelve a una y quita de la otra", () => {
    const base = { type: "expense", amount: 100, account: "A" };
    expect(balanceDelta([item({ op: "update", data: { account: "B" }, base })])).toEqual({ A: 100, B: -100 });
  });

  test("borrar devuelve el dinero", () => {
    const base = { type: "expense", amount: 100, account: "A" };
    expect(balanceDelta([item({ op: "delete", base })])).toEqual({ A: 100 });
  });

  test("crear (ya enviándose) y luego borrar: nada", () => {
    const d = balanceDelta([
      item({ seq: 1, data: { type: "expense", amount: 100, account: "A" } }),
      item({ seq: 2, op: "delete" }),
    ]);
    expect(d.A ?? 0).toBe(0);
  });
});
