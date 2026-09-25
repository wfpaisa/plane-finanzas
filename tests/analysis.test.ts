import { describe, expect, test } from "bun:test";

import { band, change, cumulative, flowLayout, insights, previousPeriod, topN } from "../src/lib/analysis";

describe("previousPeriod", () => {
  test("semanal: el mes anterior, cortado al mismo día si el mes va en curso", () => {
    const p = previousPeriod("week", "2026-09", 2026, "2026-09-25")!;
    expect(p.full).toEqual(["2026-08-01", "2026-09-01"]);
    expect(p.same).toEqual(["2026-08-01", "2026-08-26"]);
    expect(p.ongoing).toBe(true);
  });

  test("semanal: un mes cerrado se compara entero", () => {
    const p = previousPeriod("week", "2026-06", 2026, "2026-09-25")!;
    expect(p.same).toEqual(["2026-05-01", "2026-06-01"]);
    expect(p.ongoing).toBe(false);
  });

  test("semanal: el 31 contra un mes de 30 días llega hasta el último", () => {
    const p = previousPeriod("week", "2026-05", 2026, "2026-05-31")!;
    expect(p.same).toEqual(["2026-04-01", "2026-05-01"]);
  });

  test("mensual: el año anterior hasta la misma fecha", () => {
    const p = previousPeriod("month", "2026-09", 2026, "2026-09-25")!;
    expect(p.full).toEqual(["2025-01-01", "2026-01-01"]);
    expect(p.same).toEqual(["2025-01-01", "2025-09-26"]);
    expect(p.short).toBe("2025");
  });

  test("mensual: un 29 de febrero se compara hasta el 28", () => {
    expect(previousPeriod("month", "2028-02", 2028, "2028-02-29")!.same).toEqual(["2027-01-01", "2027-03-01"]);
  });

  test("anual: no hay periodo anterior", () => {
    expect(previousPeriod("year", "2026-09", 2026, "2026-09-25")).toBeNull();
  });
});

test("change", () => {
  expect(change(120, 100)).toBe(20);
  expect(change(50, 0)).toBeNull();
});

test("cumulative suma por casilla y arrastra", () => {
  const txs = [
    { type: "expense" as const, date: "2026-09-01", amount: 10 },
    { type: "expense" as const, date: "2026-09-03", amount: 5 },
    { type: "income" as const, date: "2026-09-02", amount: 99 },
  ];
  expect(cumulative(txs, "expense", 4, (d) => Number(d.slice(8, 10)) - 1)).toEqual([10, 10, 15, 15]);
});

describe("insights", () => {
  const base = {
    kind: "expense" as const,
    income: 1000,
    expense: 600,
    prev: { income: 1000, expense: 500, name: "el mes pasado", ongoing: true },
    cats: [
      { name: "Arriendo", total: 400 },
      { name: "Mercado", total: 200 },
    ],
    prevCats: new Map([
      ["Arriendo", 400],
      ["Mercado", 100],
    ]),
  };

  test("cuenta lo que quedó, el cambio, la mayor y la que más subió", () => {
    const out = insights(base);
    expect(out.map((x) => x.tone)).toEqual(["good", "bad", "bad", "bad"]);
    expect(out[0].text).toContain("40%");
    expect(out[1].text).toContain("20% más que a esta altura del mes pasado");
    expect(out[2].text).toBe("Arriendo se llevó 67% de tus gastos.");
    expect(out[3].text).toContain("Mercado");
    expect(out[3].text).toContain("frente al mes pasado");
  });

  test("sin periodo anterior no compara", () => {
    expect(insights({ ...base, prev: null })).toHaveLength(2);
  });

  test("gastar más de lo que entró es malo", () => {
    expect(insights({ ...base, expense: 1500, prev: null })[0]).toMatchObject({ tone: "bad" });
  });
});

describe("flow", () => {
  test("topN junta el resto", () => {
    const items = [5, 4, 3, 2, 1].map((v) => ({ id: String(v), label: String(v), value: v, tint: "" }));
    const out = topN(items, 3, { id: "rest", label: "Otras", tint: "" });
    expect(out.map((x) => x.value)).toEqual([5, 4, 6]);
  });

  test("flowLayout reparte el alto y el centro es proporcional", () => {
    const f = flowLayout(
      [{ id: "a", label: "A", value: 100, tint: "" }],
      [
        { id: "b", label: "B", value: 75, tint: "" },
        { id: "c", label: "C", value: 25, tint: "" },
      ],
      100,
      10,
      20,
    );
    expect(f.total).toBe(100);
    expect(f.left[0]).toMatchObject({ y: 0, h: 100, my: 0, mh: 100 });
    expect(f.right[0].h).toBeCloseTo(20 + 50 * 0.75);
    expect(f.right[1].y).toBeCloseTo(f.right[0].h + 10);
    expect(f.right[1]).toMatchObject({ my: 75, mh: 25 });
  });

  test("band cierra el camino", () => {
    expect(band(0, 0, 10, 100, 20, 5)).toBe("M0,0 C50,0 50,20 100,20 L100,25 C50,25 50,10 0,10 Z");
  });
});
