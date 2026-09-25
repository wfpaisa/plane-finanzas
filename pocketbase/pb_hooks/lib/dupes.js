/**
 * Posibles repetidos entre lo que la persona anota a mano y lo que trae el
 * banco (Gmail, texto pegado, CSV).
 *
 * El caso típico: anotas un gasto en el celular sin internet, y horas después
 * llega la notificación del banco con ese mismo gasto. Son dos registros con
 * ids distintos, así que nada técnico los detecta: se parecen (mismo tipo,
 * mismo valor, fechas a un día o menos) y eso es todo. Como dos cafés del
 * mismo valor el mismo día también se parecen, no se unen solos: el que
 * llega segundo apunta al primero con `dup_of` y la persona decide.
 *
 * Los fijos (`recurrente`) quedan por fuera: su `external_id` es lo que
 * evita que el programador los cree otra vez, y unirlos lo reemplazaría.
 */

var BANK = ["gmail", "texto", "csv"];

function isBank(source) {
  return BANK.indexOf(source) >= 0;
}

function isManual(source) {
  return source === "manual" || source === "";
}

/** "AAAA-MM-DD" corrido `delta` días. */
function shift(date, delta) {
  var d = new Date(String(date).slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function tagsOf(record) {
  try {
    var t = JSON.parse(record.getString("tags") || "[]");
    return Array.isArray(t) ? t : [];
  } catch (_) {
    return [];
  }
}

function daysApart(a, b) {
  return Math.abs(Date.parse(String(a).slice(0, 10)) - Date.parse(String(b).slice(0, 10))) / 86400000;
}

/** El movimiento del otro lado que parece el mismo que `record`, o null. */
function findTwin(app, record) {
  var source = record.getString("source");
  if (!isBank(source) && !isManual(source)) return null;
  var amount = record.getFloat("amount");
  var date = record.getString("date");
  if (!amount || !date) return null;

  // Del otro lado. Lo anotado a mano que ya se unió con el banco trae el
  // external_id del banco: ese ya tiene pareja.
  var other = isBank(source)
    ? "(source = 'manual' || source = '') && external_id = ''"
    : "(source = 'gmail' || source = 'texto' || source = 'csv')";
  var list = app.findRecordsByFilter(
    "transactions",
    "owner = {:o} && type = {:t} && amount = {:a} && date >= {:from} && date < {:to} && dup_of = '' && id != {:id} && " + other,
    "-created",
    20,
    0,
    {
      o: record.getString("owner"),
      t: record.getString("type"),
      a: amount,
      from: shift(date, -1) + " 00:00:00.000Z",
      to: shift(date, 2) + " 00:00:00.000Z",
      id: record.id,
    },
  );

  var account = record.getString("account");
  var best = null;
  var bestScore = Infinity;
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    // Uno que ya es pareja de otro no se vuelve a emparejar.
    try {
      app.findFirstRecordByFilter("transactions", "dup_of = {:id}", { id: c.id });
      continue;
    } catch (_) {}
    // Misma cuenta pesa más que un día de diferencia.
    var score = daysApart(date, c.getString("date")) + (c.getString("account") === account ? 0 : 2);
    if (score < bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function mine(app, userId, id) {
  var r = null;
  try {
    r = app.findRecordById("transactions", id);
  } catch (_) {}
  if (!r || r.getString("owner") !== userId) throw new NotFoundError("Ese movimiento ya no existe.");
  return r;
}

/**
 * Une un posible repetido con su pareja. Queda el anotado a mano (con la
 * descripción y la categoría que eligió la persona) y del banco toma lo que
 * el banco sabe mejor: la fecha, la cuenta si la reconoció, y el
 * external_id, para que una nueva lectura de Gmail no lo vuelva a traer.
 * @returns {string} el id del que queda.
 */
function merge(app, userId, id) {
  var result = "";
  app.runInTransaction(function (tx) {
    var a = mine(tx, userId, id);
    var twinId = a.getString("dup_of");
    if (!twinId) throw new BadRequestError("Ese movimiento no tiene un posible repetido.");
    var b = mine(tx, userId, twinId);

    var keep = isManual(a.getString("source")) ? a : b;
    var bank = keep === a ? b : a;

    var bankTags = tagsOf(bank);
    var keepTags = tagsOf(keep);
    var accountUnknown = bankTags.indexOf("revisar") >= 0;
    var tags = [];
    [keepTags, bankTags].forEach(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] !== "revisar" && tags.indexOf(list[i]) < 0) tags.push(list[i]);
      }
    });

    var ext = bank.getString("external_id");
    var raw = bank.getString("raw");
    keep.set("date", bank.getString("date"));
    if (!accountUnknown) {
      keep.set("account", bank.getString("account"));
      if (bank.getString("to_account")) keep.set("to_account", bank.getString("to_account"));
    }
    if (!keep.getString("category")) keep.set("category", bank.getString("category"));
    if (!keep.getString("description")) keep.set("description", bank.getString("description"));
    if (!keep.getString("notes")) keep.set("notes", bank.getString("notes"));
    keep.set("tags", tags);
    keep.set("dup_of", "");

    // Primero se borra el del banco: el external_id es único.
    tx.delete(bank);
    keep.set("external_id", ext);
    keep.set("raw", raw);
    tx.save(keep);
    result = keep.id;
  });
  return result;
}

/**
 * Mientras se restaura un respaldo no se buscan repetidos: son datos que la
 * persona ya revisó, y marcarlos otra vez sería ruido.
 */
function restoring(app, userId) {
  return app.store().has("finanzas:restoring:" + userId);
}

function setRestoring(app, userId, on) {
  if (on) app.store().set("finanzas:restoring:" + userId, true);
  else app.store().remove("finanzas:restoring:" + userId);
}

module.exports = { findTwin: findTwin, merge: merge, restoring: restoring, setRestoring: setRestoring };
