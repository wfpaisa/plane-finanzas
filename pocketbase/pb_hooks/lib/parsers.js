/**
 * Lectores de las notificaciones de los bancos.
 *
 * JavaScript plano y CommonJS a propósito: lo carga PocketBase (goja) desde
 * los hooks y lo prueba `bun test` desde `tests/`, así que no puede usar nada
 * de Node ni sintaxis moderna que goja no entienda (lookbehind, grupos con
 * nombre, `\p{}`).
 *
 * La idea es una sola: de un texto libre sacar importe, tipo (ingreso, gasto
 * o transferencia), comercio, los cuatro últimos de la cuenta y la fecha. Los
 * bancos colombianos escriben parecido --"Compraste $45.900 en EXITO con tu
 * T.Deb *1234"--, así que un lector genérico con pistas por banco cubre casi
 * todo. Lo que no se reconoce se devuelve `null` y no se inventa.
 */

var ACCENTS = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n", Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U", Ñ: "N" };

function plain(text) {
  return String(text || "").replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, function (c) {
    return ACCENTS[c];
  });
}

/** Texto comparable: sin tildes, en minúscula y con los espacios juntos. */
function norm(text) {
  return plain(text).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * "$45.900,00" -> 45900, "$1,250.50" -> 1250.5, "$150.000" -> 150000.
 * El último separador es el decimal solo si le siguen uno o dos dígitos.
 */
function parseAmount(raw) {
  var s = String(raw || "").replace(/[^\d.,]/g, "");
  if (!s) return null;
  var lastDot = s.lastIndexOf(".");
  var lastComma = s.lastIndexOf(",");
  var last = Math.max(lastDot, lastComma);
  var decimals = last >= 0 ? s.length - last - 1 : 0;
  var intPart = s;
  var decPart = "";
  if (last >= 0 && (decimals === 1 || decimals === 2)) {
    intPart = s.slice(0, last);
    decPart = s.slice(last + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  var n = parseFloat(intPart + (decPart ? "." + decPart : ""));
  return isFinite(n) ? n : null;
}

var BANKS = [
  { id: "bancolombia", name: "Bancolombia", hints: ["bancolombia"] },
  { id: "bold", name: "Bold", hints: ["bold.co", "bold "] },
  { id: "nequi", name: "Nequi", hints: ["nequi"] },
  { id: "davivienda", name: "Davivienda", hints: ["davivienda"] },
  { id: "daviplata", name: "Daviplata", hints: ["daviplata"] },
  { id: "bbva", name: "BBVA", hints: ["bbva"] },
  { id: "bogota", name: "Banco de Bogotá", hints: ["bancodebogota", "banco de bogota"] },
  { id: "occidente", name: "Banco de Occidente", hints: ["bancodeoccidente", "banco de occidente"] },
  { id: "scotiabank", name: "Scotiabank Colpatria", hints: ["colpatria", "scotiabank"] },
  { id: "nu", name: "Nu", hints: ["nu.com.co", "nubank", " nu "] },
  { id: "rappipay", name: "RappiPay", hints: ["rappipay"] },
  { id: "lulo", name: "Lulo Bank", hints: ["lulobank", "lulo bank"] },
];

function detectBank(from, text) {
  var hay = " " + norm(from) + " " + norm(text).slice(0, 400) + " ";
  for (var i = 0; i < BANKS.length; i++) {
    for (var j = 0; j < BANKS[i].hints.length; j++) {
      if (hay.indexOf(BANKS[i].hints[j]) >= 0) return BANKS[i];
    }
  }
  return null;
}

// Palabras que deciden el tipo. El orden importa: se mira primero lo que es
// ingreso, porque "Recibiste una transferencia" también dice "transferencia".
var INCOME = [
  "recibiste",
  "te enviaron",
  "te consignaron",
  "le consignaron",
  "consignacion",
  "abono",
  "abonamos",
  "le abonaron",
  "pago de nomina",
  "pago nomina",
  "nomina",
  "reembolso",
  "devolucion",
  "reverso",
  "rendimientos",
  "intereses a tu favor",
  "transferencia recibida",
  "recepcion de transferencia",
  "recibio",
  "ingreso",
  "te pagaron",
  "venta aprobada",
];

var EXPENSE = [
  "compraste",
  "compra",
  "pagaste",
  "pago",
  "retiraste",
  "retiro",
  "transferiste",
  "transferencia",
  "enviaste",
  "envio",
  "debito",
  "debitamos",
  "cargo",
  "avance",
  "cobro",
];

function detectType(t) {
  // Solo la frase donde está el importe: un pie de correo con "pagos" o
  // "transferencias" no debe mandar sobre lo que pasó.
  for (var i = 0; i < INCOME.length; i++) if (t.indexOf(INCOME[i]) >= 0) return "income";
  for (var j = 0; j < EXPENSE.length; j++) if (t.indexOf(EXPENSE[j]) >= 0) return "expense";
  return null;
}

var DATE_RE = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;
var DATE_ISO_RE = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/;

function pad(n) {
  return (n < 10 ? "0" : "") + n;
}

/** "22/09/2026" -> "2026-09-22". Sin fecha en el texto, `null`. */
function parseDate(text) {
  var m = DATE_ISO_RE.exec(text);
  if (m) return m[1] + "-" + pad(+m[2]) + "-" + pad(+m[3]);
  m = DATE_RE.exec(text);
  if (m) {
    var y = +m[3];
    if (y < 100) y += 2000;
    var d = +m[1];
    var mo = +m[2];
    if (mo > 12 && d <= 12) {
      var tmp = d;
      d = mo;
      mo = tmp;
    }
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return y + "-" + pad(mo) + "-" + pad(d);
  }
  return null;
}

/**
 * Hoy en Colombia (UTC-5), como el programador y la fecha de los correos. El
 * servidor suele correr en UTC: con su hora local, lo pegado después de las
 * 7 de la noche caería al día siguiente.
 */
function today() {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

// Todos los "*1234", "**1234", "cuenta 1234", "terminada en 1234".
var LAST4_RE = /(?:\*{1,4}\s?|x{2,4}|terminad[ao] en\s|cuenta(?: de)?(?: ahorros| corriente)?\s(?:no\.?\s)?|producto\s)(\d{4})\b/gi;

function findLast4(text) {
  var out = [];
  var m;
  LAST4_RE.lastIndex = 0;
  while ((m = LAST4_RE.exec(text))) {
    if (out.indexOf(m[1]) < 0) out.push(m[1]);
  }
  return out;
}

/**
 * La terminación de la cuenta que paga, si la frase la dice con "desde":
 * "pagaste $X a la tarjeta *5678 desde tu cuenta *1234" nombra primero el
 * destino, pero sale de la *1234.
 */
function sourceLast4(sentence) {
  var m = /\bdesde\b/i.exec(sentence);
  if (!m) return null;
  var after = findLast4(sentence.slice(m.index, m.index + 60));
  return after.length ? after[0] : null;
}

var STOP = /\s(?:con\s|desde\s|el\s\d|el dia|a las|por\s\$|por valor|t\.?\s?(?:cred|deb)|tarjeta|cuenta|en su|en tu|\d{1,2}:\d{2}|\d{1,2}\/\d{1,2})|[,.;]\s|[,.;]$|\n/i;

function cut(s) {
  var m = STOP.exec(" " + s);
  var piece = m ? (" " + s).slice(0, m.index) : s;
  return piece.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
}

/** El comercio o la contraparte: "en EXITO", "a NOMBRE", "de EMPRESA". */
function findMerchant(sentence, type) {
  var patterns =
    type === "income"
      ? [/\s(?:de|desde)\s+(?!tu\b|su\b|la cuenta|cuenta|nomina|pago)(.{2,60})/i, /\sen\s+(.{2,60})/i]
      : [
          // "en la tarjeta de credito *1234" es un producto, no un comercio.
          /\sen\s+(?!tu\b|su\b|la cuenta|cuenta|la tarjeta|tarjeta)(.{2,60})/i,
          /\s(?:a|al)\s+(?!la cuenta|tu\b|su\b|las\s\d|la tarjeta|tarjeta)(.{2,60})/i,
        ];
  for (var i = 0; i < patterns.length; i++) {
    var m = patterns[i].exec(sentence);
    if (m) {
      var name = cut(m[1]);
      if (name && !/^\$|^\d+$/.test(name) && name.length >= 2) return name;
    }
  }
  return "";
}

/**
 * Lee UNA notificación.
 *
 * @param {{ text: string, from?: string, subject?: string, date?: string }} mail
 * @returns {null | { amount: number, type: "income"|"expense", merchant: string,
 *   description: string, last4: string[], date: string, bank: string|null }}
 */
function parseMessage(mail) {
  var raw = plain(String(mail.subject || "") + "\n" + String(mail.text || ""));
  var flat = raw.replace(/\s+/g, " ");
  var amountRe = /(?:\$|COP\s?)\s?([\d][\d.,]*)/i;
  var am = amountRe.exec(flat);
  if (!am) return null;
  var amount = parseAmount(am[1]);
  if (!amount || amount <= 0) return null;

  // La frase que contiene el importe: ahí está lo que pasó.
  var start = Math.max(flat.lastIndexOf(". ", am.index), flat.lastIndexOf(": ", am.index), 0);
  var endDot = flat.indexOf(". ", am.index + am[0].length + 1);
  var sentence = flat.slice(start, endDot > 0 ? endDot + 1 : Math.min(flat.length, am.index + 240));
  var lower = norm(sentence);
  var type = detectType(lower) || detectType(norm(mail.subject || ""));
  if (!type) return null;

  var bank = detectBank(mail.from || "", flat);
  var merchant = findMerchant(sentence, type);
  var verb = "";
  var vm = /\b(compraste|compra|pagaste|pago|retiraste|retiro|transferiste|transferencia|enviaste|recibiste|consignacion|abono|nomina|reembolso|devolucion)\b/i.exec(
    lower,
  );
  if (vm) verb = vm[1];

  var desc = merchant || (verb ? verb.charAt(0).toUpperCase() + verb.slice(1) : type === "income" ? "Ingreso" : "Gasto");
  if (/retir/.test(verb) && !merchant) desc = "Retiro en cajero";

  // En orden de aparición, con la cuenta de origen de primera: el importador
  // toma la primera como la cuenta del movimiento y las demás como destino.
  var last4 = findLast4(flat);
  var source = sourceLast4(sentence);
  var at = source ? last4.indexOf(source) : -1;
  if (at > 0) last4 = [source].concat(last4.slice(0, at), last4.slice(at + 1));

  return {
    amount: amount,
    type: type,
    merchant: merchant,
    description: desc,
    last4: last4,
    date: parseDate(sentence) || parseDate(flat) || (mail.date ? String(mail.date).slice(0, 10) : today()),
    bank: bank ? bank.name : null,
    verb: verb,
  };
}

/** Las palabras clave de una categoría, ya comparables. */
function keywordsOf(category) {
  return String(category.keywords || "")
    .split(",")
    .map(function (k) {
      return norm(k);
    })
    .filter(Boolean);
}

/**
 * La categoría por palabras clave: la primera cuya lista contenga algo que
 * aparezca en el texto. `categories` son registros con `keywords` separados
 * por coma y `kind` (income/expense); si traen `keys` (lo que da
 * `keywordsOf`), no se vuelven a partir en cada mensaje.
 */
function categorize(text, type, categories) {
  var hay = " " + norm(text) + " ";
  var best = null;
  var bestLen = 0;
  for (var i = 0; i < categories.length; i++) {
    var c = categories[i];
    if (c.kind && c.kind !== type) continue;
    var keys = c.keys || keywordsOf(c);
    for (var j = 0; j < keys.length; j++) {
      // La coincidencia más larga gana: "pago tarjeta" antes que "pago".
      if (hay.indexOf(keys[j]) >= 0 && keys[j].length > bestLen) {
        best = c;
        bestLen = keys[j].length;
      }
    }
  }
  return best;
}

function keysOf(account) {
  return String(account.match_keys || "")
    .split(",")
    .map(function (k) {
      return norm(k);
    })
    .filter(Boolean);
}

/**
 * La cuenta propia por sus pistas: `match_keys` (coma) contra los cuatro
 * últimos y el nombre del banco. Las terminaciones se miran en su orden:
 * con dos cuentas propias en el mensaje gana la primera (la de origen), no
 * la que esté primero en la lista de cuentas.
 */
function matchAccount(parsed, accounts) {
  var digits = parsed.last4 || [];
  var bank = norm(parsed.bank || "");
  var keys = accounts.map(keysOf);
  for (var d = 0; d < digits.length; d++) {
    for (var i = 0; i < accounts.length; i++) {
      if (keys[i].indexOf(digits[d]) >= 0) return { account: accounts[i], key: digits[d] };
    }
  }
  if (bank) {
    for (var j = 0; j < accounts.length; j++) {
      if (keys[j].indexOf(bank) >= 0) return { account: accounts[j], key: bank };
    }
  }
  return null;
}

function isBankName(key) {
  for (var i = 0; i < BANKS.length; i++) {
    if (norm(BANKS[i].name) === key || norm(BANKS[i].id) === key) return true;
    for (var j = 0; j < BANKS[i].hints.length; j++) if (norm(BANKS[i].hints[j]) === key) return true;
  }
  return false;
}

/**
 * La cuenta propia cuya pista de texto --una llave como "@ana123", un
 * celular, un número de cuenta completo-- aparece en el mensaje. Sirve para
 * ver que un "transferiste a la llave @ana123" va a otra cuenta mía. No
 * cuentan las terminaciones de cuatro dígitos ni los nombres de banco, que
 * salen en casi cualquier correo; tampoco la cuenta `exceptId` (el origen).
 */
function matchKeyInText(text, accounts, exceptId) {
  var hay = norm(text);
  for (var i = 0; i < accounts.length; i++) {
    if (accounts[i].id === exceptId) continue;
    var keys = String(accounts[i].match_keys || "").split(",");
    for (var j = 0; j < keys.length; j++) {
      var k = norm(keys[j]);
      if (k.length < 4 || /^\d{4}$/.test(k) || isBankName(k)) continue;
      if (hay.indexOf(k) >= 0) return { account: accounts[i], key: k };
    }
  }
  return null;
}

/** Sacar el texto legible de un HTML de correo. */
function htmlToText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#36;|&dollar;/gi, "$")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&#(\d+);/g, function (_, n) {
      return String.fromCharCode(+n);
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

module.exports = {
  norm: norm,
  parseAmount: parseAmount,
  parseDate: parseDate,
  parseMessage: parseMessage,
  keywordsOf: keywordsOf,
  categorize: categorize,
  matchAccount: matchAccount,
  matchKeyInText: matchKeyInText,
  detectBank: detectBank,
  findLast4: findLast4,
  htmlToText: htmlToText,
  BANKS: BANKS,
};
