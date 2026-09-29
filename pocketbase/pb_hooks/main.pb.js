/// <reference path="../pb_data/types.d.ts" />

/**
 * Los ganchos de Finanzas.
 *
 * Ojo con goja: cada manejador corre aislado y no ve lo declarado arriba en
 * este archivo, por eso cada uno hace su propio `require`.
 */

// ---------- Tokens de acceso: la API sin la clave (ver lib/tokens.js) ----------
// Corre antes que el de PocketBase (-1020): si el token es de los nuestros deja
// `e.auth` puesto y aquel no hace nada.
routerUse(
  new Middleware(
    (e) => {
      const tokens = require(`${__hooks}/lib/tokens.js`);
      const raw = tokens.fromHeader(e.request.header.get("Authorization"));
      if (!raw) return e.next();
      const r = tokens.authenticate(e.app, raw);
      const why = tokens.denied(r.token.getString("scope"), e.request.method, e.request.url.path);
      if (why) throw new ForbiddenError(why);
      e.auth = r.user;
      e.set("apiToken", r.token);
      return e.next();
    },
    -1030,
    "finanzasApiToken",
  ),
);

routerAdd(
  "POST",
  "/api/finanzas/tokens",
  (e) => {
    const tokens = require(`${__hooks}/lib/tokens.js`);
    return e.json(200, tokens.create(e.app, e.auth.id, e.requestInfo().body));
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "GET",
  "/api/finanzas/guia",
  (e) => {
    const tokens = require(`${__hooks}/lib/tokens.js`);
    // Detrás de un proxy (Nginx, Caddy…) la dirección pública viene en las X-Forwarded-*.
    const proto = e.request.header.get("X-Forwarded-Proto") || (e.request.tls ? "https" : "http");
    const host = e.request.header.get("X-Forwarded-Host") || e.request.host;
    const md = tokens.guide(e.app, e.auth, e.get("apiToken") || null, `${proto}://${host}`);
    return e.string(200, md);
  },
  $apis.requireAuth("users"),
);

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
  // El pago unido a un programado: el registro automático tampoco lo vuelve a crear.
  const key = e.record.collection().name === "transactions" ? e.record.getString("recurring_key") : "";
  const owner = e.record.getString("owner");
  e.next();
  const dupes = require(`${__hooks}/lib/dupes.js`);
  // Al cargar un respaldo o borrarlo todo no es la persona descartando algo.
  if ((!ext && !key) || dupes.restoring(e.app, owner)) return;
  try {
    const ignored = require(`${__hooks}/lib/ignored.js`);
    if (ext) ignored.remember(e.app, owner, ext);
    if (key) ignored.remember(e.app, owner, key);
  } catch (err) {
    console.log("[finanzas] borrados: " + err);
  }
}, "transactions", "inbox");

// ---------- Movimiento creado desde un correo de la bandeja: ya está procesado ----------
onRecordAfterCreateSuccess((e) => {
  const ext = e.record.getString("external_id");
  if (ext) {
    try {
      const row = e.app.findFirstRecordByFilter("inbox", "owner = {:u} && external_id = {:e} && status = 'pendiente'", {
        u: e.record.getString("owner"),
        e: ext,
      });
      row.set("status", "procesado");
      e.app.save(row);
    } catch (_) {
      // No viene de la bandeja.
    }
  }
  e.next();
}, "transactions");

// ---------- Provisiones: al pagar se libera lo apartado (ver lib/provisions.js) ----------
onRecordAfterCreateSuccess((e) => {
  const dupes = require(`${__hooks}/lib/dupes.js`);
  if (!dupes.restoring(e.app, e.record.getString("owner"))) {
    try {
      require(`${__hooks}/lib/provisions.js`).onPaid(e.app, e.record);
    } catch (err) {
      // Liberar lo apartado nunca debe impedir guardar el pago.
      console.log("[finanzas] provisiones: " + err);
    }
  }
  e.next();
}, "transactions");

onRecordAfterDeleteSuccess((e) => {
  const dupes = require(`${__hooks}/lib/dupes.js`);
  if (!dupes.restoring(e.app, e.record.getString("owner"))) {
    try {
      require(`${__hooks}/lib/provisions.js`).onUnpaid(e.app, e.record);
    } catch (err) {
      console.log("[finanzas] provisiones: " + err);
    }
  }
  e.next();
}, "transactions");

// Sin su recurrente, la provisión no tiene para qué pagar: se va con lo apartado.
onRecordAfterDeleteSuccess((e) => {
  const id = e.record.getString("saving");
  if (id) {
    try {
      const s = e.app.findRecordById("savings", id);
      if (s.getString("kind") === "provision") e.app.delete(s);
    } catch (_) {}
  }
  e.next();
}, "recurring");

// ---------- Remitentes nuevos en Gmail: la próxima lectura mira 90 días atrás ----------
onRecordUpdate((e) => {
  if (e.record.getString("senders") !== e.record.original().getString("senders")) e.record.set("last_sync", "");
  e.next();
}, "gmail_connections");

// ---------- Cuenta con remitentes nuevos: también ----------
onRecordAfterCreateSuccess((e) => {
  if (e.record.getString("senders").length > 2) require(`${__hooks}/lib/sync.js`).rewind(e.app, e.record.getString("owner"));
  e.next();
}, "accounts");

onRecordAfterUpdateSuccess((e) => {
  if (e.record.getString("senders") !== e.record.original().getString("senders")) {
    require(`${__hooks}/lib/sync.js`).rewind(e.app, e.record.getString("owner"));
  }
  e.next();
}, "accounts");

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
    return e.json(200, { configured: gmail.configured(), redirectUri: c.redirectUri, defaultSenders: gmail.DEFAULT_SENDERS });
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
      conn.set("senders", gmail.DEFAULT_SENDERS);
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
      const r = sync.syncConnection(e.app, conn, { again: !!(e.requestInfo().body || {}).again });
      return e.json(200, { read: r.read, created: r.created, pending: r.pending, skipped: r.skipped });
    } catch (err) {
      throw new BadRequestError("No se pudo leer Gmail: " + (err && err.message ? err.message : err));
    }
  },
  $apis.requireAuth("users"),
);

// ---------- Revisar: los correos de Gmail y las reglas, sin guardar nada (ver lib/review.js) ----------

// Los correos tal como están en Gmail, incluidos la papelera y el spam, y lo
// que ya pasó con cada uno en la app y lo que haría hoy con él.
routerAdd(
  "GET",
  "/api/finanzas/gmail/messages",
  (e) => {
    const review = require(`${__hooks}/lib/review.js`);
    const q = e.request.url.query();
    const opts = {
      q: q.get("q"),
      all: q.get("all") === "true" || q.get("all") === "1",
      days: q.has("days") ? q.get("days") : 90,
      max: Math.min(100, +q.get("max") || 25),
      pageToken: q.get("pageToken"),
    };
    let src;
    try {
      src = review.fromGmail(e.app, e.auth.id, opts);
    } catch (err) {
      // Los errores ya explicados (sin Gmail, sin permiso) pasan tal cual.
      if (err && err.status) throw err;
      throw new BadRequestError("No se pudo leer Gmail: " + (err && err.message ? err.message : err));
    }
    const r = review.inspect(src.mails, review.load(e.app, e.auth.id));
    const full = q.get("full") === "true" || q.get("full") === "1";
    for (const m of r.messages) if (!full) m.text = m.text.slice(0, 500);
    return e.json(200, { query: src.query, next: src.next, estimate: src.estimate, count: r.messages.length, messages: r.messages });
  },
  $apis.requireAuth("users"),
);

// Qué harían las reglas con los correos, y qué tienen mal. Con `rule` se prueba
// una regla sin guardarla.
routerAdd(
  "POST",
  "/api/finanzas/rules/check",
  (e) => {
    const review = require(`${__hooks}/lib/review.js`);
    const body = e.requestInfo().body || {};
    const opts = { q: body.q, all: !!body.all, days: body.days === undefined ? 90 : body.days, max: body.max || 200, pageToken: body.pageToken };
    let src;
    try {
      src = body.source === "bandeja" ? review.fromInbox(e.app, e.auth.id, opts) : review.fromGmail(e.app, e.auth.id, opts);
    } catch (err) {
      // Los errores ya explicados (sin Gmail, sin permiso) pasan tal cual.
      if (err && err.status) throw err;
      throw new BadRequestError("No se pudo leer Gmail: " + (err && err.message ? err.message : err));
    }
    const r = review.inspect(src.mails, review.load(e.app, e.auth.id, body.rule || null));
    // Por defecto solo los correos que importan: con problemas o sin regla.
    const messages = body.messages === "all" ? r.messages : r.messages.filter((m) => m.problems.length || !m.rule);
    for (const m of messages) m.text = m.text.slice(0, 500);
    return e.json(200, { query: src.query, next: src.next, summary: r.summary, rules: r.rules, messages });
  },
  $apis.requireAuth("users"),
);

// ---------- Pegar texto: SMS o correos copiados, a la bandeja ----------

routerAdd(
  "POST",
  "/api/finanzas/import-text",
  (e) => {
    const inbox = require(`${__hooks}/lib/inbox.js`);
    const text = String((e.requestInfo().body || {}).text || "");
    if (!text.trim()) throw new BadRequestError("Pega al menos una notificación.");
    const blocks = inbox.splitText(text).slice(0, 500);
    const mails = blocks.map((b) => ({ id: inbox.textId(b), text: b, from: "", subject: "" }));
    return e.json(200, inbox.ingest(e.app, e.auth.id, mails, { source: "texto" }));
  },
  $apis.requireAuth("users"),
);

// ---------- La bandeja: sugerir, reglas y pasar las reglas por lo pendiente ----------

routerAdd(
  "POST",
  "/api/finanzas/inbox/suggest",
  (e) => {
    const inbox = require(`${__hooks}/lib/inbox.js`);
    const id = String((e.requestInfo().body || {}).id || "");
    if (!id) throw new BadRequestError("Falta el correo.");
    return e.json(200, inbox.suggestFor(e.app, e.auth.id, id));
  },
  $apis.requireAuth("users"),
);

// El HTML original de un correo de Gmail, para verlo como llegó. No se guarda:
// se pide a Gmail al abrirlo. Limpiarlo es cosa de la app (ver MailHtml.svelte).
routerAdd(
  "GET",
  "/api/finanzas/inbox/{id}/html",
  (e) => {
    const gmail = require(`${__hooks}/lib/gmail.js`);
    let row;
    try {
      row = e.app.findFirstRecordByFilter("inbox", "id = {:id} && owner = {:u}", { id: e.request.pathValue("id"), u: e.auth.id });
    } catch (_) {
      throw new NotFoundError("No está ese correo.");
    }
    if (row.getString("source") !== "gmail") return e.json(200, { html: "" });
    let conn;
    try {
      conn = e.app.findFirstRecordByFilter("gmail_connections", "owner = {:u} && refresh_token != ''", { u: e.auth.id });
    } catch (_) {
      return e.json(200, { html: "" });
    }
    try {
      const token = gmail.accessToken(conn.getString("refresh_token"));
      return e.json(200, { html: gmail.getHtml(token, row.getString("external_id")) });
    } catch (err) {
      throw new BadRequestError("No se pudo leer Gmail: " + (err && err.message ? err.message : err));
    }
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/finanzas/inbox/rule",
  (e) => {
    const inbox = require(`${__hooks}/lib/inbox.js`);
    const dryrun = require(`${__hooks}/lib/dryrun.js`);
    const body = e.requestInfo().body || {};
    const dry = dryrun.wanted(body);
    const r = dryrun.run(e.app, dry, (tx) => inbox.saveRule(tx, e.auth.id, body));
    if (dry) r.dry_run = true;
    return e.json(200, r);
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/finanzas/inbox/process",
  (e) => {
    const inbox = require(`${__hooks}/lib/inbox.js`);
    const dryrun = require(`${__hooks}/lib/dryrun.js`);
    const dry = dryrun.wanted(e.requestInfo().body);
    const report = { changes: [] };
    const created = dryrun.run(e.app, dry, (tx) => inbox.processPending(tx, e.auth.id, report));
    return e.json(200, { created, dry_run: dry, changes: report.changes.slice(0, 300) });
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
    const dryrun = require(`${__hooks}/lib/dryrun.js`);
    const body = e.requestInfo().body || {};
    const dry = dryrun.wanted(body);
    const report = { changes: [] };
    const changed = dryrun.run(e.app, dry, (tx) => rules.applyExisting(tx, e.auth.id, String(body.rule || ""), report));
    return e.json(200, { changed, dry_run: dry, changes: report.changes.slice(0, 300) });
  },
  $apis.requireAuth("users"),
);

// ---------- Comercios: su nombre a los movimientos que ya existen ----------

routerAdd(
  "POST",
  "/api/finanzas/merchants/apply",
  (e) => {
    const merchants = require(`${__hooks}/lib/merchants.js`);
    const dryrun = require(`${__hooks}/lib/dryrun.js`);
    const body = e.requestInfo().body || {};
    const dry = dryrun.wanted(body);
    const report = { changes: [], skipped: [] };
    const changed = dryrun.run(e.app, dry, (tx) => merchants.applyExisting(tx, e.auth.id, String(body.id || ""), report));
    return e.json(200, { changed, dry_run: dry, changes: report.changes.slice(0, 300), skipped: report.skipped.slice(0, 300) });
  },
  $apis.requireAuth("users"),
);

// ---------- Proyección: el plan de un mes y marcar lo programado (ver lib/plan.js) ----------

routerAdd(
  "GET",
  "/api/finanzas/plan",
  (e) => {
    const plan = require(`${__hooks}/lib/plan.js`);
    const q = e.request.url.query();
    const ym = String(q.get("ym") || plan.today().slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(ym)) throw new BadRequestError("El mes va como AAAA-MM, por ejemplo 2026-09.");
    const months = q.get("months");
    return e.json(200, plan.monthPlan(e.app, e.auth.id, ym, { only: String(q.get("recurring") || ""), months: months === "" ? undefined : months }));
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/finanzas/recurring/mark",
  (e) => {
    const plan = require(`${__hooks}/lib/plan.js`);
    const dryrun = require(`${__hooks}/lib/dryrun.js`);
    const body = e.requestInfo().body || {};
    const dry = dryrun.wanted(body);
    const r = dryrun.run(e.app, dry, (tx) => plan.mark(tx, e.auth.id, body));
    r.dry_run = dry;
    return e.json(200, r);
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
