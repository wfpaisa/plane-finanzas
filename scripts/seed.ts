/**
 * Datos de ejemplo: importa el registro contable (`seed/registro-contable.csv`)
 * y le suma el plan mensual (sueldo, fijos y ahorros).
 *
 *   bun run seed -- --email yo@correo.com --password "clave-larga" [--name "Yo"] [--file otro.csv] [--url http://127.0.0.1:8093]
 *
 * Si el usuario no existe lo crea, siempre que la base no tenga usuarios (las
 * cuentas nuevas son por invitación). Se puede correr varias veces: las filas
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
  // Las cuentas nuevas son por invitación: solo se crea en una base sin usuarios.
  const res = await pb.send("/api/finanzas/setup", { method: "POST", body: { email, password, name } }).catch((err) => {
    console.error(`No se pudo entrar ni crear el usuario ${email}: ${err.message}`);
    process.exit(1);
  });
  pb.authStore.save(res.token, res.record);
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
  // El plan empieza en el mes del primer movimiento del registro, para que
  // cubra todo lo importado aunque el registro sea de meses atrás.
  const first = plan.transactions.reduce((m, t) => (t.date < m ? t.date : m), new Date().toISOString().slice(0, 10));
  const start = `${first.slice(0, 7)}-01`;

  const RECURRING = [
    { name: "Sueldo", kind: "income", amount: 6500000, day_of_month: 1, category: cat("Salario") },
    { name: "Arriendo", kind: "expense", amount: 1800000, day_of_month: 5, category: cat("Arriendo") },
    { name: "Energía y agua", kind: "expense", amount: 220000, day_of_month: 10, category: cat("Servicios") },
    { name: "Internet", kind: "expense", amount: 95000, day_of_month: 12, category: cat("Servicios") },
    { name: "Seguro de salud", kind: "expense", amount: 210000, day_of_month: 14, category: cat("Seguros") },
    { name: "Declaración de renta", kind: "expense", amount: 60000, day_of_month: 1, category: cat("Impuestos") },
  ];
  for (const x of RECURRING) {
    await pb.collection("recurring").create({ ...x, owner, frequency: "monthly", account: main, start_date: start });
  }

  const SAVINGS = [
    { name: "Fondo de emergencia", monthly_amount: 400000, palette: "mono-rose", icon: "shield-01", annual_rate: 9, account: "Fondo de inversión", target: 10000000 },
    { name: "Viaje a Cartagena", monthly_amount: 300000, palette: "mono-teal", icon: "airplane-01", annual_rate: 9, account: "Fondo de inversión", target: 4000000 },
    { name: "Retiro", monthly_amount: 100000, palette: "mono-emerald", icon: "umbrella", annual_rate: 10, account: "Fondo de inversión" },
  ];
  // Un aporte de cada ahorro el día 15 de cada mes del registro, hasta su último movimiento.
  const last = plan.transactions.reduce((m, t) => (t.date > m ? t.date : m), first);
  const months: string[] = [];
  for (let d = new Date(`${start}T12:00:00Z`); d.toISOString().slice(0, 10) <= last; d.setUTCMonth(d.getUTCMonth() + 1)) {
    if (`${d.toISOString().slice(0, 7)}-15` <= last) months.push(`${d.toISOString().slice(0, 7)}-15`);
  }
  for (const s of SAVINGS) {
    const saving = await pb.collection("savings").create({
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
    const account = acc(s.account) || main;
    for (const date of months) {
      await pb.collection("saving_movements").create({
        saving: saving.id,
        account,
        created_by: owner,
        amount: s.monthly_amount,
        date: `${date} 12:00:00.000Z`,
      });
    }
  }
  console.log(`Plan: ${RECURRING.length} fijos y ${SAVINGS.length} ahorros con ${months.length} aportes cada uno.`);
}

console.log(`Listo para ${email}.`);
