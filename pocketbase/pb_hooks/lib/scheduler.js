/**
 * Lo que se repite solo: los fijos con "crear automáticamente" y los aportes
 * automáticos a los ahorros.
 *
 * Corre una vez al día, pero no depende de caer justo el día: si hoy ya pasó
 * el día del mes y ese mes todavía no tiene su movimiento, lo crea. El
 * `external_id` (`rec:<id>:<aaaa-mm>`) es lo que impide duplicar.
 */

function pad(n) {
  return (n < 10 ? "0" : "") + n;
}

/** Hoy en Colombia (UTC-5). */
function todayCo() {
  var d = new Date(Date.now() - 5 * 3600 * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

function lastDay(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function has(app, collection, filter, params) {
  try {
    app.findFirstRecordByFilter(collection, filter, params);
    return true;
  } catch (_) {
    return false;
  }
}

function runRecurring(app, userId) {
  var t = todayCo();
  var ym = t.y + "-" + pad(t.m);
  var today = ym + "-" + pad(t.d);
  var created = 0;
  var filter = "auto_create = true && paused = false && account != ''" + (userId ? " && owner = {:u}" : "");
  var items = app.findRecordsByFilter("recurring", filter, "", 2000, 0, { u: userId || "" });
  var col = app.findCollectionByNameOrId("transactions");

  for (var i = 0; i < items.length; i++) {
    var r = items[i];
    var freq = r.getString("frequency") || "monthly";
    var start = r.getString("start_date").slice(0, 10);
    var end = r.getString("end_date").slice(0, 10);
    var dom = Math.min(r.getInt("day_of_month") || 1, lastDay(t.y, t.m));
    var date = ym + "-" + pad(dom);
    var key = "rec:" + r.id + ":" + ym;

    if (freq === "yearly") {
      if ((r.getInt("month") || 1) !== t.m) continue;
      key = "rec:" + r.id + ":" + t.y;
    } else if (freq === "once") {
      if (!start || start > today) continue;
      date = start;
      key = "rec:" + r.id;
    }
    if (date > today) continue;
    if (start && date < start && freq !== "once") continue;
    if (end && date > end) continue;
    if (has(app, "transactions", "owner = {:u} && external_id = {:k}", { u: r.getString("owner"), k: key })) continue;

    var tx = new Record(col);
    tx.set("owner", r.getString("owner"));
    tx.set("type", r.getString("kind"));
    tx.set("date", date + " 12:00:00.000Z");
    tx.set("account", r.getString("account"));
    if (r.getString("category")) tx.set("category", r.getString("category"));
    tx.set("amount", r.getFloat("amount"));
    tx.set("description", r.getString("name"));
    tx.set("tags", ["fijo"]);
    tx.set("source", "recurrente");
    tx.set("external_id", key);
    app.save(tx);
    created++;
  }
  return created;
}

function runSavings(app, userId) {
  var t = todayCo();
  var ym = t.y + "-" + pad(t.m);
  var created = 0;
  var filter = "auto = true && archived = false && monthly_amount > 0" + (userId ? " && (owner = {:u} || members.id ?= {:u})" : "");
  var items = app.findRecordsByFilter("savings", filter, "", 2000, 0, { u: userId || "" });
  var col = app.findCollectionByNameOrId("saving_movements");

  for (var i = 0; i < items.length; i++) {
    var s = items[i];
    var dom = Math.min(s.getInt("day_of_month") || 1, lastDay(t.y, t.m));
    if (t.d < dom) continue;
    var date = ym + "-" + pad(dom);
    var monthly = s.getFloat("monthly_amount");
    var alloc = [];
    try {
      alloc = JSON.parse(s.getString("allocations") || "[]") || [];
    } catch (_) {
      alloc = [];
    }
    if (!alloc.length) alloc = [{ account: "", percent: 100 }];

    for (var j = 0; j < alloc.length; j++) {
      var a = alloc[j];
      var pct = +a.percent || 0;
      if (pct <= 0) continue;
      var key = "auto:" + ym + ":" + (a.account || "sin-cuenta");
      if (has(app, "saving_movements", "saving = {:s} && external_id = {:k}", { s: s.id, k: key })) continue;
      var creator = s.getString("owner");
      // El aporte lo hace el dueño de la cuenta, que puede ser un miembro.
      if (a.account) {
        try {
          creator = app.findRecordById("accounts", a.account).getString("owner");
        } catch (_) {
          continue;
        }
      }
      var mv = new Record(col);
      mv.set("saving", s.id);
      if (a.account) mv.set("account", a.account);
      mv.set("created_by", creator);
      mv.set("amount", Math.round((monthly * pct) / 100));
      mv.set("date", date + " 12:00:00.000Z");
      mv.set("note", "Aporte automático");
      mv.set("external_id", key);
      app.save(mv);
      created++;
    }
  }
  return created;
}

module.exports = { runRecurring: runRecurring, runSavings: runSavings };
