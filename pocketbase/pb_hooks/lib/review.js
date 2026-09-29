/**
 * Revisar las reglas contra correos reales, sin guardar nada.
 *
 * Toma correos (de Gmail, incluidos la papelera y el spam, o de la bandeja) y
 * dice, para cada uno, qué haría hoy la app: qué regla gana, qué movimiento
 * crearía o si lo descartaría, y qué está mal. Para cada regla, con cuántos
 * correos coincide y sus problemas: cuentas o categorías que ya no existen,
 * remitentes que Gmail no lee, reglas que nunca ganan, empates.
 *
 * `inspect` es lógica pura (se prueba en tests/review.test.ts); `load` y
 * `fromGmail` / `fromInbox` traen los datos de la base y de Gmail.
 */

var parsers = require(__hooks + "/lib/parsers.js");
var rules = require(__hooks + "/lib/rules.js");
var inbox = require(__hooks + "/lib/inbox.js");
var merchants = require(__hooks + "/lib/merchants.js");

var TYPE = { income: "ingreso", expense: "gasto", transfer: "transferencia", discard: "descartar" };
var KIND = { income: "ingreso", expense: "gasto" };
var FIELDS = [
  ["type", "tipo"],
  ["account", "cuenta"],
  ["to_account", "cuenta de destino"],
  ["category", "categoría"],
  ["amount", "monto"],
  ["description", "descripción"],
];

function byId(list) {
  var out = {};
  for (var i = 0; i < list.length; i++) out[list[i].id] = list[i];
  return out;
}

function ref(rule) {
  return rule ? { id: rule.id, name: rule.name || "(sin nombre)" } : null;
}

function quote(rule) {
  return "«" + (rule.name || "sin nombre") + "»";
}

/**
 * Las palabras de un remitente como las separa Gmail: "Banco <alertas@an.banco.com>"
 * -> ["banco", "alertas", "an", "banco", "com"].
 */
function tokens(text) {
  return parsers
    .norm(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Si `part` aparece en `list` como palabras seguidas. */
function contains(list, part) {
  if (!part.length) return false;
  for (var i = 0; i + part.length <= list.length; i++) {
    var ok = true;
    for (var j = 0; j < part.length && ok; j++) ok = list[i + j] === part[j];
    if (ok) return true;
  }
  return false;
}

/**
 * Si la búsqueda `from:(…)` de Gmail trae un remitente. Gmail compara palabras
 * completas del nombre y la dirección, no pedazos: `bancolombia` trae
 * "@bancolombia.com.co" y "Bancolombia <…>", pero no "@notificacionesbancolombia.com".
 */
function gmailReads(from, read) {
  var have = tokens(from);
  for (var i = 0; i < read.length; i++) if (contains(have, tokens(read[i]))) return true;
  return false;
}

/** Un término para agregar a los remitentes de Gmail: el dominio del correo. */
function domainOf(from) {
  var m = /@([^>\s]+)/.exec(String(from || ""));
  return m ? m[1].toLowerCase() : "";
}

/** Los problemas de una regla que se ven sin mirar ningún correo. */
function staticProblems(rule, ctx, all) {
  var out = [];
  var accounts = ctx.allAccounts;
  var cats = ctx.categoriesById;
  var senders = String(rule.sender || "").split(",").map(parsers.norm).filter(Boolean);
  var keys = String(rule.match || "").split(",").map(parsers.norm).filter(Boolean);

  if (rule.paused) out.push("Está en pausa: no se aplica a ningún correo.");
  if (!senders.length && !keys.length) out.push("No tiene remitente ni texto: nunca coincide con un correo.");
  for (var k = 0; k < keys.length; k++) {
    if (keys[k].length < 3) out.push("El texto «" + keys[k] + "» es muy corto: puede coincidir con correos que no corresponden.");
  }
  if (ctx.readSenders) {
    for (var s = 0; s < senders.length; s++) {
      // Sin el correo no se sabe el nombre del remitente: se compara el texto de la regla.
      if (!gmailReads(senders[s], ctx.readSenders)) {
        out.push(
          "Es posible que Gmail no lea correos de «" +
            senders[s] +
            "»: Gmail busca palabras completas y ningún remitente de Gmail es una palabra de este texto. Agrégalo a los remitentes de Gmail o de una cuenta.",
        );
      }
    }
  }
  if (rule.type !== "discard") {
    var acc = rule.account ? accounts[rule.account] : null;
    if (rule.account && !acc) out.push("La cuenta de la regla ya no existe. Elige otra.");
    else if (acc && acc.archived) out.push("La cuenta «" + acc.name + "» está archivada. Elige otra.");
    if (rule.type === "transfer") {
      var to = rule.to_account ? accounts[rule.to_account] : null;
      if (!rule.to_account) out.push("Es una transferencia sin cuenta de destino: los correos quedarán pendientes.");
      else if (!to) out.push("La cuenta de destino ya no existe. Elige otra.");
      else if (to.archived) out.push("La cuenta de destino «" + to.name + "» está archivada. Elige otra.");
      if (rule.to_account && rule.to_account === rule.account) out.push("La cuenta de origen y la de destino son la misma. Elige una distinta.");
    }
    var cat = rule.category ? cats[rule.category] : null;
    if (rule.category && !cat) out.push("La categoría de la regla ya no existe. Elige otra.");
    else if (cat && (rule.type === "income" || rule.type === "expense") && cat.kind !== rule.type) {
      out.push("La categoría «" + cat.name + "» es de " + KIND[cat.kind] + ", pero la regla registra un " + TYPE[rule.type] + ".");
    }
    var marks = merchants.marksOf(rule.description);
    for (var m = 0; m < marks.length; m++) {
      if (merchants.MARKS.indexOf(marks[m].mark) < 0) {
        out.push("La descripción usa " + marks[m].raw + ", que no existe. Usa {mes}, {año}, {original} o {comercio}.");
      }
      for (var f = 0; f < marks[m].filters.length; f++) {
        if (merchants.FILTERS.indexOf(marks[m].filters[f]) < 0) {
          out.push("El filtro «" + marks[m].filters[f] + "» de " + marks[m].raw + " no existe. Usa " + merchants.FILTERS.join(", ") + ".");
        }
      }
    }
  }
  for (var o = 0; o < all.length; o++) {
    var other = all[o];
    if (other.id === rule.id || other.paused) continue;
    if (
      parsers.norm(other.sender) === parsers.norm(rule.sender) &&
      parsers.norm(other.match) === parsers.norm(rule.match) &&
      (+other.amount || 0) === (+rule.amount || 0)
    ) {
      out.push("Busca lo mismo que " + quote(other) + ": solo una de las dos se aplica.");
    }
  }
  return out;
}

/** El movimiento con los nombres de su cuenta y categoría, para leerlo sin buscar ids. */
function named(tx, ctx) {
  var acc = ctx.allAccounts[tx.account];
  var to = ctx.allAccounts[tx.to_account];
  var cat = ctx.categoriesById[tx.category];
  return {
    type: tx.type,
    amount: tx.amount,
    date: tx.date,
    account: tx.account,
    account_name: acc ? acc.name : "",
    to_account: tx.to_account || "",
    to_account_name: to ? to.name : "",
    category: tx.category || "",
    category_name: cat ? cat.name : "",
    description: tx.description,
    tags: tx.tags || [],
  };
}

/** En qué difiere el movimiento guardado de lo que la regla crearía hoy. */
function differences(saved, tx, ctx) {
  var out = [];
  for (var i = 0; i < FIELDS.length; i++) {
    var f = FIELDS[i][0];
    var a = saved[f] === undefined || saved[f] === null ? "" : saved[f];
    var b = tx[f] === undefined || tx[f] === null ? "" : tx[f];
    if (f === "amount" ? Math.abs(+a - +b) < 0.005 : String(a) === String(b)) continue;
    var show = function (v) {
      if (f === "account" || f === "to_account") return (ctx.allAccounts[v] || {}).name || v || "(ninguna)";
      if (f === "category") return (ctx.categoriesById[v] || {}).name || v || "(ninguna)";
      if (f === "type") return TYPE[v] || v;
      return String(v === "" ? "(vacío)" : v);
    };
    out.push({ field: f, label: FIELDS[i][1], saved: a, rule: b, text: FIELDS[i][1] + ": " + show(a) + " → " + show(b) });
  }
  return out;
}

/**
 * Lo que haría la app hoy con cada correo, y el estado de cada regla.
 *
 * `ctx`:
 * - `accounts` (activas, con `senders` normalizados) y `categories`, como las
 *   de `inbox.load`;
 * - `allAccounts` (por id, con `name` y `archived`) y `categoriesById`;
 * - `rules`: todas, también las en pausa (con `paused`);
 * - `readSenders`: los remitentes que se leen de Gmail (normalizados), o null
 *   si no aplica;
 * - `state(id)`: lo que ya pasó con ese correo en la app:
 *   `{ status, inbox, transaction, saved }` (ver `load`).
 */
function inspect(mails, ctx) {
  var active = ctx.rules.filter(function (r) {
    return !r.paused;
  });
  var stats = {};
  for (var i = 0; i < ctx.rules.length; i++) stats[ctx.rules[i].id] = { won: 0, lost: 0, blocked: 0, beatenBy: {}, samples: [] };

  var messages = [];
  var summary = { read: mails.length, register: 0, discard: 0, pending: 0, withoutRule: 0, withProblems: 0, differ: 0 };

  for (var m = 0; m < mails.length; m++) {
    var mail = mails[m];
    var s = inbox.suggest(mail, { accounts: ctx.accounts, categories: ctx.categories, merchants: ctx.merchants || [], rules: active });
    var amount = s.parsed ? s.parsed.amount : 0;
    var hits = rules.matching(String(mail.subject || "") + "\n" + String(mail.text || ""), active, amount, mail.from);
    var winner = s.rule;
    var problems = [];
    var action;
    var lack = "";

    if (winner && winner.type === "discard") action = "descartar";
    else if (winner) {
      lack = inbox.missing(s.tx);
      action = lack ? "pendiente" : "registrar";
      if (lack) {
        problems.push(
          "La regla " +
            quote(winner) +
            " coincide, pero falta " +
            lack +
            ": el correo quedará pendiente." +
            (lack === "el valor"
              ? " No se leyó un monto en el texto; fija uno en la regla si siempre es el mismo."
              : lack === "la cuenta"
                ? " Elige la cuenta en la regla o agrega el remitente a una cuenta."
                : " Elige la cuenta de destino en la regla."),
        );
      }
    } else {
      action = "pendiente";
      summary.withoutRule++;
    }

    if (winner) {
      var ws = stats[winner.id];
      if (lack) ws.blocked++;
      else ws.won++;
      if (ws.samples.length < 5) ws.samples.push(mail.id);
      for (var h = 1; h < hits.length; h++) {
        var st = stats[hits[h].rule.id];
        if (st) {
          st.lost++;
          st.beatenBy[winner.id] = (st.beatenBy[winner.id] || 0) + 1;
        }
        if (hits[h].score === hits[0].score) {
          problems.push("También coincide " + quote(hits[h].rule) + " con la misma precisión. Gana " + quote(winner) + " porque se creó antes.");
        }
      }
    }

    if (action === "registrar" && s.tx.category && (s.tx.type === "income" || s.tx.type === "expense")) {
      var cat = ctx.categoriesById[s.tx.category];
      if (cat && cat.kind !== s.tx.type) {
        problems.push("El movimiento sería un " + TYPE[s.tx.type] + " con la categoría «" + cat.name + "», que es de " + KIND[cat.kind] + ".");
      }
    }

    // Si la lectura automática de Gmail trae este correo (null: no se sabe).
    var autoRead = ctx.readSenders && mail.from ? gmailReads(mail.from, ctx.readSenders) : null;
    if (autoRead === false && winner) {
      var dom = domainOf(mail.from);
      problems.push(
        "La lectura automática de Gmail no trae este correo: ningún remitente configurado es una palabra de «" +
          mail.from +
          "». Para que la regla " +
          quote(winner) +
          " se aplique, agrega " +
          (dom ? "«" + dom + "»" : "su dirección") +
          " a los remitentes de Gmail o de una cuenta.",
      );
    }

    var state = ctx.state ? ctx.state(mail.id) : { status: "nuevo" };
    var diff = [];
    if (state.saved && action === "registrar") {
      diff = differences(state.saved, s.tx, ctx);
      if (diff.length) {
        summary.differ++;
        problems.push("El movimiento registrado es distinto de lo que la regla crearía hoy (" + diff.map(function (d) { return d.text; }).join("; ") + ").");
      }
    }
    if (state.status === "descartado" && action === "registrar") {
      problems.push("Se descartó antes, pero hoy la regla " + quote(winner) + " lo registraría. Para traerlo de nuevo, lee Gmail otra vez con «again».");
    }
    if (state.saved && action === "descartar") {
      problems.push("Ya tiene un movimiento, pero hoy la regla " + quote(winner) + " lo descartaría.");
    }

    if (action === "registrar") summary.register++;
    else if (action === "descartar") summary.discard++;
    else summary.pending++;
    if (problems.length) summary.withProblems++;

    // Lo que haría la lectura automática: salta lo que ya está en la app
    // (bandeja, movimiento con ese external_id o descartado; ver inbox.seen).
    var onSync = state.status !== "nuevo" ? "omitir" : autoRead === false ? "no_lo_trae" : action;

    var labels = mail.labels || [];
    messages.push({
      id: mail.id,
      from: mail.from || "",
      subject: mail.subject || "",
      date: mail.date || "",
      labels: labels,
      trash: labels.indexOf("TRASH") >= 0,
      spam: labels.indexOf("SPAM") >= 0,
      status: state.status,
      autoRead: autoRead,
      onSync: onSync,
      inbox: state.inbox || "",
      transaction: state.transaction || "",
      parsed: s.parsed,
      rule: ref(winner),
      also: hits.slice(1).map(function (x) {
        return ref(x.rule);
      }),
      action: action,
      tx: action === "registrar" ? named(s.tx, ctx) : null,
      differences: diff,
      pattern: s.pattern,
      problems: problems,
      text: mail.text || "",
    });
  }

  var byRule = byId(ctx.rules);
  var ruleList = ctx.rules.map(function (r) {
    var st = stats[r.id];
    var problems = staticProblems(r, ctx, ctx.rules);
    if (!r.paused && mails.length) {
      if (!st.won && !st.blocked && !st.lost) problems.push("No coincidió con ninguno de los " + mails.length + " correos revisados.");
      else if (!st.won && !st.blocked && st.lost) {
        var names = Object.keys(st.beatenBy).map(function (id) {
          return quote(byRule[id] || { name: id });
        });
        problems.push("Coincide con " + st.lost + " correos, pero siempre gana otra regla: " + names.join(", ") + ".");
      }
      if (st.blocked) problems.push("Gana en " + st.blocked + " correos que quedan pendientes porque les falta un dato.");
    }
    return {
      id: r.id,
      name: r.name || "(sin nombre)",
      type: r.type || "",
      paused: !!r.paused,
      sender: r.sender || "",
      match: r.match || "",
      matches: st.won,
      pending: st.blocked,
      lost: st.lost,
      samples: st.samples,
      problems: problems,
      ok: !problems.length,
    };
  });
  summary.rules = ruleList.length;
  summary.rulesWithProblems = ruleList.filter(function (r) {
    return !r.ok;
  }).length;

  return { summary: summary, rules: ruleList, messages: messages };
}

// ---------- Los datos ----------

/** Una regla escrita a mano (sin guardar) con la forma de `rules.plain`. */
function draftRule(data) {
  var out = { id: String(data.id || "borrador"), paused: !!data.paused };
  var text = ["name", "sender", "match", "type", "account", "to_account", "category", "description", "notes"];
  for (var i = 0; i < text.length; i++) out[text[i]] = String(data[text[i]] || "").trim();
  out.amount = Math.max(0, +data.amount || 0);
  out.set_amount = Math.max(0, +data.set_amount || 0);
  out.tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
  if (!out.name) out.name = "Regla de prueba";
  return out;
}

/**
 * El contexto de `inspect` para un usuario. `draft`: una regla sin guardar
 * que se prueba junto a las demás (con el `id` de una existente, la reemplaza).
 */
function load(app, userId, draft) {
  var base = inbox.load(app, userId);
  var all = app.findRecordsByFilter("accounts", "owner = {:u}", "", 0, 0, { u: userId });
  var allAccounts = {};
  for (var i = 0; i < all.length; i++) allAccounts[all[i].id] = { id: all[i].id, name: all[i].getString("name"), archived: all[i].getBool("archived") };
  var list = app.findRecordsByFilter("rules", "owner = {:u}", "created", 0, 0, { u: userId }).map(rules.plain);
  if (draft) {
    var d = draftRule(draft);
    var at = -1;
    for (var j = 0; j < list.length; j++) if (list[j].id === d.id) at = j;
    if (at >= 0) list[at] = d;
    else list.push(d);
  }

  var readSenders = null;
  try {
    var conn = app.findFirstRecordByFilter("gmail_connections", "owner = {:u}", { u: userId });
    readSenders = require(__hooks + "/lib/sync.js").sendersOf(app, conn).map(parsers.norm).filter(Boolean);
  } catch (_) {
    // Sin Gmail: no se revisa qué remitentes se leen.
  }

  return {
    accounts: base.accounts,
    categories: base.categories,
    merchants: base.merchants,
    allAccounts: allAccounts,
    categoriesById: byId(base.categories),
    rules: list,
    readSenders: readSenders,
    state: function (externalId) {
      return stateOf(app, userId, externalId);
    },
  };
}

/** Qué pasó ya con un correo: nuevo, pendiente, procesado, registrado o descartado. */
function stateOf(app, userId, externalId) {
  var params = { u: userId, e: externalId };
  var out = { status: "nuevo", inbox: "", transaction: "", saved: null };
  try {
    var row = app.findFirstRecordByFilter("inbox", "owner = {:u} && external_id = {:e}", params);
    out.status = row.getString("status");
    out.inbox = row.id;
  } catch (_) {}
  try {
    var tx = app.findFirstRecordByFilter("transactions", "owner = {:u} && external_id = {:e}", params);
    out.transaction = tx.id;
    if (out.status === "nuevo") out.status = "registrado";
    out.saved = {
      type: tx.getString("type"),
      account: tx.getString("account"),
      to_account: tx.getString("to_account"),
      category: tx.getString("category"),
      amount: tx.getFloat("amount"),
      description: tx.getString("description"),
    };
  } catch (_) {}
  if (out.status === "nuevo" && require(__hooks + "/lib/ignored.js").ignored(app, userId, externalId)) out.status = "descartado";
  return out;
}

/** Máximo de correos que se leen de Gmail por petición: cada uno es una llamada. */
var MAX = 500;

/**
 * Correos de Gmail, incluidos la papelera y el spam. `opts`:
 * - `q`: búsqueda de Gmail; sin ella, la de los remitentes que se leen.
 * - `all`: sin filtro de remitentes (todo el correo).
 * - `days`: solo los de los últimos N días (0: sin límite).
 * - `max`, `pageToken`: para recorrer por páginas.
 */
function fromGmail(app, userId, opts) {
  var gmail = require(__hooks + "/lib/gmail.js");
  var sync = require(__hooks + "/lib/sync.js");
  var conn;
  try {
    conn = app.findFirstRecordByFilter("gmail_connections", "owner = {:u} && refresh_token != ''", { u: userId });
  } catch (_) {
    throw new BadRequestError("Primero conecta tu cuenta de Gmail en Ajustes → Gmail.");
  }
  var query = opts.q ? String(opts.q) : opts.all ? "" : gmail.queryFor(sync.sendersOf(app, conn));
  var days = Math.max(0, Math.floor(+opts.days || 0));
  if (days) query = (query ? query + " " : "") + "newer_than:" + days + "d";
  var max = Math.max(1, Math.min(MAX, Math.floor(+opts.max || 50)));

  var token;
  try {
    token = gmail.accessToken(conn.getString("refresh_token"));
  } catch (err) {
    throw new BadRequestError("No se pudo entrar a Gmail. Vuelve a conectarlo en Ajustes → Gmail. (" + (err && err.message ? err.message : err) + ")");
  }
  var ids = [];
  var next = opts.pageToken ? String(opts.pageToken) : "";
  var estimate = 0;
  do {
    var page = gmail.listPage(token, query, next, Math.min(500, max - ids.length));
    ids = ids.concat(page.ids);
    next = page.next;
    estimate = estimate || page.estimate;
  } while (next && ids.length < max);
  var mails = ids.slice(0, max).map(function (id) {
    return gmail.getMessage(token, id, parsers.htmlToText);
  });
  return { query: query, mails: mails, next: next, estimate: estimate };
}

/** Los correos guardados en la bandeja (también los de texto pegado). */
function fromInbox(app, userId, opts) {
  var max = Math.max(1, Math.min(2000, Math.floor(+opts.max || 500)));
  var filter = "owner = {:u}";
  var days = Math.max(0, Math.floor(+opts.days || 0));
  var params = { u: userId };
  if (days) {
    filter += " && date >= {:d}";
    params.d = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10) + " 00:00:00.000Z";
  }
  var rows = app.findRecordsByFilter("inbox", filter, "-date", max, 0, params);
  return {
    query: "",
    mails: rows.map(function (r) {
      return {
        id: r.getString("external_id"),
        from: r.getString("sender"),
        subject: r.getString("subject"),
        date: r.getString("date").slice(0, 10),
        text: r.getString("text"),
        labels: [],
      };
    }),
    next: "",
    estimate: rows.length,
  };
}

module.exports = { gmailReads: gmailReads, inspect: inspect, load: load, draftRule: draftRule, fromGmail: fromGmail, fromInbox: fromInbox };
