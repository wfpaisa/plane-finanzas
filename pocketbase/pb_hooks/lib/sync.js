/**
 * Sincronizar el Gmail de un usuario: buscar los correos nuevos de los
 * remitentes que lee --los de Ajustes y los de cada cuenta-- y meterlos a la
 * bandeja (ver inbox.js).
 */

var gmail = require(__hooks + "/lib/gmail.js");
var inbox = require(__hooks + "/lib/inbox.js");
var ignored = require(__hooks + "/lib/ignored.js");
var parsers = require(__hooks + "/lib/parsers.js");

function jsonList(record, field) {
  try {
    var v = JSON.parse(record.getString(field) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

/** Los remitentes de la conexión más los de las cuentas, sin repetir. */
function sendersOf(app, conn) {
  var out = jsonList(conn, "senders");
  var accounts = app.findRecordsByFilter("accounts", "owner = {:u} && archived = false", "", 500, 0, { u: conn.getString("owner") });
  for (var i = 0; i < accounts.length; i++) out = out.concat(jsonList(accounts[i], "senders"));
  var seen = {};
  return out.filter(function (s) {
    var k = String(s || "").trim().toLowerCase();
    if (!k || seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

/** Cuántos mensajes se leen como máximo por pasada. */
var MAX = 300;

function nowString() {
  return new Date().toISOString().replace("T", " ");
}

/**
 * Lee los correos nuevos y los mete a la bandeja. Con `opts.again` vuelve a
 * traer los de los últimos 90 días que no tienen movimiento: los que se
 * quitaron de la bandeja y los procesados cuyo movimiento se borró, que
 * quedan otra vez por decidir. Lo que ya tiene movimiento no se toca.
 */
function syncConnection(app, conn, opts) {
  var owner = conn.getString("owner");
  var again = !!(opts && opts.again);
  try {
    var token = gmail.accessToken(conn.getString("refresh_token"));
    var query = gmail.queryFor(sendersOf(app, conn));
    var last = again ? "" : conn.getString("last_sync");
    // Un día de solape: Gmail indexa con retraso y la bandeja no duplica. Sin
    // lectura previa (o con remitentes nuevos, ver main.pb.js), 90 días atrás.
    var since = last ? Math.floor(new Date(last.replace(" ", "T")).getTime() / 1000) - 86400 : 0;
    var q = query + (since > 0 ? " after:" + since : " newer_than:90d");

    var ids = gmail.listIds(token, q, MAX);
    var reopened = again ? inbox.reopen(app, owner) : 0;
    var fresh = [];
    // Ni lo que ya está en la bandeja, ni lo importado, ni lo descartado
    // (salvo que se pida traerlo de nuevo).
    for (var i = 0; i < ids.length; i++) {
      if (again) ignored.forget(app, owner, ids[i]);
      if (!inbox.seen(app, owner, ids[i])) fresh.push(ids[i]);
    }
    var mails = fresh.map(function (id) {
      return gmail.getMessage(token, id, parsers.htmlToText, parsers.htmlToRich);
    });
    var result = inbox.ingest(app, owner, mails, { source: "gmail" });
    result.read = ids.length;
    result.skipped += ids.length - fresh.length;
    result.pending += reopened;

    conn.set("last_sync", nowString());
    conn.set("last_error", "");
    conn.set("last_result", {
      read: result.read,
      created: result.created,
      pending: result.pending,
      skipped: result.skipped,
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

/** Que la próxima lectura de Gmail vuelva a mirar desde el principio. */
function rewind(app, userId) {
  try {
    var g = app.findFirstRecordByFilter("gmail_connections", "owner = {:u}", { u: userId });
    if (!g.getString("last_sync")) return;
    g.set("last_sync", "");
    app.save(g);
  } catch (_) {
    // Sin Gmail conectado.
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

module.exports = { syncConnection: syncConnection, syncAll: syncAll, sendersOf: sendersOf, rewind: rewind };
