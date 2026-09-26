import { describe, expect, test } from "bun:test";

// inbox.js carga parsers.js y rules.js con la ruta de los hooks, como en PocketBase.
(globalThis as Record<string, unknown>).__hooks = `${import.meta.dir}/../pocketbase/pb_hooks`;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const inbox = require("../pocketbase/pb_hooks/lib/inbox.js");

const accounts = [
  { id: "a1", name: "Banco Principal", senders: ["bancoprincipal"] },
  { id: "a2", name: "Tarjeta Oro", senders: ["bancoprincipal"] },
  { id: "a3", name: "Billetera", senders: ["billetera.co"] },
];
const categories = [
  { id: "c-mercado", name: "Mercado", kind: "expense", keywords: "panaderia" },
  { id: "c-otros", name: "Otros gastos", kind: "expense", keywords: "" },
];
const mail = {
  id: "m1",
  from: "Banco Principal <alertas@bancoprincipal.com>",
  subject: "Alerta",
  date: "2026-09-25",
  text: "Banco Principal: Compraste $20.000 en PANADERIA LA ESQUINA con tu T.Deb *1234, el 24/09/2026 a las 08:10.",
};

describe("suggest", () => {
  test("sin regla: lo leído, la cuenta por remitente (la primera) y el patrón", () => {
    const s = inbox.suggest(mail, { accounts, categories, rules: [] });
    expect(s.rule).toBeNull();
    expect(s.tx).toMatchObject({ type: "expense", amount: 20000, date: "2026-09-24", account: "a1", category: "c-mercado", rule: "" });
    expect(s.pattern).toEqual({ sender: "alertas@bancoprincipal.com", match: "PANADERIA LA ESQUINA" });
  });

  test("remitente desconocido: sin cuenta", () => {
    const s = inbox.suggest({ ...mail, from: "otro@ejemplo.com" }, { accounts, categories, rules: [] });
    expect(s.tx.account).toBe("");
    expect(inbox.missing(s.tx)).toBe("la cuenta");
  });

  test("sin valor en el texto: queda para decidir, con el asunto de descripción", () => {
    const s = inbox.suggest({ ...mail, subject: "Tu extracto", text: "Ya está disponible tu extracto." }, { accounts, categories, rules: [] });
    expect(s.parsed).toBeNull();
    expect(s.tx).toMatchObject({ amount: 0, description: "Tu extracto" });
    expect(inbox.missing(s.tx)).toBe("el valor");
  });

  test("con regla: la plantilla manda, la fecha es la del correo", () => {
    const regla = { id: "r1", name: "Pan", sender: "bancoprincipal", match: "panaderia", account: "a2", category: "c-otros", description: "Pan {mes}", tags: ["casa"] };
    const s = inbox.suggest(mail, { accounts, categories, rules: [regla] });
    expect(s.rule.id).toBe("r1");
    expect(s.tx).toMatchObject({ account: "a2", category: "c-otros", description: "Pan septiembre", date: "2026-09-24", amount: 20000, rule: "r1" });
    expect(s.tx.tags).toContain("casa");
    expect(inbox.missing(s.tx)).toBe("");
  });

  test("una regla de otro remitente no aplica", () => {
    const regla = { id: "r1", sender: "billetera.co", match: "panaderia", account: "a3" };
    expect(inbox.suggest(mail, { accounts, categories, rules: [regla] }).rule).toBeNull();
  });
});

describe("address", () => {
  test.each([
    ["Banco <Alertas@Banco.com>", "alertas@banco.com"],
    ["alertas@banco.com", "alertas@banco.com"],
    ["", ""],
  ])("%s", (from, want) => expect(inbox.address(from)).toBe(want));
});

describe("accountBySender: el remitente de la cuenta basta con que esté contenido", () => {
  const nu = { id: "nu", name: "Nu", senders: ["nu@"] };
  const nuDomain = { id: "nu2", name: "Nu 2", senders: ["nu.com"] };
  test.each([
    ["nu@nu.com.co", [nu], "nu"],
    ["Nu Colombia <nu@nu.com.co>", [nu], "nu"],
    ["nu@nu.com.co", [nuDomain], "nu2"],
    ["NU <Nu@NU.com.co>", [nuDomain], "nu2"],
    ["alertas@bancoprincipal.com", [nu, nuDomain], null],
  ])("%s", (from, accounts, want) => expect(inbox.accountBySender(from, accounts)?.id ?? null).toBe(want));
});

describe("queryFor: fragmentos de remitente en la búsqueda de Gmail", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const gmail = require("../pocketbase/pb_hooks/lib/gmail.js");
  test("sin arrobas ni puntos en las puntas", () => {
    expect(gmail.queryFor(["nu@", "@nu.com", "alertas@banco.com", "Banco Principal"])).toBe("from:(nu OR nu.com OR alertas@banco.com OR bancoprincipal)");
  });
});
