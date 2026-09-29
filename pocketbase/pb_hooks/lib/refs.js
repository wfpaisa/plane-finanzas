/**
 * Las cuentas propias por sus terminaciones y llaves.
 *
 * Cada cuenta puede guardar en `refs` cómo la nombran los avisos: "*1234",
 * "**5678", el número completo o una llave como "@ana123". Con eso el aviso
 * dice solo de qué cuenta sale el dinero ("con tu T.Cred *1234") y si va a
 * otra cuenta propia ("a la tarjeta *5678"), sin una regla por tarjeta. Lo
 * que no es de una cuenta propia (una cuenta o llave de otra persona) queda
 * como contraparte, para nombrarla con un alias (ver merchants.js).
 */

var parsers = require(__hooks + "/lib/parsers.js");

function jsonList(record, field) {
  try {
    var v = JSON.parse(record.getString(field) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

/** "*1234" -> "1234", "300 123 4567" -> "3001234567", "@Ana123" -> "@ana123". */
function clean(ref) {
  var s = parsers.norm(ref).replace(/^\*+\s*/, "");
  if (/^[\d\s.-]+$/.test(s)) s = s.replace(/\D/g, "");
  return s;
}

/** Las de una cuenta, ya comparables; las de menos de 4 dígitos no sirven. */
function refsOf(list) {
  return (list || []).map(clean).filter(function (r) {
    return /^\d+$/.test(r) ? r.length >= 4 : r.length >= 3;
  });
}

/** Remitentes comparables: sin tildes, en minúscula, sin vacíos. */
function sendersOf(list) {
  return (list || [])
    .map(function (s) {
      return parsers.norm(s);
    })
    .filter(Boolean);
}

/** Las cuentas activas como objetos simples, con remitentes y referencias. */
function accounts(app, userId) {
  return app.findRecordsByFilter("accounts", "owner = {:u} && archived = false", "sort,created", 500, 0, { u: userId }).map(function (a) {
    return {
      id: a.id,
      name: a.getString("name"),
      type: a.getString("type"),
      senders: sendersOf(jsonList(a, "senders")),
      refs: refsOf(jsonList(a, "refs")),
    };
  });
}

/** Si la referencia del aviso es esta de la cuenta: por el final, si son números. */
function same(found, mine) {
  if (/^\d+$/.test(found) && /^\d+$/.test(mine)) return found.slice(-mine.length) === mine || mine.slice(-found.length) === found;
  return found === mine || found === "@" + mine || "@" + found === mine;
}

function owner(found, list) {
  for (var i = 0; i < list.length; i++) {
    for (var j = 0; j < (list[i].refs || []).length; j++) if (same(found, list[i].refs[j])) return list[i];
  }
  return null;
}

/** "12345678901" -> "*12345678901"; una llave queda como está. */
function display(ref) {
  return /^\d+$/.test(ref) ? "*" + ref : ref;
}

/**
 * Qué dicen las referencias del aviso, con `type` el que se leyó:
 * - `mine`: la cuenta del movimiento (de donde sale un gasto, a donde llega
 *   un ingreso), o null si no la nombra;
 * - `other`: otra cuenta propia en la otra punta, o null: es una
 *   transferencia entre cuentas propias;
 * - `counterparty`: la cuenta o llave de otra persona en la otra punta
 *   ("*12345678901", "@ana123"), o "".
 * Una referencia que no dice de qué lado está es la del movimiento.
 */
function resolve(parsed, text, list) {
  var out = { mine: null, other: null, counterparty: "" };
  if (!parsed) return out;
  var found = (parsed.refs || []).slice();
  // Las llaves que no son "@algo" ni números (un correo, un apodo) se buscan en el texto.
  var hay = parsers.norm(text);
  for (var i = 0; i < list.length; i++) {
    for (var j = 0; j < (list[i].refs || []).length; j++) {
      var r = list[i].refs[j];
      if (/^\d+$/.test(r) || r.charAt(0) === "@") continue;
      var at = hay.indexOf(r);
      if (at >= 0) found.push({ ref: r, role: parsers.roleBefore(hay.slice(0, at)) });
    }
  }
  var income = parsed.type === "income";
  var here = income ? "to" : "from";
  var there = income ? "from" : "to";
  var pick = { from: null, to: null, "": null };
  for (var k = 0; k < found.length; k++) {
    var acc = owner(found[k].ref, list);
    if (acc) {
      if (!pick[found[k].role]) pick[found[k].role] = acc;
    } else if (found[k].role === there && !out.counterparty) {
      out.counterparty = display(found[k].ref);
    }
  }
  out.mine = pick[here] || pick[""];
  if (pick[there] && (!out.mine || pick[there].id !== out.mine.id)) out.other = pick[there];
  return out;
}

/** La cuenta de efectivo, para los retiros: la primera de tipo efectivo. */
function cash(list) {
  for (var i = 0; i < list.length; i++) if (list[i].type === "efectivo") return list[i];
  return null;
}

module.exports = { clean: clean, refsOf: refsOf, sendersOf: sendersOf, accounts: accounts, resolve: resolve, cash: cash, display: display };
