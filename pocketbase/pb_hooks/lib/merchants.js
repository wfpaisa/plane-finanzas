/**
 * Comercios y descripciones limpias.
 *
 * - Alias: "si el comercio dice ikea, se llama Ikea (y es Hogar)". Se buscan
 *   en el comercio que se leyó del correo (`parsed.merchant`, o su
 *   descripción si no hay comercio). Si coinciden varios gana el de texto más
 *   largo.
 * - Marcas de la descripción de una regla: {mes}, {año}, {original} (la
 *   descripción que se leyó del correo) y {comercio} (el nombre del alias; si
 *   no hay, el comercio que se leyó; si tampoco, la descripción).
 * - Filtros sobre cualquier marca, en cadena: {comercio|sin_ciudad|capitalizar}.
 *   El nombre de un alias ya es el definitivo: a {comercio} con alias no se le
 *   aplican (si no, «EPM» saldría «Epm»).
 *
 * El formulario de reglas hace lo mismo para la vista previa: src/lib/rules.ts
 * (tests/merchants.test.ts compara los dos).
 */

var parsers = require(__hooks + "/lib/parsers.js");

var MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

var MARKS = ["mes", "año", "ano", "original", "comercio"];

/**
 * Municipios que los bancos ponen al final del comercio ("IKEA ENVIGADO").
 * Ya normalizados; los de varias palabras también cuentan.
 */
var CITIES = [
  "bogota", "bogota dc", "bogota d.c", "bogota d.c.", "medellin", "cali", "barranquilla", "cartagena", "cucuta", "bucaramanga",
  "pereira", "manizales", "armenia", "ibague", "villavicencio", "santa marta", "pasto", "neiva", "monteria", "valledupar",
  "sincelejo", "popayan", "tunja", "riohacha", "quibdo", "florencia", "yopal", "leticia", "san andres", "mocoa", "arauca",
  "envigado", "sabaneta", "itagui", "bello", "la estrella", "caldas", "copacabana", "girardota", "rionegro", "la ceja",
  "marinilla", "guarne", "el retiro", "la union", "el carmen de viboral", "carmen de viboral", "santa fe de antioquia",
  "apartado", "turbo", "caucasia", "soacha", "chia", "cajica", "zipaquira", "mosquera", "funza", "madrid", "facatativa",
  "fusagasuga", "girardot", "cota", "tocancipa", "sopo", "la calera", "tenjo", "tabio", "palmira", "jamundi", "yumbo",
  "tulua", "buga", "cartago", "buenaventura", "soledad", "malambo", "puerto colombia", "floridablanca", "giron",
  "piedecuesta", "barrancabermeja", "dosquebradas", "santa rosa de cabal", "la dorada", "duitama", "sogamoso", "chiquinquira",
  "espinal", "melgar", "colombia", "col", "co",
];

var CITY = {};
for (var c = 0; c < CITIES.length; c++) CITY[CITIES[c]] = true;

/** Palabras que van en minúscula al capitalizar, salvo al comienzo. */
var SMALL = { de: 1, del: 1, la: 1, las: 1, el: 1, los: 1, y: 1, e: 1, en: 1 };

function words(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** IKEA ENVIGADO -> Ikea Envigado. Las siglas cortas con punto se quedan (S.A.S.). */
function capitalize(text) {
  return words(text)
    .map(function (w, i) {
      var low = w.toLowerCase();
      if (i > 0 && SMALL[low]) return low;
      if (/^([a-z]\.)+[a-z]?\.?$/i.test(w)) return w.toUpperCase();
      return low.charAt(0).toUpperCase() + low.slice(1);
    })
    .join(" ");
}

/** Quita del final los municipios (hasta dos seguidos: "SABANETA COL"). Nunca deja el texto vacío. */
function withoutCity(text) {
  var list = words(text);
  for (var round = 0; round < 2; round++) {
    var cut = 0;
    for (var n = Math.min(4, list.length - 1); n >= 1; n--) {
      if (CITY[parsers.norm(list.slice(list.length - n).join(" "))]) {
        cut = n;
        break;
      }
    }
    if (!cut) break;
    list = list.slice(0, list.length - cut);
  }
  return list.join(" ");
}

function firstWord(text) {
  return words(text)[0] || "";
}

var FILTERS = {
  capitalizar: capitalize,
  mayusculas: function (t) {
    return String(t || "").toUpperCase();
  },
  minusculas: function (t) {
    return String(t || "").toLowerCase();
  },
  sin_ciudad: withoutCity,
  primera_palabra: firstWord,
};

/** Aplica los filtros en orden; los que no existen se saltan (la revisión de reglas avisa). */
function filter(value, names) {
  var out = String(value || "");
  for (var i = 0; i < names.length; i++) {
    var f = FILTERS[names[i]];
    if (f) out = f(out);
  }
  return out;
}

var MARK = /\{\s*([a-zñ]+)\s*((?:\|\s*[a-z_]*\s*)*)\}/gi;

/** Las marcas de una plantilla: [{ mark, filters, raw }]. */
function marksOf(template) {
  var out = [];
  var m;
  var re = new RegExp(MARK.source, "gi");
  while ((m = re.exec(String(template || "")))) {
    out.push({
      raw: m[0],
      mark: m[1].toLowerCase(),
      filters: m[2]
        .split("|")
        .map(function (s) {
          return s.trim().toLowerCase();
        })
        .filter(Boolean),
    });
  }
  return out;
}

/**
 * La descripción con sus marcas resueltas; `date` es "AAAA-MM-DD". `vars`:
 * { original, comercio (el que se leyó), alias (el nombre del alias) }. Una
 * marca desconocida se queda como está.
 */
function render(template, date, vars) {
  vars = vars || {};
  var y = String(date || "").slice(0, 4);
  var mo = +String(date || "").slice(5, 7);
  var values = {
    mes: MONTHS[mo - 1] || "",
    año: y,
    ano: y,
    original: vars.original || "",
    comercio: vars.alias || vars.comercio || vars.original || "",
  };
  return String(template || "")
    .replace(new RegExp(MARK.source, "gi"), function (raw, mark, filters) {
      var key = mark.toLowerCase();
      if (!(key in values)) return raw;
      var names = filters
        .split("|")
        .map(function (s) {
          return s.trim().toLowerCase();
        })
        .filter(Boolean);
      // El nombre del alias se escribió a mano: se respeta tal cual.
      if (key === "comercio" && vars.alias) return values[key];
      return filter(values[key], names);
    })
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- Alias ----------

function keysOf(match) {
  return String(match || "")
    .split(",")
    .map(function (k) {
      return parsers.norm(k);
    })
    .filter(Boolean);
}

/** Un registro de `merchants` como objeto simple, con sus textos ya partidos. */
function plain(r) {
  var m = { id: r.id, match: r.getString("match"), name: r.getString("name"), category: r.getString("category") };
  m.keys = keysOf(m.match);
  return m;
}

function load(app, userId) {
  try {
    return app.findRecordsByFilter("merchants", "owner = {:u}", "created", 0, 0, { u: userId }).map(plain);
  } catch (_) {
    // Antes de la migración de comercios.
    return [];
  }
}

/** El alias que le queda a un texto (el de texto más largo), o null. */
function find(text, list) {
  var hay = " " + parsers.norm(text) + " ";
  var best = null;
  var len = 0;
  for (var i = 0; i < (list || []).length; i++) {
    var keys = list[i].keys || keysOf(list[i].match);
    for (var k = 0; k < keys.length; k++) {
      if (keys[k].length > len && hay.indexOf(keys[k]) >= 0) {
        best = list[i];
        len = keys[k].length;
      }
    }
  }
  return best;
}

/**
 * Pone el nombre (y la categoría, si el alias la tiene y es del mismo tipo) a
 * los movimientos importados que ya existen. Con `id`, solo ese alias. No toca
 * lo anotado a mano ni lo que una regla nombró con un texto fijo
 * ("Arriendo {mes}"): solo lo que no tiene regla o cuya regla usa {comercio}
 * o no tiene descripción.
 * @returns {number} cuántos movimientos cambiaron
 */
function applyExisting(app, userId, id) {
  var list = load(app, userId).filter(function (m) {
    return !id || m.id === id;
  });
  if (!list.length) return 0;
  var kinds = {};
  var cats = app.findRecordsByFilter("categories", "owner = {:u}", "", 0, 0, { u: userId });
  for (var c = 0; c < cats.length; c++) kinds[cats[c].id] = cats[c].getString("kind");
  var named = {};
  var rules = app.findRecordsByFilter("rules", "owner = {:u}", "", 0, 0, { u: userId });
  for (var r = 0; r < rules.length; r++) {
    var d = rules[r].getString("description");
    named[rules[r].id] = !!d && !/\{\s*comercio/i.test(d);
  }
  var txs = app.findRecordsByFilter("transactions", "owner = {:u} && (source = 'gmail' || source = 'texto')", "", 0, 0, { u: userId });
  var changed = 0;
  for (var i = 0; i < txs.length; i++) {
    var tx = txs[i];
    if (named[tx.getString("rule")]) continue;
    var alias = find(tx.getString("description"), list);
    if (!alias) continue;
    var dirty = false;
    if (tx.getString("description") !== alias.name) {
      tx.set("description", alias.name.slice(0, 200));
      dirty = true;
    }
    var type = tx.getString("type");
    if (alias.category && kinds[alias.category] === type && tx.getString("category") !== alias.category) {
      tx.set("category", alias.category);
      dirty = true;
    }
    if (dirty) {
      app.save(tx);
      changed++;
    }
  }
  return changed;
}

module.exports = {
  applyExisting: applyExisting,
  MARKS: MARKS,
  FILTERS: Object.keys(FILTERS),
  capitalize: capitalize,
  withoutCity: withoutCity,
  filter: filter,
  marksOf: marksOf,
  render: render,
  plain: plain,
  load: load,
  find: find,
};
