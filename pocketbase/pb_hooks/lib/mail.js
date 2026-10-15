/**
 * Los correos que lee un asistente: Finanzas no se conecta a Gmail, pero
 * recuerda qué correos ya se revisaron para que ninguna IA registre dos veces
 * el mismo.
 *
 * El asistente registra el movimiento de un correo con `source: "gmail"` y el
 * id del mensaje de Gmail en `external_id` (el mismo id que usaba la lectura
 * de Gmail de antes, así que tampoco repite esos). El índice único de
 * `external_id` impide crearlo dos veces. Lo que no es un movimiento se
 * descarta aquí, y queda en `ignored_imports`, igual que un movimiento de
 * correo que la persona borra (ver lib/ignored.js).
 */

var MAX_IDS = 200;

function idsOf(list) {
  if (typeof list === "string") list = list.split(",");
  if (!Array.isArray(list)) throw new BadRequestError("Envía `ids`: los ids de los mensajes de Gmail.");
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var id = String(list[i] || "").trim();
    if (id && id.length <= 300 && out.indexOf(id) < 0) out.push(id);
  }
  if (!out.length) throw new BadRequestError("Envía al menos un id de mensaje de Gmail en `ids`.");
  if (out.length > MAX_IDS) throw new BadRequestError("Envía máximo " + MAX_IDS + " ids por petición.");
  return out;
}

/**
 * Qué pasó con cada correo: `registrado` (con el id del movimiento),
 * `descartado` (se revisó y no era un movimiento, o la persona lo borró) o
 * `nuevo` (falta revisarlo).
 */
function status(app, userId, list) {
  var ignored = require(__hooks + "/lib/ignored.js");
  var ids = idsOf(list);
  var items = {};
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    try {
      var tx = app.findFirstRecordByFilter("transactions", "owner = {:u} && external_id = {:e}", { u: userId, e: id });
      items[id] = { status: "registrado", transaction: tx.id };
      continue;
    } catch (_) {}
    items[id] = { status: ignored.ignored(app, userId, id) ? "descartado" : "nuevo" };
  }
  return { items: items };
}

/** Marca correos como revisados que no son un movimiento: no se vuelven a proponer. */
function skip(app, userId, list) {
  var ignored = require(__hooks + "/lib/ignored.js");
  var ids = idsOf(list);
  for (var i = 0; i < ids.length; i++) ignored.remember(app, userId, ids[i]);
  return { skipped: ids.length };
}

module.exports = { status: status, skip: skip };
