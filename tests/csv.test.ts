import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import { parseCsv, planFromCsv } from "../src/lib/csvImport";

const text = readFileSync(new URL("../seed/registro-contable.csv", import.meta.url), "utf8");

describe("registro contable", () => {
  const plan = planFromCsv(text);

  test("lee todas las filas", () => {
    // 170 filas: 4 son "Modificar saldo" (saldos de partida), el resto movimientos.
    expect(plan.transactions.length + 4 + plan.skipped).toBe(170);
    expect(plan.skipped).toBe(0);
  });

  test("dinero gastado es transferencia a la cuenta de la categoría", () => {
    const t = plan.transactions.find((x) => x.description === "Pago tarjeta")!;
    expect(t).toMatchObject({ type: "transfer", account: "Banco Principal", toAccount: "Tarjeta Visa" });
  });

  test("gasto: subcategoría como categoría y Fijos/Variables como etiqueta", () => {
    expect(plan.categories).toContainEqual({ name: "Comer afuera", kind: "expense", tags: ["variable"] });
    expect(plan.categories).toContainEqual({ name: "Arriendo", kind: "expense", tags: ["fijo"] });
    expect(plan.categories).toContainEqual({ name: "Salario", kind: "income", tags: [] });
  });

  test("modificar saldo es el saldo inicial", () => {
    const acc = (n: string) => plan.accounts.find((a) => a.name === n)!;
    expect(acc("Banco Principal").initial).toBe(4200000);
    expect(acc("Fondo de inversión").initial).toBe(12000000);
    expect(acc("Efectivo").initial).toBe(180000);
    expect(acc("Tarjeta Visa").type).toBe("tarjeta");
    expect(acc("Fondo de inversión").type).toBe("inversion");
  });

  test("notación científica y campos con comas", () => {
    expect(plan.transactions.some((t) => t.amount === 34000000)).toBe(true);
    expect(parseCsv('a,"b, c",d\n1,"x ""y""",2')).toEqual([
      ["a", "b, c", "d"],
      ["1", 'x "y"', "2"],
    ]);
  });

  test("ids estables", () => {
    expect(planFromCsv(text).transactions[0].key).toBe(plan.transactions[0].key);
    expect(new Set(plan.transactions.map((t) => t.key)).size).toBe(plan.transactions.length);
  });
});

describe("filas raras", () => {
  const head = "Fecha,Cuenta,Categoría,Subcategorías,Nota,COP,Ingreso/Gasto,Descripción,Importe\n";

  test("notación científica también en COP", () => {
    const p = planFromCsv(`${head}01/09/2026 10:00:00,Banco Principal,Variables,Mercado,Fruver,3.4E4,Gasto,,\n`);
    expect(p.transactions[0].amount).toBe(34000);
  });

  test("una transferencia sin cuenta de destino no se inventa una cuenta sin nombre", () => {
    const p = planFromCsv(`${head}01/09/2026 10:00:00,Banco Principal,,,Pago,50000,Dinero gastado,,\n`);
    expect(p.transactions).toEqual([]);
    expect(p.skipped).toBe(1);
    expect(p.accounts.map((a) => a.name)).toEqual([]);
  });
});
