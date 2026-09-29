import { describe, expect, test } from "bun:test";

import { findMerchant, renderDescription } from "../src/lib/rules";

// merchants.js e inbox.js cargan sus vecinos con la ruta de los hooks, como en PocketBase.
(globalThis as Record<string, unknown>).__hooks = `${import.meta.dir}/../pocketbase/pb_hooks`;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const m = require("../pocketbase/pb_hooks/lib/merchants.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const inbox = require("../pocketbase/pb_hooks/lib/inbox.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const review = require("../pocketbase/pb_hooks/lib/review.js");

describe("filtros", () => {
  test("capitalizar, sin_ciudad y primera_palabra", () => {
    expect(m.filter("IKEA ENVIGADO", ["capitalizar"])).toBe("Ikea Envigado");
    expect(m.filter("IKEA ENVIGADO", ["sin_ciudad", "capitalizar"])).toBe("Ikea");
    expect(m.filter("DOLLARCITY SABANETA", ["primera_palabra", "capitalizar"])).toBe("Dollarcity");
    expect(m.filter("TIENDA DE LA ESQUINA BOGOTA D.C.", ["sin_ciudad", "capitalizar"])).toBe("Tienda de la Esquina");
    expect(m.filter("PANADERIA CENTRAL SANTA MARTA CO", ["sin_ciudad"])).toBe("PANADERIA CENTRAL");
  });

  test("sin_ciudad nunca deja el texto vacío", () => {
    expect(m.withoutCity("MEDELLIN")).toBe("MEDELLIN");
    expect(m.withoutCity("CALI CO")).toBe("CALI");
  });
});

describe("render", () => {
  test("{comercio} con alias, sin alias y con filtros; {original} queda como se leyó", () => {
    expect(m.render("{comercio}", "2026-09-20", { original: "IKEA ENVIGADO", alias: "Ikea" })).toBe("Ikea");
    expect(m.render("{comercio}", "2026-09-20", { original: "IKEA ENVIGADO" })).toBe("IKEA ENVIGADO");
    expect(m.render("{ comercio | sin_ciudad | capitalizar }", "2026-09-20", { original: "IKEA ENVIGADO" })).toBe("Ikea");
    expect(m.render("{original} ({mes} {año})", "2026-09-20", { original: "IKEA ENVIGADO", alias: "Ikea" })).toBe("IKEA ENVIGADO (septiembre 2026)");
    expect(m.render("Compra {nada}", "2026-09-20", {})).toBe("Compra {nada}");
  });

  test("el nombre del alias no pasa por los filtros; el comercio leído sí", () => {
    const t = "{comercio|sin_ciudad|capitalizar}";
    expect(m.render(t, "2026-09-20", { original: "EPM MEDELLIN", comercio: "EPM MEDELLIN", alias: "EPM" })).toBe("EPM");
    expect(m.render(t, "2026-09-20", { original: "KFC ENVIGADO", comercio: "KFC ENVIGADO" })).toBe("Kfc");
    // A {original} sí se le aplican: es el texto del correo.
    expect(m.render("{original|capitalizar}", "2026-09-20", { original: "EPM MEDELLIN", alias: "EPM" })).toBe("Epm Medellin");
  });

  test("la vista previa del formulario da lo mismo que el servidor", () => {
    const cases: [string, string, string, string, string][] = [
      ["{comercio|sin_ciudad|capitalizar}", "2026-09-20", "IKEA ENVIGADO", "IKEA ENVIGADO", ""],
      ["{comercio|sin_ciudad|capitalizar}", "2026-09-20", "EPM MEDELLIN", "EPM MEDELLIN", "EPM"],
      ["{comercio}", "2026-09-20", "IKEA ENVIGADO", "", "Ikea"],
      ["Mercado {mes} · {comercio|primera_palabra|minusculas}", "2026-01-05", "DOLLARCITY SABANETA", "", ""],
      ["{original|mayusculas} {año}", "2026-03-01", "Tienda Demo", "", ""],
      ["{comercio|no_existe}", "2026-03-01", "TIENDA DEMO CALI", "", ""],
    ];
    for (const [t, d, o, c, a] of cases) expect(renderDescription(t, d, o, c, a)).toBe(m.render(t, d, { original: o, comercio: c, alias: a }));
  });
});

describe("find", () => {
  const list = [
    { id: "m1", match: "ikea", name: "Ikea", category: "" },
    { id: "m2", match: "ikea food, ikea restaurante", name: "Ikea Restaurante", category: "c-rest" },
  ];

  test("gana el de texto más largo; el cliente coincide", () => {
    expect(m.find("IKEA ENVIGADO", list).id).toBe("m1");
    expect(m.find("IKEA FOOD ENVIGADO", list).id).toBe("m2");
    expect(m.find("TIENDA DEMO", list)).toBeNull();
    expect(findMerchant("IKEA FOOD ENVIGADO", list)?.id).toBe("m2");
  });
});

describe("en la bandeja", () => {
  const accounts = [{ id: "a1", name: "Banco Principal", senders: ["bancoprincipal"] }];
  const categories = [
    { id: "c-mercado", name: "Mercado", kind: "expense", keywords: "ikea", keys: ["ikea"] },
    { id: "c-hogar", name: "Hogar", kind: "expense", keywords: "", keys: [] },
    { id: "c-otros", name: "Otros gastos", kind: "expense", keywords: "", keys: [] },
  ];
  const merchants = [{ id: "m1", match: "ikea", name: "Ikea", category: "c-hogar" }];
  const mail = {
    id: "g1",
    from: "Banco Principal <alertas@bancoprincipal.com>",
    subject: "Alerta",
    date: "2026-09-25",
    text: "Banco Principal: Compraste $80.000 en IKEA ENVIGADO con tu T.Cred *1234, el 24/09/2026 a las 18:10.",
  };

  test("sin regla: el alias pone el nombre y su categoría gana a las palabras clave", () => {
    const s = inbox.suggest(mail, { accounts, categories, merchants, rules: [] });
    expect(s.tx).toMatchObject({ description: "Ikea", category: "c-hogar", original: "IKEA ENVIGADO" });
    expect(s.merchant).toEqual({ text: "IKEA ENVIGADO", alias: { id: "m1", name: "Ikea", match: "ikea", category: "c-hogar" } });
  });

  test("regla general con {comercio}; {original} sigue siendo lo del correo", () => {
    const compras = { id: "r1", name: "Compras", match: "t.cred *1234", type: "expense", account: "a1", description: "{comercio} · {original}" };
    const s = inbox.suggest(mail, { accounts, categories, merchants, rules: [compras] });
    expect(s.tx).toMatchObject({ description: "Ikea · IKEA ENVIGADO", category: "c-hogar", rule: "r1" });
  });

  test("regla con filtros y un alias en siglas: el alias queda tal cual", () => {
    const epm = { ...mail, text: "Banco Principal: Pagaste $95.000 en EPM MEDELLIN con tu T.Cred *1234, el 24/09/2026 a las 18:10." };
    const compras = { id: "r1", name: "Compras", match: "t.cred *1234", type: "expense", account: "a1", description: "{comercio|sin_ciudad|capitalizar}" };
    const s = inbox.suggest(epm, { accounts, categories, merchants: [{ id: "m9", match: "epm", name: "EPM", category: "" }], rules: [compras] });
    expect(s.tx.description).toBe("EPM");
  });

  test("sin alias, los filtros limpian el nombre", () => {
    const compras = { id: "r1", name: "Compras", match: "t.cred *1234", type: "expense", account: "a1", description: "{comercio|sin_ciudad|capitalizar}" };
    const s = inbox.suggest(mail, { accounts, categories, merchants: [], rules: [compras] });
    expect(s.tx.description).toBe("Ikea");
    expect(s.tx.category).toBe("c-mercado");
  });

  test("la revisión de reglas avisa de un filtro que no existe", () => {
    const ctx = {
      accounts,
      categories,
      merchants,
      allAccounts: { a1: { id: "a1", name: "Banco Principal", archived: false } },
      categoriesById: Object.fromEntries(categories.map((c) => [c.id, c])),
      rules: [{ id: "r1", name: "Compras", match: "t.cred", type: "expense", account: "a1", description: "{comercio|mayuscula}" }],
      readSenders: null,
      state: () => ({ status: "nuevo" }),
    };
    expect(review.inspect([], ctx).rules[0].problems.join(" ")).toContain("El filtro «mayuscula»");
  });
});
