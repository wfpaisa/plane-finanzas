/**
 * Lo importado que la persona borró no vuelve.
 *
 * Cada movimiento que trae el banco o crea un fijo lleva un `external_id`
 * (el id del correo, un hash del texto, `csv:…`, `rec:…`) y eso impide crearlo
 * dos veces. Pero al borrarlo el id se iba con él, y una lectura de Gmail
 * desde cero (conexión nueva, respaldo cargado en otro servidor) o el
 * programador del día siguiente lo volvían a crear. Al borrarlo queda aquí.
 */

/** Si ese `external_id` ya existe o se borró a propósito. */
function known(app, userId, externalId) {
  if (!externalId) return false;
  var params = { u: userId, e: externalId };
  try {
    app.findFirstRecordByFilter("transactions", "owner = {:u} && external_id = {:e}", params);
    return true;
  } catch (_) {}
  return ignored(app, userId, externalId);
}

function ignored(app, userId, externalId) {
  try {
    app.findFirstRecordByFilter("ignored_imports", "owner = {:u} && external_id = {:e}", { u: userId, e: externalId });
    return true;
  } catch (_) {
    return false;
  }
}

/** Lo anota como borrado; si ya estaba, no hace nada. */
function remember(app, userId, externalId) {
  if (!userId || !externalId || ignored(app, userId, externalId)) return;
  var r = new Record(app.findCollectionByNameOrId("ignored_imports"));
  r.set("owner", userId);
  r.set("external_id", externalId);
  app.save(r);
}

module.exports = { known: known, ignored: ignored, remember: remember };
