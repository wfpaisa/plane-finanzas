import { describe, expect, test } from "bun:test";

// inbox.js, rules.js y review.js cargan sus vecinos con la ruta de los hooks, como en PocketBase.
(globalThis as Record<string, unknown>).__hooks = `${import.meta.dir}/../pocketbase/pb_hooks`;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const p = require("../pocketbase/pb_hooks/lib/parsers.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const refs = require("../pocketbase/pb_hooks/lib/refs.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const inbox = require("../pocketbase/pb_hooks/lib/inbox.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const review = require("../pocketbase/pb_hooks/lib/review.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rules = require("../pocketbase/pb_hooks/lib/rules.js");

describe("el lector entiende la operación", () => {
  const read = (text: string) => p.parseMessage({ text });

  test("de dónde sale y a dónde llega", () => {
    expect(read("Banco Principal: Transferiste $150.000 desde tu cuenta *1234 a la cuenta *5678 el 22/09/2026.").refs).toEqual([
      { ref: "1234", role: "from" },
      { ref: "5678", role: "to" },
    ]);
    expect(read("Banco Principal: Pagaste $600.000 en la tarjeta de credito *5678 desde la cuenta *1234, el 25/09/2026.").refs).toEqual([
      { ref: "5678", role: "to" },
      { ref: "1234", role: "from" },
    ]);
    expect(read("Banco Principal: Compraste $20.000 en TIENDA DEMO con tu T.Deb *1234, el 24/09/2026.").refs).toEqual([{ ref: "1234", role: "" }]);
    expect(read("Recibiste $80.000 de la llave @ana123 en tu cuenta *1234.").refs).toEqual([
      { ref: "@ana123", role: "from" },
      { ref: "1234", role: "to" },
    ]);
  });

  test("la llave de otra persona no es el comercio", () => {
    expect(read("Enviaste $50.000 a la llave @ana123 desde tu cuenta *1234.").merchant).toBe("");
  });

  test("tipo de operación", () => {
    expect(read("Banco Principal: Compraste $20.000 en TIENDA DEMO con tu T.Deb *1234.").operation).toBe("compra");
    expect(read("Banco Principal le informa Retiro por $200.000 en CAJERO CENTRO. T.Deb *1234.").operation).toBe("retiro");
    expect(read("Banco Principal: Recibiste un pago de Nomina de EMPRESA DEMO por $3.000.000 en tu cuenta *1234.").operation).toBe("nomina");
    expect(read("Banco Principal: Pagaste $600.000 en la tarjeta *5678 desde la cuenta *1234.").operation).toBe("pago");
  });

  test("rechazada, pero no por el pie del aviso", () => {
    expect(p.parseMessage({ subject: "Transacción rechazada", text: "Tu pago PSE por $90.000 a TIENDA DEMO no fue aprobado." }).rejected).toBe(true);
    expect(read("Compraste $20.000 en TIENDA DEMO con tu T.Deb *1234. Si esta compra no fue realizada por ti, llámanos.").rejected).toBe(false);
  });
});

describe("cuentas por terminación y llave", () => {
  const accounts = [
    { id: "ahorros", name: "Ahorros Banco Principal", type: "ahorros", senders: ["bancoprincipal"], refs: refs.refsOf(["*1234"]) },
    { id: "tarjeta", name: "Tarjeta Demo", type: "tarjeta", senders: [], refs: refs.refsOf(["**5678"]) },
    { id: "billetera", name: "Billetera", type: "ahorros", senders: [], refs: refs.refsOf(["@ana123"]) },
    { id: "efectivo", name: "Efectivo", type: "efectivo", senders: [], refs: [] },
  ];
  const categories = [
    { id: "c-mercado", name: "Mercado", kind: "expense", keywords: "", keys: [] },
    { id: "c-hogar", name: "Hogar", kind: "expense", keywords: "", keys: [] },
    { id: "c-personal", name: "Personal", kind: "expense", keywords: "", keys: [] },
  ];
  const from = "Banco Principal <alertas@bancoprincipal.com>";
  const mail = (text: string) => ({ id: "m1", from, subject: "Alerta", date: "2026-09-25", text });
  const ctx = (extra: Record<string, unknown> = {}) => ({ accounts, categories, merchants: [], rules: [], ...extra });

  test("la compra con la tarjeta va a la tarjeta, no a la cuenta del remitente", () => {
    const s = inbox.suggest(mail("Banco Principal: Compraste $20.000 en TIENDA DEMO con tu T.Cred *5678, el 24/09/2026."), ctx());
    expect(s.tx).toMatchObject({ type: "expense", account: "tarjeta" });
  });

  test("pagar la tarjeta desde la cuenta es una transferencia entre las dos", () => {
    const s = inbox.suggest(mail("Banco Principal: Pagaste $600.000 en la tarjeta *5678 desde la cuenta *1234, el 25/09/2026."), ctx());
    expect(s.tx).toMatchObject({ type: "transfer", account: "ahorros", to_account: "tarjeta", category: "", description: "Pago de Tarjeta Demo" });
  });

  test("recibir de una llave propia: transferencia desde esa cuenta", () => {
    const s = inbox.suggest(mail("Recibiste $80.000 de la llave @ana123 en tu cuenta *1234, el 25/09/2026."), ctx());
    expect(s.tx).toMatchObject({ type: "transfer", account: "billetera", to_account: "ahorros" });
  });

  test("un retiro va a la cuenta de efectivo", () => {
    const s = inbox.suggest(mail("Banco Principal le informa Retiro por $200.000 en CAJERO CENTRO. 24/09/2026 T.Deb *1234."), ctx());
    expect(s.tx).toMatchObject({ type: "transfer", account: "ahorros", to_account: "efectivo" });
  });

  test("la cuenta de otra persona hace de comercio y se nombra con un alias", () => {
    const text = "Banco Principal: Transferiste $900.000 desde tu cuenta *1234 a la cuenta *12345678901, el 05/09/2026.";
    const sin = inbox.suggest(mail(text), ctx());
    expect(sin.tx).toMatchObject({ type: "expense", account: "ahorros", description: "Transferiste a *12345678901" });
    expect(sin.merchant.text).toBe("*12345678901");
    const con = inbox.suggest(mail(text), ctx({ merchants: [{ id: "a1", match: "12345678901", name: "Arriendo", category: "c-hogar" }] }));
    expect(con.tx).toMatchObject({ description: "Arriendo", category: "c-hogar" });
  });

  test("una regla general: su cuenta y su categoría son por defecto", () => {
    const general = { id: "r1", name: "Todo el banco", sender: "bancoprincipal", type: "expense", account: "ahorros", category: "c-personal" };
    const merchants = [{ id: "a1", match: "tienda demo", name: "Tienda", category: "c-mercado" }];
    const compra = "Banco Principal: Compraste $20.000 en TIENDA DEMO con tu T.Cred *5678, el 24/09/2026.";
    // La tarjeta la dice el aviso y la categoría, el alias.
    expect(inbox.suggest(mail(compra), ctx({ rules: [general], merchants })).tx).toMatchObject({ account: "tarjeta", category: "c-mercado", rule: "r1" });
    // Sin alias, la de la regla.
    expect(inbox.suggest(mail(compra), ctx({ rules: [general] })).tx).toMatchObject({ account: "tarjeta", category: "c-personal" });
    // Un pago entre cuentas propias sigue siendo transferencia.
    const pago = "Banco Principal: Pagaste $600.000 en la tarjeta *5678 desde la cuenta *1234, el 25/09/2026.";
    expect(inbox.suggest(mail(pago), ctx({ rules: [general] })).tx).toMatchObject({ type: "transfer", to_account: "tarjeta", category: "" });
  });

  test("aplicar una regla después (desde la bandeja) tampoco pisa lo que el aviso dice", () => {
    const general = { id: "r1", name: "Todo el banco", sender: "bancoprincipal", type: "expense", account: "ahorros", category: "c-personal" };
    const pago = "Banco Principal: Pagaste $600.000 en la tarjeta *5678 desde la cuenta *1234, el 25/09/2026.";
    // Así lo hace inbox.applyRule: lo leído sin reglas y la regla encima.
    const leido = inbox.suggest(mail(pago), ctx()).tx;
    expect(rules.apply(general, leido)).toMatchObject({ type: "transfer", account: "ahorros", to_account: "tarjeta", category: "" });
  });

  test("lo rechazado se descarta aunque una regla lo reconozca", () => {
    const general = { id: "r1", name: "Todo el banco", sender: "bancoprincipal", type: "expense", account: "ahorros" };
    const m = { ...mail("Tu pago PSE por $90.000 a TIENDA DEMO fue rechazado."), subject: "Pago rechazado" };
    const s = inbox.suggest(m, ctx({ rules: [general] }));
    expect(s).toMatchObject({ rejected: true, rule: null });
    const r = review.inspect([m], {
      ...ctx({ rules: [general] }),
      allAccounts: Object.fromEntries(accounts.map((a) => [a.id, { ...a, archived: false }])),
      categoriesById: Object.fromEntries(categories.map((c) => [c.id, c])),
      readSenders: ["bancoprincipal"],
      state: () => ({ status: "nuevo" }),
    });
    expect(r.messages[0]).toMatchObject({ action: "descartar", rejected: true, onSync: "descartar" });
  });

  test("referencias de una cuenta: sin asterisco y con al menos 4 dígitos", () => {
    expect(refs.refsOf(["*1234", "**5678", "300 123 4567", "@Ana123", "12"])).toEqual(["1234", "5678", "3001234567", "@ana123"]);
  });
});
