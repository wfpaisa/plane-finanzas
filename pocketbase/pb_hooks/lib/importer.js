/**
 * De notificaciones a transacciones.
 *
 * Lo usan la sincronización de Gmail y el "pegar texto" de la pantalla de
 * importar. Cada mensaje trae un id estable (el de Gmail, o un hash del
 * texto) que termina en `external_id`: importar dos veces no duplica.
 */

var parsers = require(__hooks + "/lib/parsers.js");
var rules = require(__hooks + "/lib/rules.js");

function load(app, userId) {
  var accounts = app.findRecordsByFilter("accounts", "owner = {:u} && archived = false", "sort,created", 500, 0, { u: userId });
  var categories = app.findRecordsByFilter("categories", "owner = {:u}", "name", 500, 0, { u: userId });
  var plainAccounts = accounts.map(function (a) {
    return { id: a.id, name: a.getString("name"), match_keys: a.getString("match_keys") + "," + a.getString("bank") };
  });
  var plainCats = categories.map(function (c) {
    var cat = { id: c.id, name: c.getString("name"), kind: c.getString("kind"), keywords: c.getString("keywords") };
    // Partidas una vez, no una por mensaje.
    cat.keys = parsers.keywordsOf(cat);
    return cat;
  });
  return { accounts: plainAccounts, categories: plainCats, rules: rules.load(app, userId) };
}

function fallbackCategory(cats, type) {
  var name = type === "income" ? "otros ingresos" : "otros gastos";
  for (var i = 0; i < cats.length; i++) if (parsers.norm(cats[i].name) === name) return cats[i];
  return null;
}

/**
 * Lo que se crearía para un mensaje, sin guardar nada.
 * `defaultAccount` es la cuenta a usar cuando no se reconoce ninguna.
 */
function plan(mail, ctx, defaultAccount) {
  var parsed = parsers.parseMessage(mail);
  if (!parsed) return null;

  var tags = [];
  var match = parsers.matchAccount(parsed, ctx.accounts);
  var account = match ? match.account : null;
  if (!account && defaultAccount) {
    for (var i = 0; i < ctx.accounts.length; i++) if (ctx.accounts[i].id === defaultAccount) account = ctx.accounts[i];
  }
  var accountUnknown = !account;
  if (!account) {
    account = ctx.accounts[0] || null;
    tags.push("revisar");
  }

  var type = parsed.type;
  var toAccount = null;
  // "Transferiste ... desde *1234 a la cuenta *5678", o "a la llave @ana123":
  // si el destino también es mío, es un movimiento entre cuentas y no un gasto.
  if (type === "expense" && account) {
    var other = parsed.last4.length >= 2 ? parsers.matchAccount({ last4: parsed.last4.slice(1), bank: null }, ctx.accounts) : null;
    if (!other || other.account.id === account.id) other = parsers.matchKeyInText((mail.subject || "") + " " + (mail.text || ""), ctx.accounts, account.id);
    if (other && other.account.id !== account.id) {
      type = "transfer";
      toAccount = other.account;
    }
  }

  var category = null;
  if (type !== "transfer") {
    category = parsers.categorize(parsed.merchant + " " + parsed.description + " " + (mail.subject || ""), type, ctx.categories);
    if (!category) {
      category = fallbackCategory(ctx.categories, type);
      if (tags.indexOf("revisar") < 0) tags.push("revisar");
    }
  }
  if (parsed.bank) tags.push(parsers.norm(parsed.bank));

  // Una regla del usuario manda sobre las palabras clave: categoría,
  // etiquetas y una descripción legible, con el texto del banco a las notas.
  var description = parsed.description;
  // Entre cuentas propias, sin comercio: "Pago Mastercard" dice más que "Pagaste".
  if (type === "transfer" && !parsed.merchant) description = "Pago " + toAccount.name;
  var notes = "";
  var rule = ctx.rules && ctx.rules.length ? rules.find(parsed.merchant + " " + parsed.description + " " + (mail.subject || ""), ctx.rules, parsed.amount) : null;
  if (rule) {
    var ruled = rules.apply(rule, {
      type: type,
      date: parsed.date,
      description: description,
      notes: notes,
      category: category ? category.id : "",
      tags: tags,
      accountUnknown: accountUnknown,
    });
    description = ruled.description;
    notes = ruled.notes;
    tags = ruled.tags;
    if (ruled.category !== (category ? category.id : "")) {
      category = null;
      for (var c = 0; c < ctx.categories.length; c++) if (ctx.categories[c].id === ruled.category) category = ctx.categories[c];
    }
  }

  return {
    externalId: mail.id,
    type: type,
    amount: parsed.amount,
    date: parsed.date,
    description: description,
    notes: notes,
    rule: rule ? rule.id : "",
    account: account ? account.id : "",
    accountName: account ? account.name : "",
    toAccount: toAccount ? toAccount.id : "",
    toAccountName: toAccount ? toAccount.name : "",
    category: category ? category.id : "",
    categoryName: category ? category.name : "",
    tags: tags,
    bank: parsed.bank,
    raw: String(mail.subject ? mail.subject + "\n" : "") + String(mail.text || "").slice(0, 1500),
  };
}

function exists(app, userId, externalId) {
  try {
    app.findFirstRecordByFilter("transactions", "owner = {:u} && external_id = {:e}", { u: userId, e: externalId });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Importa una lista de mensajes. Con `dry` solo devuelve lo que haría.
 * @returns {{ created: number, skipped: number, ignored: number, items: object[] }}
 */
function importMessages(app, userId, mails, opts) {
  opts = opts || {};
  var ctx = load(app, userId);
  var col = app.findCollectionByNameOrId("transactions");
  var out = { created: 0, skipped: 0, ignored: 0, items: [] };

  for (var i = 0; i < mails.length; i++) {
    var mail = mails[i];
    var p = plan(mail, ctx, opts.account);
    if (!p) {
      out.ignored++;
      continue;
    }
    if (exists(app, userId, p.externalId)) {
      out.skipped++;
      p.status = "duplicado";
      out.items.push(p);
      continue;
    }
    if (!p.account) {
      out.ignored++;
      p.status = "sin cuenta";
      out.items.push(p);
      continue;
    }
    if (!opts.dry) {
      var r = new Record(col);
      r.set("owner", userId);
      r.set("type", p.type);
      r.set("date", p.date + " 12:00:00.000Z");
      r.set("account", p.account);
      if (p.toAccount) r.set("to_account", p.toAccount);
      if (p.category) r.set("category", p.category);
      r.set("amount", p.amount);
      r.set("description", p.description.slice(0, 200));
      if (p.notes) r.set("notes", p.notes);
      r.set("tags", p.tags);
      r.set("source", opts.source || "gmail");
      r.set("external_id", p.externalId);
      r.set("raw", p.raw.slice(0, 4000));
      app.save(r);
      out.created++;
      p.status = "creado";
    } else {
      p.status = "nuevo";
    }
    out.items.push(p);
  }
  return out;
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

module.exports = { importMessages: importMessages, plan: plan, load: load, textId: textId, splitText: splitText };
