import { describe, expect, test } from "bun:test";

// rules.js carga parsers.js con la ruta de los hooks, como en PocketBase.
(globalThis as Record<string, unknown>).__hooks = `${import.meta.dir}/../pocketbase/pb_hooks`;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const r = require("../pocketbase/pb_hooks/lib/rules.js");

const admin = {
  id: "r1",
  match: "gou payments, easpbv",
  category: "cat-admin",
  tags: ["administración", "Casa"],
  description: "Administración {mes}",
  to_notes: true,
};

describe("find", () => {
  test("sin importar mayúsculas ni tildes", () => {
    expect(r.find("GOU PAYMENTS S A EASPBV", [admin])?.id).toBe("r1");
    expect(r.find("gou payments", [admin])?.id).toBe("r1");
    expect(r.find("Pagó en EASPBV", [{ ...admin, match: "pagó en easpbv" }])?.id).toBe("r1");
    expect(r.find("EXITO LAURELES", [admin])).toBeNull();
  });

  test("gana el texto más largo", () => {
    const corta = { ...admin, id: "corta", match: "gou" };
    expect(r.find("GOU PAYMENTS S A", [corta, admin])?.id).toBe("r1");
  });

  test("con valor, solo si el movimiento trae ese valor", () => {
    const conValor = { ...admin, amount: 412000 };
    expect(r.find("GOU PAYMENTS", [conValor], 412000)?.id).toBe("r1");
    expect(r.find("GOU PAYMENTS", [conValor], 50000)).toBeNull();
    expect(r.find("GOU PAYMENTS", [conValor])).toBeNull();
  });

  test("la regla con valor gana sobre la que no lo tiene", () => {
    const larga = { ...admin, id: "sin-valor", match: "gou payments s a easpbv" };
    const conValor = { ...admin, id: "con-valor", match: "gou", amount: 412000 };
    expect(r.find("GOU PAYMENTS S A EASPBV", [larga, conValor], 412000)?.id).toBe("con-valor");
    expect(r.find("GOU PAYMENTS S A EASPBV", [larga, conValor], 99000)?.id).toBe("sin-valor");
  });

  test("una regla en pausa no cuenta", () => {
    expect(r.find("GOU PAYMENTS", [{ ...admin, paused: true }])).toBeNull();
  });
});

describe("render", () => {
  test("mes, año y el original", () => {
    expect(r.render("Administración {mes} {año}", "2026-09-20", "")).toBe("Administración septiembre 2026");
    expect(r.render("Pago: {original}", "2026-01-02", "GOU PAYMENTS")).toBe("Pago: GOU PAYMENTS");
  });
});

describe("apply", () => {
  const tx = {
    type: "expense",
    date: "2026-09-20",
    description: "GOU PAYMENTS S A EASPBV",
    notes: "",
    category: "cat-otros",
    tags: ["revisar", "bancolombia"],
  };

  test("categoría, etiquetas, descripción y el original a las notas", () => {
    expect(r.apply(admin, tx)).toEqual({
      category: "cat-admin",
      tags: ["bancolombia", "administración", "casa"],
      description: "Administración septiembre",
      notes: "GOU PAYMENTS S A EASPBV",
    });
  });

  test("aplicarla dos veces no cambia nada más", () => {
    const once = r.apply(admin, tx);
    expect(r.apply(admin, { ...tx, ...once })).toEqual(once);
  });

  test("sin pasar a notas, el original se pierde de la descripción pero no se copia", () => {
    expect(r.apply({ ...admin, to_notes: false }, tx).notes).toBe("");
  });

  test("con la cuenta sin reconocer sigue por revisar", () => {
    expect(r.apply(admin, { ...tx, accountUnknown: true }).tags).toContain("revisar");
  });

  test("una transferencia no toma categoría", () => {
    expect(r.apply(admin, { ...tx, type: "transfer", category: "" }).category).toBe("");
  });
});
