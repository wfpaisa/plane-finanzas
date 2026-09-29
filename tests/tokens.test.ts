import { describe, expect, test } from "bun:test";

// tokens.js corre en PocketBase (goja); `denied` y `fromHeader` no tocan la
// base, así que se prueban tal cual.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const t = require("../pocketbase/pb_hooks/lib/tokens.js");

describe("fromHeader", () => {
  test("acepta el token con o sin Bearer", () => {
    expect(t.fromHeader("Bearer fz_abc")).toBe("fz_abc");
    expect(t.fromHeader("fz_abc")).toBe("fz_abc");
  });

  test("ignora las sesiones normales de PocketBase", () => {
    expect(t.fromHeader("eyJhbGciOi.xxx.yyy")).toBe("");
    expect(t.fromHeader("")).toBe("");
    expect(t.fromHeader(undefined)).toBe("");
  });
});

describe("denied", () => {
  const ok = (scope: string, method: string, path: string) => t.denied(scope, method, path) === "";

  test("lectura: consulta colecciones y rutas propias", () => {
    expect(ok("read", "GET", "/api/collections/inbox/records")).toBe(true);
    expect(ok("read", "GET", "/api/collections/rules/records/abc")).toBe(true);
    expect(ok("read", "GET", "/api/finanzas/guia")).toBe(true);
    expect(ok("read", "POST", "/api/finanzas/inbox/suggest")).toBe(true);
    expect(ok("read", "POST", "/api/finanzas/rules/check")).toBe(true);
    expect(ok("read", "GET", "/api/finanzas/gmail/messages")).toBe(true);
  });

  test("lectura: no cambia nada", () => {
    expect(ok("read", "POST", "/api/collections/categories/records")).toBe(false);
    expect(ok("read", "PATCH", "/api/collections/categories/records/abc")).toBe(false);
    expect(ok("read", "DELETE", "/api/collections/inbox/records/abc")).toBe(false);
    expect(ok("read", "POST", "/api/finanzas/inbox/rule")).toBe(false);
  });

  test("escritura: crea reglas y edita colecciones", () => {
    expect(ok("write", "POST", "/api/finanzas/inbox/rule")).toBe(true);
    expect(ok("write", "PATCH", "/api/collections/categories/records/abc")).toBe(true);
    expect(ok("write", "DELETE", "/api/collections/inbox/records/abc")).toBe(true);
    expect(ok("write", "GET", "/api/finanzas/backup")).toBe(true);
  });

  test("nadie toca el usuario, los tokens ni lo destructivo", () => {
    for (const [m, p] of [
      ["PATCH", "/api/collections/users/records/abc"],
      ["POST", "/api/collections/users/auth-refresh"],
      ["GET", "/api/collections/api_tokens/records"],
      ["POST", "/api/finanzas/tokens"],
      ["POST", "/api/finanzas/clean"],
      ["POST", "/api/finanzas/backup"],
      ["POST", "/api/finanzas/gmail/connect"],
      ["GET", "/api/finanzas/users/lookup"],
      ["GET", "/api/realtime"],
      ["POST", "/api/batch"],
      ["GET", "/api/collections/users/records"],
    ]) {
      expect(ok("write", m, p)).toBe(false);
    }
  });
});
