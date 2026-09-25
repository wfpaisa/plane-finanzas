/**
 * Posibles repetidos entre lo que la persona anota a mano y lo que trae el
 * banco (Gmail, texto pegado, CSV), y entre dos avisos del banco del mismo
 * pago entre cuentas propias.
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

/**
 * Si dos movimientos pueden ser el mismo, visto solo por su tipo, sus cuentas
 * y de dónde vinieron (el valor y la fecha se miran en la consulta). `a` y
 * `b` son objetos simples con type, account, to_account, source y
 * external_id.
 *
 * - Lo anotado a mano contra lo del banco, como siempre. Lo anotado a mano
 *   que ya se unió trae el external_id del banco: ese ya tiene pareja.
 * - Dos del banco solo si uno es transferencia y el otro no: el mismo pago
 *   lo avisan las dos puntas (Bancolombia: "pagaste"; Nu: "recibimos tu
 *   pago"), y el segundo correo no siempre dice a qué cuenta fue. Dos compras
 *   iguales el mismo día sí pasan, y esas no se marcan.
 * - Un gasto o un ingreso se parece a una transferencia si su cuenta es una
 *   de las dos puntas.
 */
function pairable(a, b) {
  var manualA = isManual(a.source);
  var manualB = isManual(b.source);
  if (manualA && manualB) return false;
  if (!isBank(a.source) && !manualA) return false;
  if (!isBank(b.source) && !manualB) return false;
  if (manualA && a.external_id) return false;
  if (manualB && b.external_id) return false;
  if (a.type === b.type) return manualA || manualB;
  var t = a.type === "transfer" ? a : b.type === "transfer" ? b : null;
  if (!t) return false;
  var o = t === a ? b : a;
  return o.account === t.account || o.account === t.to_account;
}

function plainOf(r) {
  return {
    type: r.getString("type"),
    account: r.getString("account"),
    to_account: r.getString("to_account"),
    source: r.getString("source"),
    external_id: r.getString("external_id"),
  };
}

/** El movimiento que parece el mismo que `record`, o null. */
function findTwin(app, record) {
  var source = record.getString("source");
  if (!isBank(source) && !isManual(source)) return null;
  var amount = record.getFloat("amount");
  var date = record.getString("date");
  if (!amount || !date) return null;
  var type = record.getString("type");

  var list = app.findRecordsByFilter(
    "transactions",
    "owner = {:o} && amount = {:a} && date >= {:from} && date < {:to} && dup_of = '' && id != {:id}" +
      (type === "transfer" ? "" : " && (type = {:t} || type = 'transfer')"),
    "-created",
    20,
    0,
    {
      o: record.getString("owner"),
      t: type,
      a: amount,
      from: shift(date, -1) + " 00:00:00.000Z",
      to: shift(date, 2) + " 00:00:00.000Z",
      id: record.id,
    },
  );

  var me = plainOf(record);
  var best = null;
  var bestScore = Infinity;
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (!pairable(me, plainOf(c))) continue;
    // Uno que ya es pareja de otro no se vuelve a emparejar.
    try {
      app.findFirstRecordByFilter("transactions", "dup_of = {:id}", { id: c.id });
      continue;
    } catch (_) {}
    // Misma cuenta pesa más que un día de diferencia.
    var score = daysApart(date, c.getString("date")) + (c.getString("account") === me.account ? 0 : 2);
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
 * Une un posible repetido con su pareja.
 *
 * Con uno anotado a mano, queda ese (con la descripción y la categoría que
 * eligió la persona) y del banco toma lo que el banco sabe mejor: la fecha, la
 * cuenta si la reconoció, y el external_id, para que una nueva lectura de
 * Gmail no lo vuelva a traer.
 *
 * Con los dos del banco queda la transferencia, que sabe de dónde salió y a
 * dónde llegó; el otro se borra y su correo queda en lib/ignored.js.
 * @returns {string} el id del que queda.
 */
function merge(app, userId, id) {
  var result = "";
  app.runInTransaction(function (tx) {
    var a = mine(tx, userId, id);
    var twinId = a.getString("dup_of");
    if (!twinId) throw new BadRequestError("Ese movimiento no tiene un posible repetido.");
    var b = mine(tx, userId, twinId);

    var manual = isManual(a.getString("source")) ? a : isManual(b.getString("source")) ? b : null;
    var keep = manual || (a.getString("type") === "transfer" ? a : b);
    var other = keep === a ? b : a;

    var otherTags = tagsOf(other);
    var keepTags = tagsOf(keep);
    var accountUnknown = otherTags.indexOf("revisar") >= 0;
    var tags = [];
    [keepTags, otherTags].forEach(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] !== "revisar" && tags.indexOf(list[i]) < 0) tags.push(list[i]);
      }
    });

    if (manual) {
      keep.set("date", other.getString("date"));
      if (other.getString("type") === "transfer" && keep.getString("type") !== "transfer") {
        // El banco vio las dos puntas: era entre cuentas propias.
        keep.set("type", "transfer");
        keep.set("category", "");
      }
      // Una transferencia anotada a mano ya dice sus dos cuentas.
      var keepEnds = keep.getString("type") === "transfer" && other.getString("type") !== "transfer";
      if (!accountUnknown && !keepEnds) {
        keep.set("account", other.getString("account"));
        if (other.getString("to_account")) keep.set("to_account", other.getString("to_account"));
      }
    }
    if (keep.getString("type") !== "transfer" && !keep.getString("category")) keep.set("category", other.getString("category"));
    if (!keep.getString("description")) keep.set("description", other.getString("description"));
    if (!keep.getString("notes")) keep.set("notes", other.getString("notes"));
    keep.set("tags", tags);
    keep.set("dup_of", "");

    // Primero se borra el otro: el external_id es único.
    var ext = other.getString("external_id");
    var raw = other.getString("raw");
    tx.delete(other);
    if (manual) {
      keep.set("external_id", ext);
      keep.set("raw", raw);
    }
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

module.exports = { pairable: pairable, findTwin: findTwin, merge: merge, restoring: restoring, setRestoring: setRestoring };
