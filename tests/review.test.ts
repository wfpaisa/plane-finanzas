import { describe, expect, test } from "bun:test";

// review.js carga parsers, rules e inbox con la ruta de los hooks, como en PocketBase.
(globalThis as Record<string, unknown>).__hooks = `${import.meta.dir}/../pocketbase/pb_hooks`;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const review = require("../pocketbase/pb_hooks/lib/review.js");

const accounts = [
  { id: "a1", name: "Banco Principal", senders: ["bancoprincipal"] },
  { id: "a3", name: "Billetera", senders: ["billetera.co"] },
];
const allAccounts = {
  a1: { id: "a1", name: "Banco Principal", archived: false },
  a2: { id: "a2", name: "Tarjeta Vieja", archived: true },
  a3: { id: "a3", name: "Billetera", archived: false },
};
const categories = [
  { id: "c-mercado", name: "Mercado", kind: "expense", keywords: "panaderia", keys: ["panaderia"] },
  { id: "c-sueldo", name: "Sueldo", kind: "income", keywords: "", keys: [] },
  { id: "c-otros", name: "Otros gastos", kind: "expense", keywords: "", keys: [] },
];
const categoriesById = Object.fromEntries(categories.map((c) => [c.id, c]));

const compra = {
  id: "m1",
  from: "Banco Principal <alertas@bancoprincipal.com>",
  subject: "Alerta",
  date: "2026-09-25",
  labels: ["TRASH"],
  text: "Banco Principal: Compraste $20.000 en PANADERIA LA ESQUINA con tu T.Deb *1234, el 24/09/2026 a las 08:10.",
};
const promo = { id: "m2", from: "Banco Principal <promos@bancoprincipal.com>", subject: "Aprovecha", date: "2026-09-25", labels: ["INBOX"], text: "Nuevas ofertas para ti." };

type Rule = Record<string, unknown>;
const ctx = (rules: Rule[], extra: Record<string, unknown> = {}) => ({
  accounts,
  categories,
  allAccounts,
  categoriesById,
  rules,
  readSenders: ["bancoprincipal", "billetera.co"],
  state: () => ({ status: "nuevo" }),
  ...extra,
});

const pan = { id: "r1", name: "Pan", sender: "bancoprincipal", match: "panaderia", type: "expense", account: "a1", category: "c-mercado" };

describe("inspect: correos", () => {
  test("regla que registra, con nombres y el correo en la papelera", () => {
    const r = review.inspect([compra], ctx([pan]));
    const m = r.messages[0];
    expect(m).toMatchObject({ action: "registrar", trash: true, rule: { id: "r1", name: "Pan" }, problems: [] });
    expect(m.tx).toMatchObject({ amount: 20000, account_name: "Banco Principal", category_name: "Mercado" });
    expect(r.summary).toMatchObject({ read: 1, register: 1, withoutRule: 0, withProblems: 0 });
    expect(r.rules[0]).toMatchObject({ matches: 1, ok: true, samples: ["m1"] });
  });

  test("sin regla: queda pendiente y cuenta como sin regla", () => {
    const r = review.inspect([promo], ctx([pan]));
    expect(r.messages[0]).toMatchObject({ action: "pendiente", rule: null });
    expect(r.summary.withoutRule).toBe(1);
  });

  test("descartar", () => {
    const r = review.inspect([promo], ctx([{ id: "r2", name: "Promos", sender: "promos@bancoprincipal", type: "discard" }]));
    expect(r.messages[0].action).toBe("descartar");
  });

  test("empate: avisa cuál gana", () => {
    const otra = { ...pan, id: "r9", name: "Pan copia", category: "c-otros" };
    const r = review.inspect([compra], ctx([pan, otra]));
    expect(r.messages[0].rule.id).toBe("r1");
    expect(r.messages[0].also).toEqual([{ id: "r9", name: "Pan copia" }]);
    expect(r.messages[0].problems.join(" ")).toContain("misma precisión");
    const copia = r.rules.find((x: Rule) => x.id === "r9");
    expect(copia.problems.join(" ")).toContain("siempre gana otra regla");
    expect(copia.problems.join(" ")).toContain("Busca lo mismo que «Pan»");
  });

  test("le falta el valor: queda pendiente con la razón", () => {
    const r = review.inspect([promo], ctx([{ id: "r3", name: "Todo el banco", sender: "bancoprincipal", type: "expense", account: "a1" }]));
    expect(r.messages[0].action).toBe("pendiente");
    expect(r.messages[0].problems[0]).toContain("falta el valor");
    expect(r.rules[0].pending).toBe(1);
  });

  test("lo registrado difiere de lo que haría la regla hoy", () => {
    const state = () => ({ status: "procesado", transaction: "t1", saved: { type: "expense", account: "a1", to_account: "", category: "c-otros", amount: 20000, description: "PANADERIA LA ESQUINA" } });
    const r = review.inspect([compra], ctx([pan], { state }));
    expect(r.messages[0].differences.map((d: Rule) => d.text)).toEqual(["categoría: Otros gastos → Mercado"]);
    expect(r.summary.differ).toBe(1);
  });

  test("onSync: la próxima lectura salta lo que ya tiene movimiento, aunque sea de otra fuente", () => {
    const saved = { type: "expense", account: "a1", to_account: "", category: "c-mercado", amount: 20000, description: "PANADERIA LA ESQUINA" };
    const ya = review.inspect([compra], ctx([pan], { state: () => ({ status: "registrado", transaction: "t-csv", saved }) }));
    expect(ya.messages[0]).toMatchObject({ action: "registrar", onSync: "omitir" });
    expect(review.inspect([compra], ctx([pan])).messages[0].onSync).toBe("registrar");
    const lejos = { ...compra, from: "Alertas <avisos@an.notificacionesbancoprincipal.com>" };
    expect(review.inspect([lejos], ctx([{ ...pan, sender: "" }])).messages[0].onSync).toBe("no_lo_trae");
  });

  test("descartado antes que hoy se registraría", () => {
    const r = review.inspect([compra], ctx([pan], { state: () => ({ status: "descartado" }) }));
    expect(r.messages[0].problems.join(" ")).toContain("Se descartó antes");
  });
});

describe("gmailReads", () => {
  test("palabras completas del nombre y la dirección, como Gmail", () => {
    expect(review.gmailReads("Alertas <avisos@an.notificacionesbancoprincipal.com>", ["bancoprincipal"])).toBe(false);
    expect(review.gmailReads("Alertas <avisos@an.notificacionesbancoprincipal.com>", ["notificacionesbancoprincipal.com"])).toBe(true);
    expect(review.gmailReads("Banco Principal <avisos@otro.com>", ["banco principal"])).toBe(true);
    expect(review.gmailReads("<alertas@bancoprincipal.com.co>", ["bancoprincipal"])).toBe(true);
  });

  test("un correo que la regla reconoce pero la lectura automática no trae", () => {
    const lejos = { ...compra, from: "Alertas <avisos@an.notificacionesbancoprincipal.com>" };
    const r = review.inspect([lejos], ctx([{ ...pan, sender: "" }]));
    expect(r.messages[0].autoRead).toBe(false);
    expect(r.messages[0].problems.join(" ")).toContain("agrega «an.notificacionesbancoprincipal.com»");
  });
});

describe("inspect: reglas", () => {
  const problems = (rule: Rule) => review.inspect([], ctx([rule])).rules[0].problems.join(" | ");

  test("una regla bien hecha no tiene problemas", () => {
    expect(problems(pan)).toBe("");
  });

  test("cuenta archivada o borrada, categoría de otro tipo", () => {
    expect(problems({ ...pan, account: "a2" })).toContain("está archivada");
    expect(problems({ ...pan, account: "zz" })).toContain("ya no existe");
    expect(problems({ ...pan, category: "c-sueldo" })).toContain("es de ingreso");
  });

  test("transferencia sin destino o a la misma cuenta", () => {
    expect(problems({ ...pan, type: "transfer", category: "" })).toContain("sin cuenta de destino");
    expect(problems({ ...pan, type: "transfer", category: "", to_account: "a1" })).toContain("son la misma");
  });

  test("remitente que Gmail no lee, sin remitente ni texto, marca inventada, en pausa", () => {
    expect(problems({ ...pan, sender: "otrobanco" })).toContain("Gmail no lea correos de «otrobanco»");
    // Gmail busca palabras completas: «bancoprincipal» no trae «notificacionesbancoprincipal».
    expect(problems({ ...pan, sender: "notificacionesbancoprincipal.com" })).toContain("Gmail no lea correos");
    expect(problems({ ...pan, sender: "alertas@bancoprincipal.com" })).toBe("");
    expect(problems({ ...pan, sender: "", match: "" })).toContain("nunca coincide");
    expect(problems({ ...pan, description: "Pan {dia}" })).toContain("{dia}");
    expect(problems({ ...pan, paused: true })).toContain("en pausa");
  });

  test("regla que no coincide con ningún correo revisado", () => {
    const r = review.inspect([promo], ctx([pan]));
    expect(r.rules[0].problems.join(" ")).toContain("No coincidió con ninguno de los 1 correos");
  });

  test("una regla de prueba reemplaza a la guardada con el mismo id", () => {
    const d = review.draftRule({ id: "r1", name: "Pan", sender: "bancoprincipal", match: "panaderia", type: "expense", account: "a1", category: "c-otros" });
    const r = review.inspect([compra], ctx([d]));
    expect(r.messages[0].tx.category_name).toBe("Otros gastos");
  });
});
