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

  test("con remitente, solo los correos de ese remitente", () => {
    const banco = { ...admin, sender: "alertas@bancoprincipal.com" };
    expect(r.find("GOU PAYMENTS", [banco], 0, "Banco Principal <alertas@bancoprincipal.com>")?.id).toBe("r1");
    expect(r.find("GOU PAYMENTS", [banco], 0, "otro@ejemplo.com")).toBeNull();
    expect(r.find("GOU PAYMENTS", [banco])).toBeNull();
  });

  test("solo remitente: todo lo de ese banco, pero pierde con una que tenga texto", () => {
    const todo = { id: "todo", sender: "bancoprincipal", match: "" };
    const texto = { ...admin, id: "texto" };
    const from = "alertas@bancoprincipal.com";
    expect(r.find("Compraste $10.000 en PANADERIA", [todo], 0, from)?.id).toBe("todo");
    expect(r.find("GOU PAYMENTS", [todo, texto], 0, from)?.id).toBe("texto");
  });

  test("sin remitente ni texto no coincide con nada", () => {
    expect(r.find("GOU PAYMENTS", [{ id: "vacia", match: "", sender: "" }], 0, "x")).toBeNull();
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

  test("categoría, etiquetas y descripción; las notas no cambian", () => {
    expect(r.apply(admin, tx)).toMatchObject({
      category: "cat-admin",
      tags: ["bancolombia", "administración", "casa"],
      description: "Administración septiembre",
      notes: "",
    });
  });

  test("aplicarla dos veces no cambia nada más", () => {
    const once = r.apply(admin, tx);
    expect(r.apply(admin, { ...tx, ...once })).toEqual(once);
  });

  test("con la cuenta sin reconocer sigue por revisar", () => {
    expect(r.apply(admin, { ...tx, accountUnknown: true }).tags).toContain("revisar");
  });

  test("una transferencia no toma categoría", () => {
    expect(r.apply(admin, { ...tx, type: "transfer", category: "" }).category).toBe("");
  });

  describe("plantilla", () => {
    const base = { ...tx, account: "a1", to_account: "", amount: 45900 };

    test("sin valor fijo toma el del correo; con valor fijo, ese", () => {
      expect(r.apply(admin, base).amount).toBe(45900);
      expect(r.apply({ ...admin, set_amount: 50000 }, base).amount).toBe(50000);
    });

    test("tipo y cuenta de la regla", () => {
      const ingreso = { id: "i", type: "income", account: "a2", category: "cat-sueldo" };
      expect(r.apply(ingreso, base)).toMatchObject({ type: "income", account: "a2", category: "cat-sueldo" });
    });

    test("al cambiar de tipo sin categoría, la del otro tipo se quita", () => {
      expect(r.apply({ id: "i", type: "income" }, base).category).toBe("");
    });

    test("transferencia entre cuentas propias: destino y sin categoría", () => {
      const pago = { id: "t", type: "transfer", account: "a1", to_account: "a2", category: "cat-admin" };
      expect(r.apply(pago, base)).toMatchObject({ type: "transfer", account: "a1", to_account: "a2", category: "" });
      expect(r.apply(pago, base).tags).not.toContain("revisar");
    });

    test("transferencia sin destino, o a la misma cuenta, no cambia el tipo", () => {
      expect(r.apply({ id: "t", type: "transfer" }, base)).toMatchObject({ type: "expense", to_account: "" });
      expect(r.apply({ id: "t", type: "transfer", to_account: "a1" }, base)).toMatchObject({ type: "expense", to_account: "" });
    });

    test("las notas de la regla se agregan una vez", () => {
      const conNotas = { ...admin, notes: "Pago mensual" };
      const once = r.apply(conNotas, base);
      expect(once.notes).toBe("Pago mensual");
      expect(r.apply(conNotas, { ...base, ...once }).notes).toBe("Pago mensual");
    });
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
    expect(app.saved[0].notes).toBe(notes);
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

  test("a lo anotado a mano no le cambia el tipo, la cuenta ni el valor", () => {
    const fija = { ...admin, type: "income", account: "a2", set_amount: 1 };
    const saved: Record<string, string>[] = [];
    const rec = (id: string, f: Record<string, unknown>) => ({
      id,
      getString: (k: string) => (typeof f[k] === "object" ? JSON.stringify(f[k]) : String(f[k] ?? "")),
      getFloat: (k: string) => Number(f[k]) || 0,
      getBool: (k: string) => !!f[k],
      set: (k: string, v: unknown) => (f[k] = v),
    });
    const tx = (source: string) =>
      rec(source, { type: "expense", date: "2026-09-20 12:00:00.000Z", account: "a1", amount: 412000, description: "GOU PAYMENTS", source, external_id: source === "manual" ? "" : "m1", tags: [] });
    const app = {
      findRecordsByFilter: (col: string) => (col === "rules" ? [rec("r1", fija)] : [tx("manual"), tx("gmail")]),
      save: (r: { id: string; getString: (k: string) => string }) =>
        saved.push({ id: r.id, type: r.getString("type"), account: r.getString("account"), amount: r.getString("amount") }),
    };
    expect(r.applyExisting(app, "u", "")).toBe(2);
    expect(saved).toEqual([
      { id: "manual", type: "expense", account: "a1", amount: "412000" },
      { id: "gmail", type: "income", account: "a2", amount: "1" },
    ]);
  });
});

describe("accountsBySender (app)", () => {
  test("todas las cuentas cuyo remitente aparece en el De:, sin tildes ni mayúsculas", async () => {
    const { accountsBySender } = await import("../src/lib/rules");
    const accounts = [
      { id: "a1", senders: ["alertas@bancoprincipal.com"] },
      { id: "a2", senders: ["BancoPrincipal.com"] },
      { id: "a3", senders: ["otrobanco.com"] },
      { id: "a4", senders: null },
    ];
    const ids = (from: string) => accountsBySender(from, accounts).map((a) => a.id);
    expect(ids("Banco Principal <alertas@bancoprincipal.com>")).toEqual(["a1", "a2"]);
    expect(ids("avisos@otrobanco.com")).toEqual(["a3"]);
    expect(ids("")).toEqual([]);
  });
});

describe("accountsBySender (app): fragmentos", () => {
  test("«nu@» y «nu.com» coinciden con nu@nu.com.co", async () => {
    const { accountsBySender } = await import("../src/lib/rules");
    const accounts = [
      { id: "a", senders: ["nu@"] },
      { id: "b", senders: ["nu.com"] },
    ];
    expect(accountsBySender("Nu <nu@nu.com.co>", accounts).map((a) => a.id)).toEqual(["a", "b"]);
  });
});
