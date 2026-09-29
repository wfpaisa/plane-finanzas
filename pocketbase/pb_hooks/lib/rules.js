/**
 * Reglas del usuario: plantillas con nombre. "Si el correo viene de X y dice
 * Y, es tal movimiento".
 *
 * Se consultan al leer la bandeja (ver inbox.js): si una coincide, el correo
 * se vuelve movimiento solo, con lo que diga la plantilla --tipo, cuentas,
 * categoría, descripción, etiquetas y notas--. La fecha siempre es la del
 * correo y el valor también, salvo que la regla fije uno (`set_amount`).
 * También se pueden aplicar a lo que ya está guardado.
 *
 * Cuándo coincide: el remitente (`sender`, si lo tiene) debe aparecer en el
 * "De:" del correo, y alguno de los textos (`match`, si tiene) en el correo.
 * Si coinciden varias gana la más precisa: la que exige un valor (`amount`),
 * luego la de texto más largo, y el remitente desempata. Una regla con solo
 * remitente es la de "todo lo de este banco" y pierde con cualquiera con texto.
 */

var parsers = require(__hooks + "/lib/parsers.js");
var merchants = require(__hooks + "/lib/merchants.js");
var refs = require(__hooks + "/lib/refs.js");

function listOf(text) {
  return String(text || "")
    .split(",")
    .map(function (k) {
      return parsers.norm(k);
    })
    .filter(Boolean);
}

function keysOf(rule) {
  return listOf(rule.match);
}

function sendersOf(rule) {
  return listOf(rule.sender);
}

/** Si el valor de la regla (0: cualquiera) coincide con el del movimiento. */
function amountMatches(rule, amount) {
  var want = +rule.amount || 0;
  return !want || Math.abs(want - Math.abs(+amount || 0)) < 0.005;
}

/**
 * Qué tan bien le queda una regla a un correo: 0 si no le queda. `hay` y
 * `who` ya vienen comparables (ver `find`).
 */
function score(rule, hay, who, amount) {
  if (rule.paused || !amountMatches(rule, amount)) return 0;
  var senders = rule.senders || sendersOf(rule);
  var keys = rule.keys || keysOf(rule);
  if (!senders.length && !keys.length) return 0;
  var fromOk = false;
  for (var i = 0; i < senders.length; i++) if (who.indexOf(senders[i]) >= 0) fromOk = true;
  if (senders.length && !fromOk) return 0;
  var len = 0;
  for (var j = 0; j < keys.length; j++) {
    if (hay.indexOf(keys[j]) >= 0 && keys[j].length > len) len = keys[j].length;
  }
  if (keys.length && !len) return 0;
  // El valor pesa más que cualquier texto, y el texto más que el remitente.
  return (+rule.amount ? 100000 : 0) + (len ? 1000 + len : 0) + (senders.length ? 1 : 0);
}

/** La regla que le toca a un texto con su valor y remitente, o null. */
function find(text, rules, amount, from) {
  var hay = " " + parsers.norm(text) + " ";
  var who = parsers.norm(from);
  var best = null;
  var bestScore = 0;
  for (var i = 0; i < rules.length; i++) {
    var sc = score(rules[i], hay, who, amount);
    if (sc > bestScore) {
      best = rules[i];
      bestScore = sc;
    }
  }
  return best;
}

/**
 * Todas las reglas que le quedan a un texto, de la más precisa a la menos,
 * con su puntaje: la primera es la que `find` elige (a igual puntaje, la que
 * va antes en la lista).
 */
function matching(text, rules, amount, from) {
  var hay = " " + parsers.norm(text) + " ";
  var who = parsers.norm(from);
  var out = [];
  for (var i = 0; i < rules.length; i++) {
    var sc = score(rules[i], hay, who, amount);
    if (sc > 0) out.push({ rule: rules[i], score: sc, order: i });
  }
  out.sort(function (a, b) {
    return b.score - a.score || a.order - b.order;
  });
  return out;
}

/**
 * La descripción de la regla con sus marcas resueltas; `date` es "AAAA-MM-DD".
 * `comercio`: el que se leyó del correo; `alias`: su nombre limpio, que no
 * pasa por los filtros. Ver merchants.js para las marcas y los filtros.
 */
function render(template, date, original, comercio, alias) {
  return merchants.render(template, date, { original: original, comercio: comercio, alias: alias });
}

/**
 * Lo que la regla hace con un movimiento. `tx` trae type, date, account,
 * to_account, amount, description, notes, category y tags; devuelve los
 * mismos campos (menos la fecha) ya ajustados. Lo que la regla no dice se
 * queda como venía.
 *
 * Lo que el aviso dice con certeza gana a la regla, que queda como valor por
 * defecto: la cuenta nombrada por su terminación o llave (`accountKnown`),
 * la transferencia a otra cuenta propia (`ownTransfer`) y la categoría del
 * alias del comercio (`aliasCategory`). Así una regla general por banco sirve
 * para todas sus tarjetas y comercios.
 */
function apply(rule, tx) {
  var own = !!tx.ownTransfer && rule.type !== "discard";
  var out = {
    type: own ? "transfer" : rule.type || tx.type,
    account: tx.accountKnown ? tx.account : rule.account || tx.account || "",
    to_account: tx.to_account || "",
    amount: +rule.set_amount > 0 ? +rule.set_amount : +tx.amount || 0,
    category: tx.category || "",
    tags: (tx.tags || []).slice(),
    description: tx.description || "",
    notes: tx.notes || "",
  };
  if (out.type === "transfer") {
    out.to_account = own ? tx.to_account : rule.to_account || out.to_account;
    // Volverlo transferencia sin destino, o a la misma cuenta, no vale: se
    // queda como venía.
    if (tx.type !== "transfer" && (!out.to_account || out.to_account === out.account)) {
      out.type = tx.type;
      out.to_account = "";
    }
  } else {
    out.to_account = "";
  }

  var known = false;
  if (out.type === "transfer") {
    // Una transferencia no lleva categoría.
    out.category = "";
    known = true;
  } else if (rule.category) {
    out.category = tx.aliasCategory && out.type === tx.type ? tx.aliasCategory : rule.category;
    known = true;
  } else if (out.type !== tx.type) {
    // La del otro tipo ya no vale.
    out.category = "";
  }
  // Ya se sabe qué es: deja de estar por revisar, salvo que falte la cuenta.
  if (known) {
    out.tags = out.tags.filter(function (t) {
      return t !== "revisar" || (tx.accountUnknown && !rule.account);
    });
  }
  var ruleTags = rule.tags || [];
  for (var i = 0; i < ruleTags.length; i++) {
    // Igual que las escribe TagInput: en minúscula y sin comas.
    var t = String(ruleTags[i]).trim().toLowerCase().replace(/,/g, "");
    if (t && out.tags.indexOf(t) < 0) out.tags.push(t);
  }
  // `original`: lo que se leyó del correo, aunque el alias del comercio ya haya
  // puesto su nombre en la descripción.
  var original = tx.original || tx.description || "";
  if (rule.description) {
    var next = render(rule.description, tx.date, original, tx.merchant || "", tx.merchantName || "");
    if (next) out.description = next;
  }
  var ruleNotes = String(rule.notes || "").trim();
  if (ruleNotes && out.notes.indexOf(ruleNotes) < 0) out.notes = out.notes ? out.notes + "\n" + ruleNotes : ruleNotes;
  return out;
}

function jsonList(record, field) {
  try {
    var v = JSON.parse(record.getString(field) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

/** Un registro de regla como objeto simple, con sus textos ya partidos. */
function plain(r) {
  var rule = {
    id: r.id,
    name: r.getString("name"),
    sender: r.getString("sender"),
    match: r.getString("match"),
    amount: r.getFloat("amount"),
    type: r.getString("type"),
    account: r.getString("account"),
    to_account: r.getString("to_account"),
    set_amount: r.getFloat("set_amount"),
    category: r.getString("category"),
    tags: jsonList(r, "tags"),
    description: r.getString("description"),
    notes: r.getString("notes"),
    paused: r.getBool("paused"),
  };
  rule.keys = keysOf(rule);
  rule.senders = sendersOf(rule);
  return rule;
}

/**
 * Las reglas activas de un usuario, como objetos simples. Con sus textos ya
 * partidos: al aplicarlas a todo lo guardado se consultan miles de veces.
 */
function load(app, userId) {
  return app.findRecordsByFilter("rules", "owner = {:u} && paused = false", "created", 500, 0, { u: userId }).map(plain);
}

/** De cada correo de la bandeja, su remitente: los movimientos no lo guardan. */
function sendersByExternalId(app, userId) {
  var out = {};
  var rows = app.findRecordsByFilter("inbox", "owner = {:u}", "", 0, 0, { u: userId });
  for (var i = 0; i < rows.length; i++) out[rows[i].getString("external_id")] = rows[i].getString("sender");
  return out;
}

/** La regla sin lo que cambia el movimiento en sí: tipo, cuentas y valor. */
function onlyLabels(rule) {
  var out = {};
  for (var k in rule) out[k] = rule[k];
  out.type = "";
  out.account = "";
  out.to_account = "";
  out.set_amount = 0;
  return out;
}

/** Lo que cambió, campo por campo, para el informe de `applyExisting`. */
function changesOf(before, after) {
  var out = {};
  var keys = ["type", "account", "to_account", "amount", "category", "description", "notes"];
  for (var i = 0; i < keys.length; i++) {
    if (after[keys[i]] !== before[keys[i]]) out[keys[i]] = { from: before[keys[i]], to: after[keys[i]] };
  }
  if (after.tags.join(",") !== before.tags.join(",")) out.tags = { from: before.tags, to: after.tags };
  return out;
}

/**
 * Aplica las reglas a lo ya guardado. Con `ruleId`, solo esa regla. Busca en
 * la descripción, las notas y el texto original del correo. A lo importado
 * le aplica la plantilla completa; a lo anotado a mano, solo categoría,
 * etiquetas, descripción y notas: el tipo, la cuenta y el valor que alguien
 * escribió no se tocan. Con `report` ({ changes: [] }), anota cada cambio.
 * @returns {number} cuántos movimientos cambiaron
 */
function applyExisting(app, userId, ruleId, report) {
  // Las que descartan son para los correos: no cambian movimientos.
  var rules = load(app, userId).filter(function (r) {
    return (!ruleId || r.id === ruleId) && r.type !== "discard";
  });
  if (!rules.length) return 0;
  var withSender = rules.some(function (r) {
    return r.senders.length;
  });
  var senders = withSender ? sendersByExternalId(app, userId) : {};
  var aliases = merchants.load(app, userId);
  var accounts = refs.accounts(app, userId);
  var kinds = {};
  var cats = app.findRecordsByFilter("categories", "owner = {:u}", "", 0, 0, { u: userId });
  for (var c = 0; c < cats.length; c++) kinds[cats[c].id] = cats[c].getString("kind");
  var list = app.findRecordsByFilter("transactions", "owner = {:u}", "", 0, 0, { u: userId });
  var changed = 0;
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    var ext = r.getString("external_id");
    var text = r.getString("description") + " " + r.getString("notes") + " " + r.getString("raw");
    var rule = find(text, rules, r.getFloat("amount"), senders[ext] || "");
    if (!rule) continue;
    var before = {
      type: r.getString("type"),
      date: r.getString("date").slice(0, 10),
      account: r.getString("account"),
      to_account: r.getString("to_account"),
      amount: r.getFloat("amount"),
      description: r.getString("description"),
      notes: r.getString("notes"),
      category: r.getString("category"),
      tags: jsonList(r, "tags"),
    };
    var alias = merchants.find(before.description, aliases);
    if (alias) {
      before.merchantName = alias.name;
      if (alias.category && kinds[alias.category] === before.type) before.aliasCategory = alias.category;
    }
    var imported = ext && (r.getString("source") === "gmail" || r.getString("source") === "texto");
    if (imported) {
      // Lo que el aviso dice con certeza también gana aquí (ver `apply`).
      var raw = r.getString("raw");
      var parsed = parsers.parseMessage({ text: raw });
      var found = refs.resolve(parsed, raw, accounts);
      if (found.mine || found.other) before.accountKnown = true;
      if (before.type === "transfer" && (found.other || (parsed && parsed.operation === "retiro"))) before.ownTransfer = true;
    }
    var after = apply(imported ? rule : onlyLabels(rule), before);
    var same =
      after.type === before.type &&
      after.account === before.account &&
      after.to_account === before.to_account &&
      after.amount === before.amount &&
      after.category === before.category &&
      after.description === before.description &&
      after.notes === before.notes &&
      after.tags.join(",") === before.tags.join(",");
    // Aunque no cambie nada, queda la marca de la regla: así se ve también en
    // lo que ya estaba como la regla lo habría dejado.
    if (same) {
      if (r.getString("rule") !== rule.id) {
        r.set("rule", rule.id);
        app.save(r);
      }
      continue;
    }
    if (report) report.changes.push({ id: r.id, date: before.date, rule: rule.id, changes: changesOf(before, after) });
    r.set("rule", rule.id);
    r.set("type", after.type);
    r.set("account", after.account);
    r.set("to_account", after.to_account);
    r.set("amount", after.amount);
    r.set("category", after.category);
    r.set("tags", after.tags);
    r.set("description", after.description.slice(0, 200));
    // El largo del campo (5000): cortar antes borraba el final de notas largas.
    r.set("notes", after.notes.slice(0, 5000));
    app.save(r);
    changed++;
  }
  return changed;
}

module.exports = { find: find, matching: matching, render: render, apply: apply, plain: plain, load: load, applyExisting: applyExisting };
