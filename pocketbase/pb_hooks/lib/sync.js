/**
 * Sincronizar el Gmail de un usuario: buscar las notificaciones nuevas del
 * banco y pasarlas por el importador.
 */

var gmail = require(__hooks + "/lib/gmail.js");
var importer = require(__hooks + "/lib/importer.js");
var parsers = require(__hooks + "/lib/parsers.js");

/** Cuántos mensajes se leen como máximo por pasada. */
var MAX = 300;

function nowString() {
  return new Date().toISOString().replace("T", " ");
}

function syncConnection(app, conn) {
  var owner = conn.getString("owner");
  try {
    // Sin cuentas no hay dónde guardar nada: leer ahora daría los correos por
    // vistos y no volverían en la próxima pasada.
    var accounts = app.findRecordsByFilter("accounts", "owner = {:u} && archived = false", "", 1, 0, { u: owner });
    if (!accounts.length) throw new Error("Crea al menos una cuenta antes de sincronizar.");

    var token = gmail.accessToken(conn.getString("refresh_token"));
    var query = conn.getString("query") || gmail.DEFAULT_QUERY;
    var last = conn.getString("last_sync");
    // Un día de solape: Gmail indexa con retraso y el importador no duplica.
    var since = last ? Math.floor(new Date(last.replace(" ", "T")).getTime() / 1000) - 86400 : 0;
    var q = query + (since > 0 ? " after:" + since : " newer_than:90d");

    var ids = gmail.listIds(token, q, MAX);
    var fresh = [];
    for (var i = 0; i < ids.length; i++) {
      try {
        app.findFirstRecordByFilter("transactions", "owner = {:u} && external_id = {:e}", { u: owner, e: ids[i] });
      } catch (_) {
        fresh.push(ids[i]);
      }
    }
    var mails = fresh.map(function (id) {
      return gmail.getMessage(token, id, parsers.htmlToText);
    });
    var result = importer.importMessages(app, owner, mails, { source: "gmail" });
    result.read = ids.length;
    result.skipped += ids.length - fresh.length;

    conn.set("last_sync", nowString());
    conn.set("last_error", "");
    conn.set("last_result", {
      read: result.read,
      created: result.created,
      skipped: result.skipped,
      ignored: result.ignored,
      at: nowString(),
    });
    app.save(conn);
    return result;
  } catch (err) {
    conn.set("last_error", String(err && err.message ? err.message : err).slice(0, 2000));
    app.save(conn);
    throw err;
  }
}

function syncAll(app) {
  var conns = app.findRecordsByFilter("gmail_connections", "paused = false && refresh_token != ''", "", 1000, 0);
  for (var i = 0; i < conns.length; i++) {
    try {
      syncConnection(app, conns[i]);
    } catch (err) {
      console.log("[finanzas] gmail " + conns[i].getString("email") + ": " + err);
    }
  }
}

module.exports = { syncConnection: syncConnection, syncAll: syncAll };
