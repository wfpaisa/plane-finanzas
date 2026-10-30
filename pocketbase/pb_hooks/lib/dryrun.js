/**
 * Simular una ruta que escribe: hace todo dentro de una transacción y la
 * deshace al final. Así la simulación pasa por el mismo código que el cambio
 * real (reglas, alias, ganchos) y lo que informa es lo que pasaría.
 */

var MARK = "finanzas: simulacion deshecha";

/** `fn(tx)` con los cambios guardados, o deshechos si `dry`. Devuelve lo que devuelva `fn`. */
function run(app, dry, fn) {
  var out;
  if (!dry) {
    app.runInTransaction(function (tx) {
      out = fn(tx);
    });
    return out;
  }
  try {
    app.runInTransaction(function (tx) {
      out = fn(tx);
      throw new Error(MARK);
    });
  } catch (err) {
    if (String((err && err.message) || err).indexOf(MARK) < 0) throw err;
  }
  return out;
}

/** Si el cuerpo pide simular: `dry_run: true`. */
function wanted(body) {
  return !!(body && (body.dry_run === true || body.dry_run === "true" || body.dry_run === 1));
}

module.exports = { run: run, wanted: wanted };
