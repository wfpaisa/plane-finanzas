/**
 * Datos de ejemplo: importa el registro contable (`seed/registro-contable.csv`)
 * y le suma el plan mensual (sueldo, fijos y ahorros).
 *
 *   bun run seed -- --email yo@correo.com --password "clave-larga" [--name "Yo"] [--file otro.csv] [--url http://127.0.0.1:8093]
 *
 * Si el usuario no existe lo crea. Se puede correr varias veces: las filas
 * del CSV no se duplican y el plan solo se crea si todavía no hay fijos.
 */
import { readFileSync } from "node:fs";

import PocketBase from "pocketbase";

import { applyPlan, planFromCsv } from "../src/lib/csvImport";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);

const url = args.get("url") ?? process.env.PB_URL ?? "http://127.0.0.1:8093";
const email = args.get("email");
const password = args.get("password");
const name = args.get("name") ?? "Yo";
const file = args.get("file") ?? new URL("../seed/registro-contable.csv", import.meta.url).pathname;
if (!email || !password) {
  console.error('Uso: bun run seed -- --email yo@correo.com --password "clave-larga" [--name Yo] [--file registro.csv]');
  process.exit(1);
}

const pb = new PocketBase(url);
pb.autoCancellation(false);

try {
  await pb.collection("users").authWithPassword(email, password);
} catch {
  await pb.collection("users").create({ email, password, passwordConfirm: password, name });
  await pb.collection("users").authWithPassword(email, password);
  console.log(`Usuario creado: ${email}`);
}
const owner = pb.authStore.record!.id;

// ---------- El registro contable ----------
const plan = planFromCsv(readFileSync(file, "utf8"));
const r = await applyPlan(pb, owner, plan, (done, total) => {
  if (done % 50 === 0 || done === total) process.stdout.write(`\r  ${done}/${total} transacciones`);
});
console.log(
  `\nCSV: ${r.accountsCreated} cuentas, ${r.categoriesCreated} categorías, ${r.created} transacciones nuevas (${r.duplicated} ya estaban).`,
);

// Las categorías de partida que el registro no usa sobran en el ejemplo.
const used = new Set(
  (await pb.collection("transactions").getFullList({ fields: "category", filter: "category != ''" })).map((t) => t.category),
);
for (const c of await pb.collection("categories").getFullList()) {
  if (!used.has(c.id) && !plan.categories.some((p) => p.name === c.name)) await pb.collection("categories").delete(c.id);
}

// ---------- El plan mensual ----------
if ((await pb.collection("recurring").getList(1, 1)).totalItems === 0) {
  const accs = await pb.collection("accounts").getFullList();
  const cats = await pb.collection("categories").getFullList();
  const acc = (n: string) => accs.find((a) => a.name === n)?.id ?? "";
  const cat = (n: string) => cats.find((c) => c.name === n)?.id ?? "";
  const main = acc("Banco Principal");
  const today = new Date().toISOString().slice(0, 10);

  const RECURRING = [
    { name: "Sueldo", kind: "income", amount: 6500000, day_of_month: 1, category: cat("Salario") },
    { name: "Arriendo", kind: "expense", amount: 1800000, day_of_month: 5, category: cat("Arriendo") },
    { name: "Energía y agua", kind: "expense", amount: 220000, day_of_month: 10, category: cat("Servicios") },
    { name: "Internet", kind: "expense", amount: 95000, day_of_month: 12, category: cat("Servicios") },
    { name: "Seguro de salud", kind: "expense", amount: 210000, day_of_month: 14, category: cat("Seguros") },
    { name: "Declaración de renta", kind: "expense", amount: 60000, day_of_month: 1, category: cat("Impuestos") },
  ];
  for (const x of RECURRING) {
    await pb.collection("recurring").create({ ...x, owner, frequency: "monthly", account: main, start_date: today });
  }

  const SAVINGS = [
    { name: "Fondo de emergencia", monthly_amount: 400000, palette: "mono-rose", icon: "shield-01", annual_rate: 9, account: "Fondo de inversión", target: 10000000 },
    { name: "Viaje a Cartagena", monthly_amount: 300000, palette: "mono-teal", icon: "airplane-01", annual_rate: 9, account: "Fondo de inversión", target: 4000000 },
    { name: "Retiro", monthly_amount: 100000, palette: "mono-emerald", icon: "umbrella", annual_rate: 10, account: "Fondo de inversión" },
  ];
  for (const s of SAVINGS) {
    await pb.collection("savings").create({
      owner,
      name: s.name,
      icon: s.icon,
      palette: s.palette,
      monthly_amount: s.monthly_amount,
      day_of_month: 15,
      annual_rate: s.annual_rate,
      target_amount: s.target ?? 0,
      allocations: [{ account: acc(s.account) || main, percent: 100 }],
      auto: false,
    });
  }
  console.log(`Plan: ${RECURRING.length} fijos y ${SAVINGS.length} ahorros.`);
}

console.log(`Listo para ${email}.`);
