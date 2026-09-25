import { describe, expect, test } from "bun:test";

(globalThis as Record<string, unknown>).__hooks = `${import.meta.dir}/../pocketbase/pb_hooks`;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pairable } = require("../pocketbase/pb_hooks/lib/dupes.js");

const tx = (o: Record<string, string>) => ({ type: "expense", account: "a1", to_account: "", source: "gmail", external_id: "m1", ...o });

describe("pairable", () => {
  test("lo anotado a mano contra lo del banco, del mismo tipo", () => {
    expect(pairable(tx({ source: "manual", external_id: "" }), tx({}))).toBe(true);
  });

  test("lo anotado a mano que ya se unió no se vuelve a emparejar", () => {
    expect(pairable(tx({ source: "manual", external_id: "m0" }), tx({}))).toBe(false);
  });

  test("dos compras iguales del banco no son repetidas", () => {
    expect(pairable(tx({}), tx({ external_id: "m2" }))).toBe(false);
  });

  test("los dos avisos de un pago entre cuentas propias sí", () => {
    const transfer = tx({ type: "transfer", account: "a1", to_account: "a2" });
    // El segundo correo lo asignó a la cuenta de origen o a la de destino.
    expect(pairable(transfer, tx({ external_id: "m2", account: "a1" }))).toBe(true);
    expect(pairable(tx({ external_id: "m2", type: "income", account: "a2" }), transfer)).toBe(true);
    // Otra cuenta: no es el mismo pago.
    expect(pairable(transfer, tx({ external_id: "m2", account: "a3" }))).toBe(false);
  });

  test("una transferencia anotada a mano contra el gasto que trajo el banco", () => {
    const mine = tx({ type: "transfer", account: "a1", to_account: "a2", source: "manual", external_id: "" });
    expect(pairable(mine, tx({}))).toBe(true);
  });

  test("los fijos quedan por fuera", () => {
    expect(pairable(tx({ source: "recurrente", external_id: "rec:1" }), tx({ source: "manual", external_id: "" }))).toBe(false);
  });
});
