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

describe("applyExisting", () => {
  // Un `app` de mentira con lo que usa: la regla y un movimiento guardado.
  function fakeApp(tx: Record<string, unknown>) {
    const saved: Record<string, unknown>[] = [];
    const rec = (id: string, f: Record<string, unknown>) => ({
      id,
      getString: (k: string) => (typeof f[k] === "object" ? JSON.stringify(f[k]) : String(f[k] ?? "")),
      getFloat: (k: string) => Number(f[k]) || 0,
      getBool: (k: string) => !!f[k],
      set: (k: string, v: unknown) => (f[k] = v),
    });
    return {
      saved,
      findRecordsByFilter: (col: string) =>
        col === "rules" ? [rec("r1", { ...admin, match: admin.match, tags: admin.tags })] : [rec("t1", tx)],
      save: (r: { getString: (k: string) => string }) => saved.push({ notes: r.getString("notes"), description: r.getString("description") }),
    };
  }

  test("las notas largas no se cortan", () => {
    const notes = "x".repeat(3000);
    const app = fakeApp({ type: "expense", date: "2026-09-20 12:00:00.000Z", amount: 412000, description: "GOU PAYMENTS", notes, raw: "", category: "", tags: [] });
    expect(r.applyExisting(app, "u", "")).toBe(1);
    expect(app.saved[0].notes).toBe(`GOU PAYMENTS\n${notes}`);
    expect(app.saved[0].description).toBe("Administración septiembre");
  });

  test("lo que ya está como la regla lo deja no se vuelve a guardar", () => {
    const app = fakeApp({
      type: "expense",
      date: "2026-09-20 12:00:00.000Z",
      amount: 1,
      description: "Administración septiembre",
      notes: "GOU PAYMENTS",
      raw: "",
      category: "cat-admin",
      tags: ["administración", "casa"],
    });
    expect(r.applyExisting(app, "u", "")).toBe(0);
  });
});
