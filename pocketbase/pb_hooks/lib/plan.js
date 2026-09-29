/**
 * La proyección del lado del servidor, para la API: el plan de un mes, qué
 * movimientos programados tocan, cuáles ya se pagaron, qué hay que reservar y
 * los meses que vienen.
 *
 * Las fechas y el plan son las mismas cuentas de src/lib/finance.ts (la
 * pantalla las hace en el navegador); tests/plan.test.ts compara las dos.
 *
 * Un mes queda pagado cuando un movimiento lleva la marca del programado en
 * ese mes (`recurringKey`): en `external_id` si lo creó la app (al marcarlo o
 * con el registro automático), o en `recurring_key` si es un movimiento que
 * ya existía (uno que llegó por Gmail) y se unió al programado.
 */

function pad(n) {
  return (n < 10 ? "0" : "") + n;
}

function dayOf(s) {
  return String(s || "").slice(0, 10);
}

/** "2026-09" + n meses. */
function addMonths(ym, n) {
  var y = +ym.slice(0, 4);
  var m = +ym.slice(5, 7) - 1 + n;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return y + "-" + pad(m + 1);
}

function lastDayOf(ym) {
  return new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
}

/** [primer día del mes, primer día del siguiente]. */
function monthRange(ym) {
  return [ym + "-01", addMonths(ym, 1) + "-01"];
}

/** Hoy en Colombia (UTC-5), como el programador. */
function today() {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function activeIn(r, ym) {
  var range = monthRange(ym);
  var start = dayOf(r.start_date);
  var end = dayOf(r.end_date);
  return !(start && start >= range[1]) && !(end && end < range[0]);
}

/** El día en que cae en el mes, "AAAA-MM" si no tiene día fijo, o null. Ver `occurrenceDate` en finance.ts. */
function occurrenceDate(r, ym) {
  var start = dayOf(r.start_date);
  var end = dayOf(r.end_date);
  var freq = r.frequency || "monthly";
  var date;
  if (freq === "once") {
    if (!start || start.slice(0, 7) !== ym) return null;
    date = start;
  } else {
    if (freq === "yearly" && +ym.slice(5) !== (r.month || 1)) return null;
    if (!r.day_of_month) return activeIn(r, ym) ? ym : null;
    date = ym + "-" + pad(Math.min(r.day_of_month, lastDayOf(ym)));
    if (start && date < start) return null;
  }
  if (end && date > end) return null;
  return date;
}

/** Como `occurrenceDate`, pero basta con que el inicio caiga en el mes. Ver `dueDate` en finance.ts. */
function dueDate(r, ym) {
  if ((r.frequency || "monthly") === "once") return occurrenceDate(r, ym);
  if (!activeIn(r, ym)) return null;
  var copy = {};
  for (var k in r) copy[k] = r[k];
  copy.start_date = "";
  return occurrenceDate(copy, ym);
}

/** La marca del pago de un mes: `rec:<id>:<AAAA-MM>`, `rec:<id>:<AAAA>` o `rec:<id>`. */
function recurringKey(r, ym) {
  var freq = r.frequency || "monthly";
  if (freq === "once") return "rec:" + r.id;
  return "rec:" + r.id + ":" + (freq === "yearly" ? ym.slice(0, 4) : ym);
}

function occursIn(r, ym) {
  if (r.paused) return 0;
  return occurrenceDate(r, ym) ? r.amount : 0;
}

function monthlyEquivalent(r, ym) {
  if (r.paused || r.kind === "transfer") return 0;
  var freq = r.frequency || "monthly";
  if (freq === "once" || (ym && !activeIn(r, ym))) return 0;
  return freq === "yearly" ? r.amount / 12 : r.amount;
}

function nextDueMonth(r, ym) {
  var freq = r.frequency || "monthly";
  var due;
  if (freq === "once") {
    due = dayOf(r.start_date).slice(0, 7);
  } else if (freq === "yearly") {
    var m = pad(r.month || 1);
    due = ym.slice(0, 4) + "-" + m;
    if (due < ym) due = +ym.slice(0, 4) + 1 + "-" + m;
  } else {
    return null;
  }
  if (!due || due < ym) return null;
  return dueDate(r, due) ? due : null;
}

function reserveMonths(r, ym, since) {
  var due = nextDueMonth(r, ym);
  if (!due) return null;
  var start = (r.frequency || "monthly") === "once" ? since : addMonths(due, -11);
  if (since > start) start = since;
  if (ym < start) return null;
  var months = [];
  for (var m = start; m <= due; m = addMonths(m, 1)) months.push(m);
  return { due: due, months: months };
}

/** Ingresos, pagos programados, ahorros y lo libre de un mes. Ver `planSummary`. */
function summary(recurring, savings, ym) {
  var income = 0;
  var fixed = 0;
  for (var i = 0; i < recurring.length; i++) {
    var v = monthlyEquivalent(recurring[i], ym);
    if (recurring[i].kind === "income") income += v;
    else if (recurring[i].kind === "expense") fixed += v;
  }
  var sav = 0;
  for (var j = 0; j < savings.length; j++) if (!savings[j].archived) sav += (savings[j].monthly_amount || 0) * (savings[j].share === undefined ? 1 : savings[j].share);
  return { income: income, fixed: fixed, savings: sav, free: income - fixed - sav };
}

/** El estado de un programado sin pagar, como lo muestra la pantalla. */
function statusOf(r, date, now) {
  if (!date) return "sin_fecha";
  if (r.auto_create && date >= now) return "automatico";
  if (date < now) return "vencido";
  if (date === now) return "hoy";
  return "previsto";
}

/** Sin día fijo, la fecha del pago es hoy si cae en el mes; si no, su primer o último día. */
function dateFor(date, ym, now) {
  if (date && date.length === 10) return date;
  if (now.slice(0, 7) === ym) return now;
  return ym < now ? ym + "-" + pad(lastDayOf(ym)) : ym + "-01";
}

// ---------------------------------------------------------------------------
// Lo que lee de la base
// ---------------------------------------------------------------------------

function jsonOf(record, field, fallback) {
  try {
    var v = JSON.parse(record.getString(field) || "null");
    return v === null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

function recurringOf(r) {
  return {
    id: r.id,
    name: r.getString("name"),
    kind: r.getString("kind"),
    amount: r.getFloat("amount"),
    frequency: r.getString("frequency") || "monthly",
    day_of_month: r.getInt("day_of_month"),
    month: r.getInt("month"),
    start_date: dayOf(r.getString("start_date")),
    end_date: dayOf(r.getString("end_date")),
    category: r.getString("category"),
    account: r.getString("account"),
    to_account: r.getString("to_account"),
    tags: jsonOf(r, "tags", []),
    saving: r.getString("saving"),
    paused: r.getBool("paused"),
    auto_create: r.getBool("auto_create"),
  };
}

function txOf(t, names) {
  var key = t.getString("recurring_key") || (t.getString("external_id").indexOf("rec:") === 0 ? t.getString("external_id") : "");
  return {
    id: t.id,
    type: t.getString("type"),
    date: dayOf(t.getString("date")),
    amount: t.getFloat("amount"),
    account: t.getString("account"),
    account_name: names[t.getString("account")] || "",
    to_account: t.getString("to_account"),
    category: t.getString("category"),
    category_name: names[t.getString("category")] || "",
    description: t.getString("description"),
    source: t.getString("source"),
    key: key,
    // Unido a un programado sin haberlo creado la app: al desmarcarlo se conserva.
    linked: !!t.getString("recurring_key"),
  };
}

/** Parte del aporte mensual de un ahorro que pone esta persona (0..1). Ver `shareOf` en store.svelte.ts. */
function shareOf(s, userId) {
  var total = s.getFloat("monthly_amount");
  if (!total) return s.getString("owner") === userId ? 1 : 0;
  var shares = jsonOf(s, "shares", {});
  if (!shares || !Object.keys(shares).length) {
    shares = {};
    shares[s.getString("owner")] = total;
  }
  return Math.min(1, (+shares[userId] || 0) / total);
}

function savingBalance(app, savingId) {
  var list = app.findRecordsByFilter("saving_movements", "saving = {:s}", "", 0, 0, { s: savingId });
  var total = 0;
  for (var i = 0; i < list.length; i++) total += list[i].getFloat("amount");
  return Math.round(total);
}

/** Las fechas de un mes extendidas unos días, para buscar pagos que llegaron antes o después. */
function around(ym, days) {
  var range = monthRange(ym);
  var from = new Date(range[0] + "T00:00:00Z");
  var to = new Date(range[1] + "T00:00:00Z");
  from.setUTCDate(from.getUTCDate() - days);
  to.setUTCDate(to.getUTCDate() + days);
  return [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)];
}

/**
 * Movimientos que podrían ser el pago de un programado: del mismo tipo, sin
 * marca de otro programado, cerca del mes y con un monto parecido (hasta 20 %
 * de diferencia). Los más parecidos primero.
 */
function candidatesFor(r, date, pool) {
  var out = [];
  for (var i = 0; i < pool.length; i++) {
    var t = pool[i];
    if (t.key || t.type !== r.kind) continue;
    if (r.kind === "transfer" && r.to_account && t.to_account !== r.to_account) continue;
    var diff = r.amount ? Math.abs(t.amount - r.amount) / r.amount : 1;
    if (diff > 0.2) continue;
    var days = date && date.length === 10 ? Math.abs(Date.parse(t.date) - Date.parse(date)) / 86400000 : 0;
    var score = diff * 10 + days / 30 + (r.account && t.account !== r.account ? 0.5 : 0) + (r.category && t.category !== r.category ? 0.3 : 0);
    out.push({ tx: t, score: score });
  }
  out.sort(function (a, b) {
    return a.score - b.score;
  });
  return out.slice(0, 5).map(function (x) {
    return x.tx;
  });
}

/**
 * El plan de `ym` para una persona. Con `only`, solo ese programado (y sus
 * candidatos). `months`: cuántos meses siguientes resumir.
 */
function monthPlan(app, userId, ym, opts) {
  opts = opts || {};
  var now = today();
  var names = {};
  var accs = app.findRecordsByFilter("accounts", "owner = {:u}", "", 0, 0, { u: userId });
  for (var a = 0; a < accs.length; a++) names[accs[a].id] = accs[a].getString("name");
  var cats = app.findRecordsByFilter("categories", "owner = {:u}", "", 0, 0, { u: userId });
  for (var c = 0; c < cats.length; c++) names[cats[c].id] = cats[c].getString("name");

  var recurring = app.findRecordsByFilter("recurring", "owner = {:u}", "name", 0, 0, { u: userId }).map(recurringOf);
  var savingRecs = app.findRecordsByFilter("savings", "(owner = {:u} || members.id ?= {:u}) && archived = false", "", 0, 0, { u: userId });
  var savings = savingRecs.map(function (s) {
    return { id: s.id, kind: s.getString("kind"), monthly_amount: s.getFloat("monthly_amount"), archived: false, share: shareOf(s, userId) };
  });

  // Todo lo del mes (unos días antes y después) y lo marcado con este mes.
  var span = around(ym, 10);
  var txs = app
    .findRecordsByFilter(
      "transactions",
      "owner = {:u} && ((date >= {:from} && date < {:to}) || external_id ~ {:pat} || recurring_key ~ {:pat} || external_id ~ {:year} || recurring_key ~ {:year})",
      "-date",
      0,
      0,
      { u: userId, from: span[0], to: span[1], pat: "rec:%:" + ym, year: "rec:%:" + ym.slice(0, 4) },
    )
    .map(function (t) {
      return txOf(t, names);
    });
  var byKey = {};
  for (var i = 0; i < txs.length; i++) if (txs[i].key) byKey[txs[i].key] = txs[i];
  // Los de una vez llevan la marca sin mes: se buscan aparte.
  for (var o = 0; o < recurring.length; o++) {
    var ro = recurring[o];
    if (ro.frequency !== "once" || byKey["rec:" + ro.id]) continue;
    try {
      var one = app.findFirstRecordByFilter("transactions", "owner = {:u} && (external_id = {:k} || recurring_key = {:k})", { u: userId, k: "rec:" + ro.id });
      byKey["rec:" + ro.id] = txOf(one, names);
    } catch (_) {}
  }
  // Los candidatos salen de lo del mes y unos días alrededor; los marcados ya tienen dueño.
  var pool = txs;

  var items = [];
  var seen = {};
  for (var k = 0; k < recurring.length; k++) {
    var r = recurring[k];
    if (r.paused || (opts.only && r.id !== opts.only)) continue;
    var d = dueDate(r, ym);
    if (!d) continue;
    var key = recurringKey(r, ym);
    seen[key] = true;
    var paid = byKey[key] || null;
    var date = d.length === 10 ? d : null;
    items.push({
      recurring: {
        id: r.id,
        name: r.name,
        kind: r.kind,
        amount: r.amount,
        frequency: r.frequency,
        day_of_month: r.day_of_month,
        auto_create: r.auto_create,
        account: r.account,
        account_name: names[r.account] || "",
        to_account: r.to_account,
        to_account_name: names[r.to_account] || "",
        category: r.category,
        category_name: names[r.category] || "",
      },
      key: key,
      date: date,
      status: paid ? "pagado" : statusOf(r, date, now),
      transaction: paid,
      candidates: paid ? [] : candidatesFor(r, dateFor(date, ym, now), pool),
    });
  }
  items.sort(function (x, y) {
    return (x.date || "9").localeCompare(y.date || "9") || x.recurring.name.localeCompare(y.recurring.name);
  });

  // Lo marcado en este mes cuyo programado ya no toca (en pausa, cambiado o borrado).
  var extra = [];
  if (!opts.only) {
    for (var e = 0; e < txs.length; e++) {
      var t = txs[e];
      if (!t.key || seen[t.key]) continue;
      var parts = t.key.split(":");
      var month = parts[2] && parts[2].length === 7 ? parts[2] : t.date.slice(0, 7);
      if (month !== ym) continue;
      extra.push(t);
    }
  }

  // Lo que toca reservar para los pagos con provisión. Ver `reserves` en RecurringMonth.svelte.
  var reserves = [];
  var thisMonth = now.slice(0, 7);
  for (var p = 0; p < recurring.length; p++) {
    var rp = recurring[p];
    if (rp.paused || rp.kind !== "expense" || !rp.saving || (opts.only && rp.id !== opts.only)) continue;
    var saving = null;
    for (var s = 0; s < savingRecs.length; s++) if (savingRecs[s].id === rp.saving && savingRecs[s].getString("kind") === "provision") saving = savingRecs[s];
    if (!saving) continue;
    var plan = reserveMonths(rp, ym, (rp.start_date || dayOf(saving.getString("created"))).slice(0, 7));
    if (!plan) continue;
    var prefix = "prov:" + rp.id + ":";
    var marks = {};
    var mvs = app.findRecordsByFilter("saving_movements", "saving = {:s} && external_id ~ {:p}", "", 0, 0, { s: saving.id, p: prefix + "%" });
    for (var mi = 0; mi < mvs.length; mi++) marks[mvs[mi].getString("external_id").slice(prefix.length)] = mvs[mi];
    var mv = marks[ym];
    if (!mv && ym === plan.due && byKey[recurringKey(rp, ym)]) continue;
    if (!mv && plan.months.length < 2) continue;
    var share = Math.ceil(rp.amount / plan.months.length);
    var live = plan.due === nextDueMonth(rp, thisMonth);
    var saved = savingBalance(app, saving.id);
    var quota = live ? Math.min(share, Math.max(0, rp.amount - saved)) : share;
    if (!mv && quota <= 0) continue;
    var idx = plan.months.indexOf(ym);
    if (!mv && live && ym < thisMonth && saved >= Math.min(rp.amount, share * (idx + 1))) continue;
    var behind = 0;
    if (!mv && live && ym === thisMonth) {
      var missed = plan.months.filter(function (m) {
        return m < ym && !marks[m];
      }).length;
      behind = missed ? Math.max(0, Math.min(rp.amount, share * idx) - saved) : 0;
    }
    reserves.push({
      recurring: { id: rp.id, name: rp.name, amount: rp.amount },
      saving: saving.id,
      key: prefix + ym,
      due: plan.due,
      quota: quota,
      behind: behind,
      saved: saved,
      reserved: mv ? { id: mv.id, amount: mv.getFloat("amount"), date: dayOf(mv.getString("date")) } : null,
    });
  }

  var next = [];
  var monthlySavings = summary([], savings, ym).savings;
  var count = Math.max(0, Math.min(36, opts.months === undefined ? 12 : +opts.months || 0));
  for (var n = 1; n <= count; n++) {
    var mm = addMonths(ym, n);
    var inc = 0;
    var exp = 0;
    for (var q = 0; q < recurring.length; q++) {
      var v = occursIn(recurring[q], mm);
      if (recurring[q].kind === "income") inc += v;
      else if (recurring[q].kind === "expense") exp += v;
    }
    next.push({ ym: mm, income: inc, expense: exp, savings: monthlySavings, free: inc - exp - monthlySavings });
  }

  return { ym: ym, today: now, summary: summary(recurring, savings, ym), items: items, extra: extra, reserves: reserves, next: next };
}

/** Las etiquetas del programado, siempre con "fijo". Igual que `tagsOf` en scheduler.js. */
function tagsFor(r) {
  var tags = Array.isArray(r.tags) ? r.tags.slice() : [];
  if (tags.indexOf("fijo") < 0) tags.unshift("fijo");
  return tags;
}

function findByKey(app, userId, key) {
  try {
    return app.findFirstRecordByFilter("transactions", "owner = {:u} && (external_id = {:k} || recurring_key = {:k})", { u: userId, k: key });
  } catch (_) {
    return null;
  }
}

/**
 * Marca un programado como pagado (o recibido) en un mes, o lo desmarca.
 * `body`: `recurring`, `ym` y una de estas:
 * - nada más: crea el movimiento con los datos del programado (se pueden
 *   cambiar `amount`, `date`, `account` y `description`);
 * - `transaction`: une un movimiento que ya existe (uno que llegó por Gmail);
 * - `unlink: true`: lo desmarca. Si el movimiento lo creó la app, lo borra; si
 *   se había unido, lo conserva y solo le quita la marca.
 * @returns {{ action: string, key: string, transaction: string }}
 */
function mark(app, userId, body) {
  var provisions = require(__hooks + "/lib/provisions.js");
  var ym = String(body.ym || today().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new BadRequestError("El mes va como AAAA-MM, por ejemplo 2026-09.");
  var rec;
  try {
    rec = app.findRecordById("recurring", String(body.recurring || ""));
  } catch (_) {
    throw new NotFoundError("No se encontró el movimiento programado.");
  }
  if (rec.getString("owner") !== userId) throw new NotFoundError("No se encontró el movimiento programado.");
  var r = recurringOf(rec);
  var key = recurringKey(r, ym);
  var current = findByKey(app, userId, key);

  if (body.unlink) {
    if (!current) throw new BadRequestError("«" + r.name + "» no está marcado en ese mes.");
    if (current.getString("recurring_key") === key) {
      current.set("recurring_key", "");
      // Deja de ser un pago programado: sin "fijo", vuelve a contar como gasto variable.
      current.set(
        "tags",
        jsonOf(current, "tags", []).filter(function (t) {
          return t !== "fijo";
        }),
      );
      app.save(current);
      provisions.onUnpaid(app, current, key);
      return { action: "desmarcado", key: key, transaction: current.id };
    }
    // Lo creó la app: se borra, y el registro automático no lo vuelve a crear (ver ignored.js).
    app.delete(current);
    return { action: "borrado", key: key, transaction: current.id };
  }

  if (current) throw new BadRequestError("«" + r.name + "» ya está marcado en ese mes con el movimiento " + current.id + ".");
  var due = dueDate(r, ym);
  if (!due) throw new BadRequestError("«" + r.name + "» no toca en ese mes.");

  if (body.transaction) {
    var tx;
    try {
      tx = app.findRecordById("transactions", String(body.transaction));
    } catch (_) {
      throw new NotFoundError("No se encontró el movimiento.");
    }
    if (tx.getString("owner") !== userId) throw new NotFoundError("No se encontró el movimiento.");
    var other = tx.getString("recurring_key") || (tx.getString("external_id").indexOf("rec:") === 0 ? tx.getString("external_id") : "");
    if (other) throw new BadRequestError("Ese movimiento ya es el pago de otro movimiento programado.");
    if (tx.getString("type") !== r.kind) throw new BadRequestError("Ese movimiento es de otro tipo que «" + r.name + "».");
    var tags = jsonOf(tx, "tags", []);
    var add = tagsFor(r);
    for (var i = 0; i < add.length; i++) if (tags.indexOf(add[i]) < 0) tags.push(add[i]);
    tx.set("tags", tags);
    tx.set("recurring_key", key);
    app.save(tx);
    provisions.onPaid(app, tx);
    return { action: "unido", key: key, transaction: tx.id };
  }

  var account = String(body.account || r.account || "");
  if (!account) throw new BadRequestError("«" + r.name + "» no tiene cuenta: indica `account`.");
  if (r.kind === "transfer" && (!r.to_account || r.to_account === account)) throw new BadRequestError("«" + r.name + "» no tiene una cuenta de destino distinta.");
  var date = String(body.date || dateFor(due, ym, today())).slice(0, 10);
  var nt = new Record(app.findCollectionByNameOrId("transactions"));
  nt.set("owner", userId);
  nt.set("type", r.kind);
  nt.set("date", date + " 12:00:00.000Z");
  nt.set("account", account);
  if (r.kind === "transfer") nt.set("to_account", r.to_account);
  else if (r.category) nt.set("category", r.category);
  nt.set("amount", +body.amount > 0 ? +body.amount : r.amount);
  nt.set("description", String(body.description || r.name).slice(0, 200));
  nt.set("tags", tagsFor(r));
  nt.set("source", "recurrente");
  nt.set("external_id", key);
  app.save(nt);
  return { action: "creado", key: key, transaction: nt.id };
}

module.exports = {
  mark: mark,
  addMonths: addMonths,
  occurrenceDate: occurrenceDate,
  dueDate: dueDate,
  recurringKey: recurringKey,
  occursIn: occursIn,
  monthlyEquivalent: monthlyEquivalent,
  nextDueMonth: nextDueMonth,
  reserveMonths: reserveMonths,
  summary: summary,
  statusOf: statusOf,
  dateFor: dateFor,
  candidatesFor: candidatesFor,
  recurringOf: recurringOf,
  today: today,
  monthPlan: monthPlan,
};
