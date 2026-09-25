/// <reference path="../pb_data/types.d.ts" />

/**
 * Los ganchos de Finanzas.
 *
 * Ojo con goja: cada manejador corre aislado y no ve lo declarado arriba en
 * este archivo, por eso cada uno hace su propio `require`.
 */

// ---------- Usuario nuevo: sus categorías de partida ----------
onRecordAfterCreateSuccess((e) => {
  const backup = require(`${__hooks}/lib/backup.js`);
  backup.seedCategories(e.app, e.record.id);
  e.next();
}, "users");

// ---------- Categoría sin color: una que no tenga otra ----------
onRecordCreate((e) => {
  if (!e.record.getString("color")) {
    const tints = require(`${__hooks}/lib/tints.js`);
    const owner = e.record.getString("owner");
    e.record.set("color", tints.pick(tints.load(e.app, owner), e.record.getString("kind")));
  }
  e.next();
}, "categories");

// ---------- Posibles repetidos: lo anotado a mano contra lo del banco ----------
onRecordCreate((e) => {
  const dupes = require(`${__hooks}/lib/dupes.js`);
  const owner = e.record.getString("owner");
  if (!e.record.getString("dup_of") && !dupes.restoring(e.app, owner)) {
    try {
      const twin = dupes.findTwin(e.app, e.record);
      if (twin) e.record.set("dup_of", twin.id);
    } catch (err) {
      // Buscar la pareja nunca debe impedir guardar.
      console.log("[finanzas] repetidos: " + err);
    }
  }
  e.next();
}, "transactions");

// ---------- Lo importado que se borra no vuelve (ver lib/ignored.js) ----------
onRecordDelete((e) => {
  const ext = e.record.getString("external_id");
  const owner = e.record.getString("owner");
  e.next();
  const dupes = require(`${__hooks}/lib/dupes.js`);
  // Al cargar un respaldo o borrarlo todo no es la persona descartando algo.
  if (!ext || dupes.restoring(e.app, owner)) return;
  try {
    require(`${__hooks}/lib/ignored.js`).remember(e.app, owner, ext);
  } catch (err) {
    console.log("[finanzas] borrados: " + err);
  }
}, "transactions");

routerAdd(
  "POST",
  "/api/finanzas/tx/merge",
  (e) => {
    const dupes = require(`${__hooks}/lib/dupes.js`);
    const id = String((e.requestInfo().body || {}).id || "");
    if (!id) throw new BadRequestError("Falta el movimiento.");
    return e.json(200, { id: dupes.merge(e.app, e.auth.id, id) });
  },
  $apis.requireAuth("users"),
);

// ---------- Gmail ----------

routerAdd(
  "GET",
  "/api/finanzas/gmail/config",
  (e) => {
    const gmail = require(`${__hooks}/lib/gmail.js`);
    const c = gmail.config();
    return e.json(200, { configured: gmail.configured(), redirectUri: c.redirectUri, defaultQuery: gmail.DEFAULT_QUERY });
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/finanzas/gmail/connect",
  (e) => {
    const gmail = require(`${__hooks}/lib/gmail.js`);
    if (!gmail.configured()) {
      throw new BadRequestError("Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el servidor.");
    }
    const userId = e.auth.id;
    let conn;
    try {
      conn = e.app.findFirstRecordByFilter("gmail_connections", "owner = {:u}", { u: userId });
    } catch (_) {
      conn = new Record(e.app.findCollectionByNameOrId("gmail_connections"));
      conn.set("owner", userId);
      conn.set("query", gmail.DEFAULT_QUERY);
    }
    const state = $security.randomString(40);
    conn.set("oauth_state", state);
    e.app.save(conn);
    return e.json(200, { url: gmail.authUrl(state) });
  },
  $apis.requireAuth("users"),
);

routerAdd("GET", "/api/finanzas/gmail/callback", (e) => {
  const gmail = require(`${__hooks}/lib/gmail.js`);
  const web = gmail.config().webUrl;
  const code = e.request.url.query().get("code");
  const state = e.request.url.query().get("state");
  const denied = e.request.url.query().get("error");
  if (denied || !code || !state) return e.redirect(302, `${web}/#/ajustes?seccion=gmail&gmail=cancelado`);

  let conn;
  try {
    conn = e.app.findFirstRecordByFilter("gmail_connections", "oauth_state = {:s}", { s: state });
  } catch (_) {
    return e.redirect(302, `${web}/#/ajustes?seccion=gmail&gmail=estado-invalido`);
  }
  try {
    const tokens = gmail.exchangeCode(code);
    if (tokens.refresh_token) conn.set("refresh_token", tokens.refresh_token);
    const p = gmail.profile(tokens.access_token);
    conn.set("email", p.emailAddress || "");
    conn.set("oauth_state", "");
    conn.set("last_error", "");
    conn.set("paused", false);
    e.app.save(conn);
  } catch (err) {
    conn.set("last_error", String(err).slice(0, 2000));
    e.app.save(conn);
    return e.redirect(302, `${web}/#/ajustes?seccion=gmail&gmail=error`);
  }
  return e.redirect(302, `${web}/#/ajustes?seccion=gmail&gmail=ok`);
});

routerAdd(
  "POST",
  "/api/finanzas/gmail/sync",
  (e) => {
    const sync = require(`${__hooks}/lib/sync.js`);
    let conn;
    try {
      conn = e.app.findFirstRecordByFilter("gmail_connections", "owner = {:u} && refresh_token != ''", { u: e.auth.id });
    } catch (_) {
      throw new BadRequestError("Primero conecta tu cuenta de Gmail.");
    }
    try {
      const r = sync.syncConnection(e.app, conn);
      return e.json(200, { read: r.read, created: r.created, skipped: r.skipped, ignored: r.ignored, items: r.items });
    } catch (err) {
      throw new BadRequestError("No se pudo leer Gmail: " + (err && err.message ? err.message : err));
    }
  },
  $apis.requireAuth("users"),
);

// ---------- Pegar texto: SMS, correos copiados, extractos ----------

routerAdd(
  "POST",
  "/api/finanzas/import-text",
  (e) => {
    const importer = require(`${__hooks}/lib/importer.js`);
    const body = e.requestInfo().body || {};
    const text = String(body.text || "");
    if (!text.trim()) throw new BadRequestError("Pega al menos una notificación.");
    const blocks = importer.splitText(text).slice(0, 500);
    const mails = blocks.map((b) => ({ id: importer.textId(b), text: b, from: "", subject: "" }));
    const r = importer.importMessages(e.app, e.auth.id, mails, {
      dry: !!body.dry,
      account: body.account || "",
      source: "texto",
    });
    return e.json(200, r);
  },
  $apis.requireAuth("users"),
);

// ---------- Buscar un usuario por correo, para compartir un ahorro ----------

routerAdd(
  "GET",
  "/api/finanzas/users/lookup",
  (e) => {
    const email = String(e.request.url.query().get("email") || "").trim().toLowerCase();
    if (!email) throw new BadRequestError("Falta el correo.");
    try {
      const u = e.app.findAuthRecordByEmail("users", email);
      return e.json(200, { id: u.id, name: u.getString("name"), email: u.email() });
    } catch (_) {
      throw new NotFoundError("No hay ningún usuario con ese correo.");
    }
  },
  $apis.requireAuth("users"),
);

// ---------- Respaldo: exportar, importar y borrar todo ----------

routerAdd(
  "GET",
  "/api/finanzas/backup",
  (e) => {
    const backup = require(`${__hooks}/lib/backup.js`);
    return e.json(200, backup.exportData(e.app, e.auth.id));
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/finanzas/backup",
  (e) => {
    const backup = require(`${__hooks}/lib/backup.js`);
    try {
      return e.json(200, backup.restore(e.app, e.auth.id, e.requestInfo().body));
    } catch (err) {
      throw new BadRequestError("No se pudo importar: " + (err && err.message ? err.message : err));
    }
  },
  $apis.requireAuth("users"),
  $apis.bodyLimit(100 << 20),
);

routerAdd(
  "POST",
  "/api/finanzas/clean",
  (e) => {
    const backup = require(`${__hooks}/lib/backup.js`);
    const dupes = require(`${__hooks}/lib/dupes.js`);
    let counts;
    // Borrarlo todo es empezar de cero: tampoco se recuerda lo borrado.
    dupes.setRestoring(e.app, e.auth.id, true);
    try {
      e.app.runInTransaction((tx) => {
        counts = backup.clean(tx, e.auth.id);
        backup.seedCategories(tx, e.auth.id);
      });
    } finally {
      dupes.setRestoring(e.app, e.auth.id, false);
    }
    return e.json(200, counts);
  },
  $apis.requireAuth("users"),
);

// ---------- Reglas: aplicarlas a lo que ya está guardado ----------

routerAdd(
  "POST",
  "/api/finanzas/rules/apply",
  (e) => {
    const rules = require(`${__hooks}/lib/rules.js`);
    const body = e.requestInfo().body || {};
    let changed = 0;
    e.app.runInTransaction((tx) => {
      changed = rules.applyExisting(tx, e.auth.id, String(body.rule || ""));
    });
    return e.json(200, { changed });
  },
  $apis.requireAuth("users"),
);

// ---------- Correr ahora lo automático del usuario ----------

routerAdd(
  "POST",
  "/api/finanzas/automatic/run",
  (e) => {
    const s = require(`${__hooks}/lib/scheduler.js`);
    return e.json(200, { transactions: s.runRecurring(e.app, e.auth.id), movements: s.runSavings(e.app, e.auth.id) });
  },
  $apis.requireAuth("users"),
);

// ---------- Tareas programadas ----------

// Gmail cada 30 minutos.
cronAdd("finanzas-gmail", "*/30 * * * *", () => {
  const sync = require(`${__hooks}/lib/sync.js`);
  sync.syncAll($app);
});

// Fijos y ahorros automáticos: 6:00 a. m. en Colombia (11:00 UTC).
cronAdd("finanzas-automatico", "0 11 * * *", () => {
  const s = require(`${__hooks}/lib/scheduler.js`);
  try {
    s.runRecurring($app, "");
    s.runSavings($app, "");
  } catch (err) {
    console.log("[finanzas] automatico: " + err);
  }
});
