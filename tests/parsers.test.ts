import { describe, expect, test } from "bun:test";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const p = require("../pocketbase/pb_hooks/lib/parsers.js");

describe("parseAmount", () => {
  test.each([
    ["45.900,00", 45900],
    ["150.000", 150000],
    ["8.000.000", 8000000],
    ["1,250.50", 1250.5],
    ["2.132.121", 2132121],
    ["45900", 45900],
  ])("%s", (raw, n) => expect(p.parseAmount(raw)).toBe(n));
});

describe("parseMessage", () => {
  test("compra Bancolombia con tarjeta crédito", () => {
    const r = p.parseMessage({
      from: "alertasynotificaciones@notificacionesbancolombia.com",
      text: "Bancolombia le informa Compra por $45.900,00 en EXITO LAURELES 14:32. 22/09/2026 T.Cred *1234. Inquietudes al 6045109095.",
    });
    expect(r).toMatchObject({ amount: 45900, type: "expense", merchant: "EXITO LAURELES", date: "2026-09-22", bank: "Bancolombia" });
    expect(r.last4).toContain("1234");
  });

  test("compraste con débito", () => {
    const r = p.parseMessage({
      from: "notificaciones@bancolombia.com.co",
      text: "Bancolombia: Compraste $120.500 en RAPPI COLOMBIA con tu T.Deb *4321, el 21/09/2026 a las 20:10. Si tienes dudas llama.",
    });
    expect(r).toMatchObject({ amount: 120500, type: "expense", merchant: "RAPPI COLOMBIA", date: "2026-09-21" });
    expect(r.last4).toEqual(["4321"]);
  });

  test("nómina es ingreso", () => {
    const r = p.parseMessage({
      from: "bancolombia",
      text: "Bancolombia le informa Pago de Nomina de ACME SAS por $8.000.000,00 en su Cuenta Ahorros 9876. 15:05 30/09/2026",
    });
    expect(r).toMatchObject({ amount: 8000000, type: "income", merchant: "ACME SAS", date: "2026-09-30" });
    expect(r.last4).toContain("9876");
  });

  test("recibiste transferencia", () => {
    const r = p.parseMessage({
      text: "Bancolombia: Recibiste una transferencia por $350.000 de ANA PEREZ en tu cuenta **1234, el 18/09/2026 a las 09:00.",
    });
    expect(r).toMatchObject({ amount: 350000, type: "income", merchant: "ANA PEREZ" });
  });

  test("transferiste entre cuentas trae dos terminaciones", () => {
    const r = p.parseMessage({
      text: "Bancolombia: Transferiste $150.000 desde tu cuenta *1234 a la cuenta *5678 el 22/09/2026 a las 10:00.",
    });
    expect(r).toMatchObject({ amount: 150000, type: "expense" });
    expect(r.last4).toEqual(["1234", "5678"]);
  });

  test("pagaste un crédito", () => {
    const r = p.parseMessage({
      text: "Bancolombia: Pagaste $2.132.121 a CREDITO HIPOTECARIO desde tu producto *1234 el 05/09/2026.",
    });
    expect(r).toMatchObject({ amount: 2132121, type: "expense", merchant: "CREDITO HIPOTECARIO", date: "2026-09-05" });
  });

  test("retiro en cajero", () => {
    const r = p.parseMessage({ text: "Bancolombia le informa Retiro por $200.000 en CAJERO LA 70. 10:31 12/09/2026 T.Deb *1234." });
    expect(r).toMatchObject({ amount: 200000, type: "expense", merchant: "CAJERO LA 70" });
  });

  test("Nequi enviaste", () => {
    const r = p.parseMessage({ from: "Nequi <notificaciones@nequi.com.co>", subject: "Envío exitoso", text: "Enviaste $50.000 a JUAN PEREZ." , date: "2026-09-10 08:00:00" });
    expect(r).toMatchObject({ amount: 50000, type: "expense", merchant: "JUAN PEREZ", bank: "Nequi", date: "2026-09-10" });
  });

  test("sin importe no inventa", () => {
    expect(p.parseMessage({ text: "Actualizamos nuestros términos y condiciones" })).toBeNull();
  });
});

describe("categorize y matchAccount", () => {
  const cats = [
    { id: "m", kind: "expense", keywords: "exito, carulla, d1, ara" },
    { id: "r", kind: "expense", keywords: "rappi, restaurante" },
    { id: "s", kind: "income", keywords: "nomina, acme" },
  ];

  test("gana la palabra clave", () => {
    expect(p.categorize("EXITO LAURELES", "expense", cats).id).toBe("m");
    expect(p.categorize("RAPPI COLOMBIA", "expense", cats).id).toBe("r");
    expect(p.categorize("ACME SAS", "income", cats).id).toBe("s");
    expect(p.categorize("OTRA COSA", "expense", cats)).toBeNull();
  });

  test("cuenta por terminación y luego por banco", () => {
    const accounts = [
      { id: "a", match_keys: "1234, bancolombia" },
      { id: "b", match_keys: "nequi" },
    ];
    expect(p.matchAccount({ last4: ["1234"], bank: "Bancolombia" }, accounts).account.id).toBe("a");
    expect(p.matchAccount({ last4: [], bank: "Nequi" }, accounts).account.id).toBe("b");
    expect(p.matchAccount({ last4: ["9999"], bank: null }, accounts)).toBeNull();
  });

  test("pista de texto: una llave propia en el mensaje", () => {
    const text =
      "Bancolombia: WILLIAM, transferiste $150,000.00 a la llave @wua109 desde tu cuenta *6855 a William Felipe Uribe Aristizabal el 20/09/26 a las 13:33.";
    const accounts = [
      { id: "a", match_keys: "6855, @otra, bancolombia" },
      { id: "b", match_keys: "@WUA109, Bancolombia" },
      { id: "c", match_keys: "nequi, 3001234567" },
    ];
    expect(p.matchKeyInText(text, accounts, "a").account.id).toBe("b");
    // El origen no cuenta, y ni el banco ni las terminaciones son pistas de texto.
    expect(p.matchKeyInText(text, accounts, "b")).toBeNull();
    expect(p.matchKeyInText("Enviaste $50.000 al 3001234567", accounts, "a").account.id).toBe("c");
  });
});

describe("gmail", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const g = require("../pocketbase/pb_hooks/lib/gmail.js");
  test("base64url con tildes y símbolos", () => {
    const text = "Compraste $45.900 en ÉXITO — año ñandú";
    const b64 = Buffer.from(text, "utf8").toString("base64url");
    expect(g.decodeBase64Url(b64)).toBe(text);
  });
  test("htmlToText aplana el correo", () => {
    expect(p.htmlToText("<p>Compra por &#36;45.900</p><br>en <b>EXITO</b>&nbsp;hoy")).toBe("Compra por $45.900\nen EXITO hoy");
  });
});
