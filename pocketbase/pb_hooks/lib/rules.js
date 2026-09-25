/**
 * Reglas del usuario: "si el movimiento dice X, es tal cosa".
 *
 * Se consultan al importar (Gmail o texto pegado) y se pueden aplicar a lo que
 * ya está guardado. Una regla que coincide manda sobre las palabras clave de
 * las categorías. Si coinciden varias, gana el texto más largo, igual que con
 * las categorías: "gou payments admin" antes que "gou payments".
 *
 * Una regla con valor solo aplica si el movimiento trae ese valor, y gana
 * sobre las que no lo tienen: "GOU PAYMENTS" por $412.000 es la
 * administración aunque haya otra regla para "GOU PAYMENTS".
 */

var parsers = require(__hooks + "/lib/parsers.js");

var MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function keysOf(rule) {
  return String(rule.match || "")
    .split(",")
    .map(function (k) {
      return parsers.norm(k);
    })
    .filter(Boolean);
}

/** Si el valor de la regla (0: cualquiera) coincide con el del movimiento. */
function amountMatches(rule, amount) {
  var want = +rule.amount || 0;
  return !want || Math.abs(want - Math.abs(+amount || 0)) < 0.005;
}

/** La regla que le toca a un texto con su valor, o null. */
function find(text, rules, amount) {
  var hay = " " + parsers.norm(text) + " ";
  var best = null;
  var bestLen = 0;
  for (var i = 0; i < rules.length; i++) {
    if (rules[i].paused || !amountMatches(rules[i], amount)) continue;
    // Con valor pesa más que cualquier largo de texto (máx. 500).
    var bonus = +rules[i].amount ? 1000 : 0;
    var keys = rules[i].keys || keysOf(rules[i]);
    for (var j = 0; j < keys.length; j++) {
      if (hay.indexOf(keys[j]) >= 0 && keys[j].length + bonus > bestLen) {
        best = rules[i];
        bestLen = keys[j].length + bonus;
      }
    }
  }
  return best;
}

/** La descripción de la regla con sus marcas resueltas; `date` es "AAAA-MM-DD". */
function render(template, date, original) {
  var y = String(date || "").slice(0, 4);
  var m = +String(date || "").slice(5, 7);
  return String(template || "")
    .replace(/\{mes\}/gi, MONTHS[m - 1] || "")
    .replace(/\{año\}|\{ano\}/gi, y)
    .replace(/\{original\}/gi, original || "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lo que cambia la regla en un movimiento. `tx` trae type, date, description,
 * notes, category y tags; devuelve los mismos campos ya ajustados.
 */
function apply(rule, tx) {
  var out = {
    category: tx.category || "",
    tags: (tx.tags || []).slice(),
    description: tx.description || "",
    notes: tx.notes || "",
  };
  // Una transferencia no lleva categoría.
  if (rule.category && tx.type !== "transfer") {
    out.category = rule.category;
    // Ya se sabe qué es: deja de estar por revisar si era por la categoría.
    out.tags = out.tags.filter(function (t) {
      return t !== "revisar" || tx.accountUnknown;
    });
  }
  var ruleTags = rule.tags || [];
  for (var i = 0; i < ruleTags.length; i++) {
    // Igual que las escribe TagInput: en minúscula y sin comas.
    var t = String(ruleTags[i]).trim().toLowerCase().replace(/,/g, "");
    if (t && out.tags.indexOf(t) < 0) out.tags.push(t);
  }
  var original = tx.description || "";
  if (rule.description) {
    var next = render(rule.description, tx.date, original);
    if (next && next !== original) {
      // El texto del banco se guarda en las notas, sin repetirlo si ya está.
      if (rule.to_notes && original && out.notes.indexOf(original) < 0) {
        out.notes = out.notes ? original + "\n" + out.notes : original;
      }
      out.description = next;
    }
  }
  return out;
}

/**
 * Las reglas activas de un usuario, como objetos simples. Con sus textos ya
 * partidos (`keys`): al aplicarlas a todo lo guardado se consultan miles de
 * veces.
 */
function load(app, userId) {
  return app.findRecordsByFilter("rules", "owner = {:u} && paused = false", "created", 500, 0, { u: userId }).map(function (r) {
    var tags = [];
    try {
      tags = JSON.parse(r.getString("tags") || "[]") || [];
    } catch (_) {
      tags = [];
    }
    var rule = {
      id: r.id,
      match: r.getString("match"),
      amount: r.getFloat("amount"),
      category: r.getString("category"),
      tags: Array.isArray(tags) ? tags : [],
      description: r.getString("description"),
      to_notes: r.getBool("to_notes"),
    };
    rule.keys = keysOf(rule);
    return rule;
  });
}

/**
 * Aplica las reglas a lo ya guardado. Con `ruleId`, solo esa regla. Busca en
 * la descripción, las notas y el texto original del correo.
 * @returns {number} cuántos movimientos cambiaron
 */
function applyExisting(app, userId, ruleId) {
  var rules = load(app, userId).filter(function (r) {
    return !ruleId || r.id === ruleId;
  });
  if (!rules.length) return 0;
  var list = app.findRecordsByFilter("transactions", "owner = {:u}", "", 0, 0, { u: userId });
  var changed = 0;
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    var text = r.getString("description") + " " + r.getString("notes") + " " + r.getString("raw");
    var rule = find(text, rules, r.getFloat("amount"));
    if (!rule) continue;
    var tags = [];
    try {
      tags = JSON.parse(r.getString("tags") || "[]") || [];
    } catch (_) {
      tags = [];
    }
    var before = {
      type: r.getString("type"),
      date: r.getString("date").slice(0, 10),
      description: r.getString("description"),
      notes: r.getString("notes"),
      category: r.getString("category"),
      tags: tags,
    };
    var after = apply(rule, before);
    if (
      after.category === before.category &&
      after.description === before.description &&
      after.notes === before.notes &&
      after.tags.join(",") === before.tags.join(",")
    ) {
      continue;
    }
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

module.exports = { find: find, render: render, apply: apply, load: load, applyExisting: applyExisting };
