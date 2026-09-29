/**
 * La bandeja: de correos del banco a movimientos, con la persona decidiendo.
 *
 * Todo lo que llega (Gmail o texto pegado) entra a `inbox`. Si una regla lo
 * reconoce, el movimiento se crea solo con la plantilla de la regla y el
 * correo queda `procesado`. Si no, queda `pendiente` y la persona lo abre y
 * decide: descartarlo, crear el movimiento a mano (con lo que se leyó ya
 * puesto) o crear una regla para este y los que vengan.
 *
 * Una regla de tipo "discard" descarta: lo que la cumple no se vuelve
 * movimiento ni queda en la bandeja, y su id va a `ignored_imports` para no
 * volver a leerse.
 *
 * La cuenta se reconoce por el remitente: la primera cuya lista de
 * remitentes aparece en el "De:" del correo. Si dos cuentas comparten
 * remitente, gana la primera; la regla es la que dice cuál es.
 *
 * Cada correo trae un id estable (el de Gmail, o un hash del texto) que va a
 * `external_id` del correo y de su movimiento: así se encuentran, y leer dos
 * veces no duplica.
 */

var parsers = require(__hooks + "/lib/parsers.js");
var rules = require(__hooks + "/lib/rules.js");
var merchants = require(__hooks + "/lib/merchants.js");
var ignored = require(__hooks + "/lib/ignored.js");
var refs = require(__hooks + "/lib/refs.js");

function load(app, userId) {
  var categories = app.findRecordsByFilter("categories", "owner = {:u}", "name", 500, 0, { u: userId });
  return {
    accounts: refs.accounts(app, userId),
    categories: categories.map(function (c) {
      var cat = { id: c.id, name: c.getString("name"), kind: c.getString("kind"), keywords: c.getString("keywords") };
      // Partidas una vez, no una por mensaje.
      cat.keys = parsers.keywordsOf(cat);
      return cat;
    }),
    rules: rules.load(app, userId),
    merchants: merchants.load(app, userId),
  };
}

/** "Banco <alertas@banco.com>" -> "alertas@banco.com". */
function address(from) {
  var m = /<([^>]+)>/.exec(String(from || ""));
  return (m ? m[1] : String(from || "")).trim().toLowerCase();
}

/** La primera cuenta cuyo remitente aparece en el "De:" del correo. */
function accountBySender(from, accounts) {
  var who = parsers.norm(from);
  if (!who) return null;
  for (var i = 0; i < accounts.length; i++) {
    for (var j = 0; j < accounts[i].senders.length; j++) {
      if (who.indexOf(accounts[i].senders[j]) >= 0) return accounts[i];
    }
  }
  return null;
}

function fallbackCategory(cats, type) {
  var name = type === "income" ? "otros ingresos" : "otros gastos";
  for (var i = 0; i < cats.length; i++) if (parsers.norm(cats[i].name) === name) return cats[i];
  return null;
}

function fullText(mail) {
  return String(mail.subject || "") + "\n" + String(mail.text || "");
}

/**
 * Lo que se propone para un correo, sin guardar nada:
 * - `tx`: el movimiento, con la regla aplicada si alguna coincide.
 * - `rule`: esa regla, o null.
 * - `pattern`: con qué reconocer correos como este, para una regla nueva.
 * - `parsed`: lo que se leyó del texto (null si no trae un valor).
 */
function suggest(mail, ctx) {
  var parsed = parsers.parseMessage(mail);
  var type = parsed ? parsed.type : "expense";
  // Las terminaciones y llaves dicen la cuenta con certeza; si no, el remitente.
  var found = refs.resolve(parsed, fullText(mail), ctx.accounts);
  var acc = found.mine || accountBySender(mail.from, ctx.accounts);
  var other = found.other;
  if (!other && parsed && parsed.operation === "retiro" && type === "expense") other = refs.cash(ctx.accounts);
  if (other && acc && other.id === acc.id) other = null;
  // Sin comercio, la cuenta o llave de la otra persona hace de comercio: así
  // se le pone nombre con un alias y sirve {comercio}.
  var merchant = parsed ? parsed.merchant || found.counterparty : "";
  var original = parsed ? parsed.description : String(mail.subject || "").slice(0, 200);
  if (parsed && !parsed.merchant && found.counterparty) original = parsed.description + (type === "income" ? " de " : " a ") + found.counterparty;

  var category = null;
  var aliasCategory = "";
  // El alias del comercio pone el nombre y, si la tiene, la categoría (antes
  // que las palabras clave y que la de la regla). Una de otro tipo no vale.
  var alias = parsed ? merchants.find(merchant || parsed.description, ctx.merchants) : null;
  if (alias && alias.category) {
    for (var i = 0; i < ctx.categories.length; i++) {
      if (ctx.categories[i].id === alias.category && ctx.categories[i].kind === type) category = ctx.categories[i];
    }
    if (category) aliasCategory = category.id;
  }
  if (parsed && !category) {
    category = parsers.categorize(merchant + " " + parsed.description + " " + (mail.subject || ""), type, ctx.categories);
    if (!category) category = fallbackCategory(ctx.categories, type);
  }
  var base = {
    type: type,
    amount: parsed ? parsed.amount : 0,
    date: parsed ? parsed.date : mail.date ? String(mail.date).slice(0, 10) : parsers.today(),
    account: acc ? acc.id : "",
    to_account: "",
    category: category ? category.id : "",
    // Con alias, su nombre; la regla puede cambiarla con {original} o {comercio}.
    description: alias ? alias.name : original,
    original: original,
    merchant: merchant,
    merchantName: alias ? alias.name : "",
    aliasCategory: aliasCategory,
    accountKnown: !!found.mine,
    notes: "",
    tags: parsed && parsed.bank ? [parsers.norm(parsed.bank)] : [],
    accountUnknown: !acc,
  };
  // A otra cuenta propia: es una transferencia, sin categoría.
  if (other && acc) {
    var income = type === "income";
    base.type = "transfer";
    base.account = income ? other.id : acc.id;
    base.to_account = income ? acc.id : other.id;
    base.category = "";
    base.aliasCategory = "";
    base.accountKnown = true;
    base.ownTransfer = true;
    if (!alias) {
      var op = parsed.operation;
      base.description =
        op === "retiro" ? "Retiro en cajero" : income ? "Transferencia desde " + other.name : (op === "pago" ? "Pago de " : "Transferencia a ") + other.name;
    }
  }
  var rejected = !!(parsed && parsed.rejected);
  // Lo rechazado no pasó: se descarta aunque una regla lo reconozca.
  var rule = !rejected && ctx.rules.length ? rules.find(fullText(mail), ctx.rules, base.amount, mail.from) : null;
  return {
    parsed: parsed
      ? {
          amount: parsed.amount,
          type: parsed.type,
          description: parsed.description,
          merchant: parsed.merchant,
          bank: parsed.bank,
          operation: parsed.operation,
          rejected: parsed.rejected,
          refs: parsed.refs,
        }
      : null,
    rule: rule,
    rejected: rejected,
    tx: rule && !discards(rule) ? withRule(rule, base) : strip(base),
    pattern: { sender: address(mail.from), match: parsed && parsed.merchant ? parsed.merchant : "" },
    // El comercio que se leyó y su alias, para ponerle nombre desde la bandeja.
    merchant: {
      text: merchant,
      alias: alias ? { id: alias.id, name: alias.name, match: alias.match, category: alias.category } : null,
    },
  };
}

/** Si la regla descarta los correos en vez de volverlos movimiento. */
function discards(rule) {
  return !!rule && rule.type === "discard";
}

function strip(base) {
  return {
    type: base.type,
    amount: base.amount,
    date: base.date,
    account: base.account,
    to_account: base.to_account,
    category: base.category,
    description: base.description,
    original: base.original,
    merchant: base.merchant,
    merchantName: base.merchantName,
    notes: base.notes,
    tags: base.tags,
    rule: "",
  };
}

/**
 * La plantilla de la regla sobre lo leído del correo; la fecha, la del correo.
 * Las etiquetas son solo las de la regla: si se le quitaron todas, el
 * movimiento no lleva ninguna (ni la del banco que se leyó).
 */
function withRule(rule, base) {
  var out = rules.apply(rule, Object.assign({}, base, { tags: [] }));
  out.date = base.date;
  out.rule = rule.id || "";
  return out;
}

/** Lo que le falta a un movimiento para poder guardarse, o "" si nada. */
function missing(tx) {
  if (!(tx.amount > 0)) return "el valor";
  if (!tx.account) return "la cuenta";
  if (tx.type === "transfer" && !tx.to_account) return "la cuenta de destino";
  return "";
}

/** Un correo de la bandeja como mensaje, igual que llega de Gmail. */
function mailOf(row) {
  return {
    id: row.getString("external_id"),
    from: row.getString("sender"),
    subject: row.getString("subject"),
    date: row.getString("date").slice(0, 10),
    text: row.getString("text"),
  };
}

function txOf(app, userId, externalId) {
  try {
    return app.findFirstRecordByFilter("transactions", "owner = {:u} && external_id = {:e}", { u: userId, e: externalId });
  } catch (_) {
    return null;
  }
}

function inboxOf(app, userId, externalId) {
  try {
    return app.findFirstRecordByFilter("inbox", "owner = {:u} && external_id = {:e}", { u: userId, e: externalId });
  } catch (_) {
    return null;
  }
}

/** Si ese correo ya se leyó: está en la bandeja, ya es movimiento o se descartó. */
function seen(app, userId, externalId) {
  return !!inboxOf(app, userId, externalId) || ignored.known(app, userId, externalId);
}

/**
 * Guarda el movimiento de un correo: lo crea, o actualiza el que ya tiene.
 * El texto del correo queda en `raw` tal como llegó.
 */
function saveTx(app, userId, tx, mail, source) {
  var r = txOf(app, userId, mail.id);
  if (!r) {
    r = new Record(app.findCollectionByNameOrId("transactions"));
    r.set("owner", userId);
    r.set("source", source || "gmail");
    r.set("external_id", mail.id);
    r.set("raw", fullText(mail).trim().slice(0, 4000));
  }
  r.set("type", tx.type);
  r.set("date", tx.date + " 12:00:00.000Z");
  r.set("account", tx.account);
  r.set("to_account", tx.type === "transfer" ? tx.to_account : "");
  r.set("category", tx.type === "transfer" ? "" : tx.category);
  r.set("amount", tx.amount);
  r.set("description", String(tx.description || "").slice(0, 200));
  r.set("notes", String(tx.notes || "").slice(0, 5000));
  r.set("rule", tx.rule || "");
  r.set("tags", tx.tags || []);
  app.save(r);
  return r;
}

/**
 * Mete los correos a la bandeja. Los que una regla reconoce se vuelven
 * movimiento de una vez.
 * @returns {{ created: number, pending: number, skipped: number }}
 */
function ingest(app, userId, mails, opts) {
  opts = opts || {};
  var ctx = load(app, userId);
  var col = app.findCollectionByNameOrId("inbox");
  // El texto con formato llegó en una migración posterior: sin ella, no se guarda.
  var hasRich = !!col.fields.getByName("rich");
  var out = { created: 0, pending: 0, skipped: 0 };
  for (var i = 0; i < mails.length; i++) {
    var mail = mails[i];
    if (seen(app, userId, mail.id)) {
      out.skipped++;
      continue;
    }
    var s = suggest(mail, ctx);
    if (discards(s.rule) || s.rejected) {
      ignored.remember(app, userId, mail.id);
      out.skipped++;
      continue;
    }
    var row = new Record(col);
    row.set("owner", userId);
    row.set("external_id", mail.id);
    row.set("source", opts.source || "gmail");
    row.set("sender", String(mail.from || "").slice(0, 300));
    row.set("subject", String(mail.subject || "").slice(0, 500));
    row.set("date", s.tx.date + " 12:00:00.000Z");
    row.set("text", String(mail.text || "").slice(0, 20000));
    if (hasRich && mail.rich) row.set("rich", String(mail.rich).slice(0, 30000));
    row.set("parsed", s.parsed);
    row.set("status", "pendiente");
    if (s.rule && !missing(s.tx)) {
      try {
        saveTx(app, userId, s.tx, mail, opts.source);
        row.set("status", "procesado");
        row.set("rule", s.rule.id);
      } catch (err) {
        // Si no se puede guardar, que lo decida la persona.
        console.log("[finanzas] bandeja " + mail.id + ": " + err);
      }
    }
    app.save(row);
    if (row.getString("status") === "procesado") out.created++;
    else out.pending++;
  }
  return out;
}

/**
 * Pasa las reglas por lo pendiente. Con `report` ({ changes: [] }), anota qué
 * pasó con cada correo. @returns {number} cuántos se volvieron movimiento o se
 * descartaron
 */
function processPending(app, userId, report) {
  var ctx = load(app, userId);
  var rows = app.findRecordsByFilter("inbox", "owner = {:u} && status = 'pendiente'", "date", 0, 0, { u: userId });
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    var mail = mailOf(rows[i]);
    var s = suggest(mail, ctx);
    var note = { inbox: rows[i].id, date: mail.date, subject: mail.subject, rule: s.rule ? s.rule.name : "" };
    if (discards(s.rule) || s.rejected) {
      // Al borrarlo queda en ignored_imports (ver main.pb.js).
      app.delete(rows[i]);
      if (report) report.changes.push(Object.assign(note, { action: "descartar", reason: s.rejected ? "El aviso dice que la operación fue rechazada." : "" }));
      n++;
      continue;
    }
    if (!s.rule || missing(s.tx)) continue;
    saveTx(app, userId, s.tx, mail, rows[i].getString("source"));
    rows[i].set("status", "procesado");
    rows[i].set("rule", s.rule.id);
    app.save(rows[i]);
    if (report) report.changes.push(Object.assign(note, { action: "registrar", tx: s.tx }));
    n++;
  }
  return n;
}

/**
 * Los procesados cuyo movimiento se borró vuelven a quedar por decidir, sin
 * regla. @returns {number} cuántos
 */
function reopen(app, userId) {
  var rows = app.findRecordsByFilter("inbox", "owner = {:u} && status = 'procesado'", "", 0, 0, { u: userId });
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    var ext = rows[i].getString("external_id");
    if (txOf(app, userId, ext)) continue;
    ignored.forget(app, userId, ext);
    rows[i].set("status", "pendiente");
    rows[i].set("rule", "");
    app.save(rows[i]);
    n++;
  }
  return n;
}

/**
 * Aplica una regla (guardada o no) a un correo de la bandeja, coincida o no:
 * la persona lo pidió para ese correo. Si ya tenía movimiento, lo actualiza.
 */
function applyRule(app, userId, row, rule) {
  if (discards(rule)) {
    // Uno pendiente se descarta; uno ya procesado conserva su movimiento.
    if (row.getString("status") === "pendiente") app.delete(row);
    return null;
  }
  var ctx = load(app, userId);
  var mail = mailOf(row);
  var base = suggest(mail, { accounts: ctx.accounts, categories: ctx.categories, merchants: ctx.merchants, rules: [] });
  var tx = withRule(rule, Object.assign({ accountUnknown: !base.tx.account }, base.tx));
  var lack = missing(tx);
  if (lack) throw new BadRequestError("Falta " + lack + " para crear el movimiento.");
  saveTx(app, userId, tx, mail, row.getString("source"));
  row.set("status", "procesado");
  row.set("rule", rule.id || "");
  app.save(row);
  return tx;
}

/**
 * Vuelve a crear, desde su correo, los movimientos de una regla: los que
 * creó y los procesados que la cumplen. Así el valor y la descripción salen
 * del correo y no de lo que el movimiento tenga hoy. Los que se borraron no
 * vuelven. @returns {number} cuántos
 */
function reapply(app, userId, rule) {
  if (discards(rule)) return 0;
  var rows = app.findRecordsByFilter("inbox", "owner = {:u} && status = 'procesado'", "", 0, 0, { u: userId });
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    var mail = mailOf(rows[i]);
    var parsed = null;
    try {
      parsed = JSON.parse(rows[i].getString("parsed") || "null");
    } catch (_) {}
    var amount = parsed && parsed.amount ? parsed.amount : 0;
    if (rows[i].getString("rule") !== rule.id && !rules.find(fullText(mail), [rule], amount, mail.from)) continue;
    if (!txOf(app, userId, mail.id)) continue;
    try {
      applyRule(app, userId, rows[i], rule);
      n++;
    } catch (err) {
      // Si con la regla nueva le falta algo, se queda como estaba.
    }
  }
  return n;
}

/** Que el registro exista y sea de la persona; si no, un error. */
function mine(app, collection, id, userId) {
  var r;
  try {
    r = app.findRecordById(collection, id);
  } catch (_) {
    throw new NotFoundError("No se encontró.");
  }
  if (r.getString("owner") !== userId) throw new NotFoundError("No se encontró.");
  return r;
}

var RULE_FIELDS = ["name", "sender", "match", "type", "account", "to_account", "category", "description", "notes"];

/**
 * Guarda una regla desde la bandeja o desde Ajustes. `body`:
 * - `rule`: los campos (con `id` para editar una).
 * - `inbox`: el correo desde el que se crea o edita (opcional).
 * - `scope`: "rule" guarda la regla, la aplica a ese correo, a lo pendiente
 *   y --si ya existía-- a lo que ya había creado; "this" solo cambia el
 *   movimiento de ese correo, sin tocar la regla.
 * - `apply`: con "rule", aplicarla también a lo ya guardado (por defecto sí).
 */
function saveRule(app, userId, body) {
  var data = body.rule || {};
  var row = body.inbox ? mine(app, "inbox", String(body.inbox), userId) : null;
  var clean = {};
  for (var i = 0; i < RULE_FIELDS.length; i++) clean[RULE_FIELDS[i]] = String(data[RULE_FIELDS[i]] || "").trim();
  clean.amount = Math.max(0, +data.amount || 0);
  clean.set_amount = Math.max(0, +data.set_amount || 0);
  clean.tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
  clean.paused = !!data.paused;
  if (["income", "expense", "transfer", "discard"].indexOf(clean.type) < 0) clean.type = "";
  if (clean.type === "discard") {
    // Descartar no crea nada: la plantilla sobra.
    clean.account = clean.to_account = clean.category = clean.description = clean.notes = "";
    clean.set_amount = 0;
    clean.tags = [];
  }
  if (clean.type !== "transfer") clean.to_account = "";
  if (clean.type === "transfer") clean.category = "";
  if (clean.account) mine(app, "accounts", clean.account, userId);
  if (clean.to_account) mine(app, "accounts", clean.to_account, userId);
  if (clean.category) mine(app, "categories", clean.category, userId);
  if (clean.to_account && clean.to_account === clean.account) throw new BadRequestError("La cuenta de destino debe ser otra.");

  if (body.scope === "this") {
    if (!row) throw new BadRequestError("Falta el correo.");
    clean.id = "";
    applyRule(app, userId, row, clean);
    return { rule: "", created: 1, updated: 0, pending: 0 };
  }

  if (!clean.name) throw new BadRequestError("Escribe el nombre de la regla.");
  if (!clean.sender && !clean.match) throw new BadRequestError("Escribe el remitente o un texto que deba tener el correo.");
  var existed = !!data.id;
  var rec = existed ? mine(app, "rules", String(data.id), userId) : new Record(app.findCollectionByNameOrId("rules"));
  rec.set("owner", userId);
  for (var k in clean) rec.set(k, clean[k]);
  app.save(rec);
  var rule = rules.plain(rec);

  if (discards(rule)) {
    var discarded = 0;
    if (row && !clean.paused && row.getString("status") === "pendiente") {
      applyRule(app, userId, row, rule);
      discarded++;
    }
    if (!clean.paused) discarded += processPending(app, userId);
    return { rule: rec.id, created: 0, updated: 0, pending: 0, discarded: discarded };
  }

  var created = 0;
  if (row && !clean.paused) {
    applyRule(app, userId, row, rule);
    created++;
  }
  var updated = 0;
  if (existed && body.apply !== false && !clean.paused) {
    updated = discards(rule) ? 0 : reapply(app, userId, rule) + rules.applyExisting(app, userId, rec.id);
  }
  var pending = clean.paused ? 0 : processPending(app, userId);
  return { rule: rec.id, created: created, updated: updated, pending: pending };
}

/** Lo que se propone para un correo de la bandeja, para llenar el formulario. */
function suggestFor(app, userId, id) {
  var row = mine(app, "inbox", id, userId);
  var ctx = load(app, userId);
  var s = suggest(mailOf(row), ctx);
  // Si ya se procesó con una regla que hoy está en pausa o cambió, se
  // muestra esa regla igual: fue la que se usó.
  var ruleId = row.getString("rule") || (s.rule ? s.rule.id : "");
  var rule = null;
  if (ruleId) {
    try {
      rule = rules.plain(app.findRecordById("rules", ruleId));
    } catch (_) {
      rule = null;
    }
  }
  var tx = txOf(app, userId, row.getString("external_id"));
  return {
    tx: s.tx,
    parsed: s.parsed,
    pattern: s.pattern,
    merchant: s.merchant,
    rule: rule,
    transaction: tx ? tx.id : "",
  };
}

/**
 * Un id estable para un texto pegado a mano: el mismo texto da el mismo id,
 * así que pegarlo otra vez no duplica.
 */
function textId(text) {
  return "txt:" + $security.sha256(parsers.norm(text)).slice(0, 32);
}

/** Parte un bloque pegado en mensajes: uno por párrafo (o por línea si no hay párrafos). */
function splitText(text) {
  var blocks = String(text || "")
    .split(/\n\s*\n/)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  if (blocks.length === 1) {
    var lines = blocks[0]
      .split(/\n/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    // Varias líneas con importe cada una: una notificación por línea.
    var withAmount = lines.filter(function (l) {
      return /\$\s?\d/.test(l);
    });
    if (withAmount.length > 1 && withAmount.length === lines.length) blocks = lines;
  }
  return blocks;
}

module.exports = {
  load: load,
  address: address,
  accountBySender: accountBySender,
  suggest: suggest,
  missing: missing,
  seen: seen,
  ingest: ingest,
  processPending: processPending,
  reopen: reopen,
  saveRule: saveRule,
  suggestFor: suggestFor,
  textId: textId,
  splitText: splitText,
};
