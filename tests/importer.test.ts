import { describe, expect, test } from "bun:test";

// importer.js carga parsers.js y rules.js con la ruta de los hooks, como en PocketBase.
(globalThis as Record<string, unknown>).__hooks = `${import.meta.dir}/../pocketbase/pb_hooks`;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const imp = require("../pocketbase/pb_hooks/lib/importer.js");

const ctx = {
  accounts: [
    { id: "a1", name: "Banco Principal", match_keys: "*1234,Bancolombia" },
    { id: "a2", name: "Tarjeta Oro", match_keys: "*5678" },
  ],
  categories: [],
  rules: [],
};

describe("plan", () => {
  test("pago de tarjeta propia: transferencia con el nombre de la tarjeta", () => {
    const r = imp.plan(
      { id: "m1", text: "Bancolombia: Pagaste $602,264 en la tarjeta de credito *5678 desde la cuenta *1234, el 25/09/2026 10:05." },
      ctx,
    );
    expect(r).toMatchObject({ type: "transfer", account: "a1", toAccount: "a2", description: "Pago Tarjeta Oro" });
  });
});
