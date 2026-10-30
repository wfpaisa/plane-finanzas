import { describe, expect, test } from "bun:test";

import {
  accountAvailability,
  cardCredit,
  cardDebt,
  cardPlan,
} from "../src/lib/cards";
import type { Account } from "../src/lib/types";

const acc = (id: string, type: string, extra: Partial<Account> = {}) =>
  ({
    id,
    type,
    archived: false,
    exclude_from_total: false,
    ...extra,
  }) as Account;

describe("cardPlan", () => {
  test("en el mes en curso reserva toda la deuda y separa lo del mes", () => {
    const p = cardPlan("2026-10", "2026-10", 900_000, [
      { amount: 200_000, programmed: false },
      { amount: 100_000, programmed: false },
    ]);
    expect(p).toEqual({ total: 900_000, month: 300_000, before: 600_000 });
  });

  test("no cuenta dos veces un pago programado hecho con tarjeta", () => {
    const p = cardPlan("2026-10", "2026-10", 500_000, [
      { amount: 150_000, programmed: true },
      { amount: 50_000, programmed: false },
    ]);
    expect(p).toEqual({ total: 350_000, month: 50_000, before: 300_000 });
  });

  test("sin deuda ni pagos en el mes no reserva nada", () => {
    expect(cardPlan("2026-10", "2026-10", 0, [])).toEqual({ total: 0, month: 0, before: 0 });
  });

  test("lo pagado a la tarjeta en el mes sigue reservado", () => {
    const p = cardPlan("2026-10", "2026-10", 0, [{ amount: 80_000, programmed: false }], 300_000);
    expect(p).toEqual({ total: 300_000, month: 80_000, before: 220_000 });
  });

  test("con un pago parcial suma lo pagado y lo que aún se debe", () => {
    const p = cardPlan("2026-10", "2026-10", 200_000, [], 100_000);
    expect(p).toEqual({ total: 300_000, month: 0, before: 300_000 });
  });

  test("en un mes pasado cuenta lo gastado con tarjeta ese mes", () => {
    const p = cardPlan("2026-08", "2026-10", 900_000, [
      { amount: 70_000, programmed: false },
      { amount: 40_000, programmed: true },
    ]);
    expect(p).toEqual({ total: 70_000, month: 70_000, before: 0 });
  });

  test("en un mes que viene, la deuda de hoy queda como de meses anteriores", () => {
    expect(cardPlan("2026-11", "2026-10", 400_000, [])).toEqual({
      total: 400_000,
      month: 0,
      before: 400_000,
    });
  });
});

describe("cardDebt y cardCredit", () => {
  const accounts = [
    acc("t1", "tarjeta"),
    acc("t2", "tarjeta", { archived: true }),
    acc("b1", "ahorros"),
    acc("t3", "tarjeta"),
  ];
  const balances: Record<string, number> = {
    t1: -300_000,
    t2: -50_000,
    b1: -10_000,
    t3: 20_000,
  };

  test("suma solo lo que se debe en las tarjetas activas", () => {
    expect(cardDebt(accounts, (id) => balances[id])).toBe(300_000);
  });

  test("lo disponible es el cupo más el saldo", () => {
    expect(cardCredit({ credit_limit: 2_000_000 }, -300_000)).toEqual({
      limit: 2_000_000,
      owed: 300_000,
      available: 1_700_000,
    });
    expect(cardCredit({}, 20_000)).toEqual({
      limit: 0,
      owed: 0,
      available: 20_000,
    });
  });
});

describe("accountAvailability", () => {
  test("resta lo reservado y todas las deudas una sola vez", () => {
    const accounts = [
      acc("b1", "ahorros"),
      acc("b2", "corriente", { exclude_from_total: true }),
      acc("t1", "tarjeta"),
    ];
    const balances: Record<string, number> = {
      b1: 1_000_000,
      b2: 500_000,
      t1: -200_000,
    };
    expect(
      accountAvailability(accounts, (id) => balances[id], 100_000),
    ).toEqual({ beforeDebts: 900_000, debt: 200_000, available: 700_000 });
  });
});
