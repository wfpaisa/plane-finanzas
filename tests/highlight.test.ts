import { describe, expect, test } from "bun:test";

import { highlight, highlightRich, linkify, parseRich } from "../src/lib/highlight";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const parsers = require("../pocketbase/pb_hooks/lib/parsers.js");

const text = "Banco Principal: Compraste $20.000 en PANADERÍA  LA ESQUINA con tu T.Deb *1234.";
const marked = (pieces: ReturnType<typeof highlight>) => pieces.filter((p) => p.mark).map((p) => [p.mark, p.text]);

describe("highlight", () => {
  test("valor, comercio y texto de la regla, sin tildes ni mayúsculas", () => {
    expect(marked(highlight(text, { amount: 20000, merchant: "PANADERÍA  LA ESQUINA", keys: "compraste, xyz" }))).toEqual([
      ["rule", "Compraste"],
      ["amount", "$20.000"],
      ["merchant", "PANADERÍA  LA ESQUINA"],
    ]);
  });

  test("la regla gana sobre el comercio cuando son el mismo texto", () => {
    expect(marked(highlight(text, { merchant: "PANADERIA LA ESQUINA", keys: "panaderia la esquina" }))).toEqual([["rule", "PANADERÍA  LA ESQUINA"]]);
  });

  test("otro valor no se marca, y el texto completo se conserva", () => {
    const pieces = highlight(text, { amount: 99 });
    expect(marked(pieces)).toEqual([]);
    expect(pieces.map((p) => p.text).join("")).toBe(text);
  });
});

describe("texto con formato", () => {
  const html =
    '<p>Hola <b>Ana</b>, compraste <strong>$20.000</strong> en PANADERIA</p><p>Ver <a href="https://banco.com/x?a=1&amp;b=2">tu cuenta</a> o <a href="javascript:alert(1)">esto</a></p><style>p{}</style>';
  const rich = parsers.htmlToRich(html);

  test("negritas y enlaces; un enlace que no es web se queda como texto", () => {
    expect(parseRich(rich)).toEqual([
      { text: "Hola " },
      { text: "Ana", bold: true },
      { text: ", compraste " },
      { text: "$20.000", bold: true },
      { text: " en PANADERIA\nVer " },
      { text: "tu cuenta", href: "https://banco.com/x?a=1&b=2" },
      { text: " o esto" },
    ]);
  });

  test("el HTML del correo no pasa: las etiquetas se van y los signos quedan como texto", () => {
    const pieces = parseRich(parsers.htmlToRich('<img src=x onerror="alert(1)">&lt;script&gt;hola'));
    expect(pieces).toEqual([{ text: "<script>hola" }]);
  });

  test("el resaltado se monta sobre el formato", () => {
    const pieces = highlightRich(rich, { amount: 20000, keys: "cuenta" });
    expect(pieces.find((p) => p.mark === "amount")).toEqual({ text: "$20.000", bold: true, mark: "amount" });
    expect(pieces.filter((p) => p.href).map((p) => [p.text, p.mark])).toEqual([
      ["tu ", undefined],
      ["cuenta", "rule"],
    ]);
    expect(pieces.map((p) => p.text).join("")).toBe(parseRich(rich).map((p) => p.text).join(""));
  });
});

describe("linkify", () => {
  test("las direcciones escritas se vuelven enlaces, sin el punto final", () => {
    const pieces = linkify(highlight("Entra a https://banco.com/ayuda. O a www.banco.com", {}));
    expect(pieces.filter((p) => p.href).map((p) => [p.text, p.href])).toEqual([
      ["https://banco.com/ayuda", "https://banco.com/ayuda"],
      ["www.banco.com", "https://www.banco.com"],
    ]);
  });
});
