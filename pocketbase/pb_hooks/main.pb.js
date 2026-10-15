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

// El token de cada persona: verlo, crearlo o cambiar su permiso, y borrarlo.
// Un token no llega aquí (ver DENIED en lib/tokens.js): hace falta la sesión.
routerAdd(
  "GET",
  "/api/finanzas/tokens",
  (e) => {
    const tokens = require(`${__hooks}/lib/tokens.js`);
    return e.json(200, tokens.mine(e.app, e.auth.id));
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/finanzas/tokens",
  (e) => {
    const tokens = require(`${__hooks}/lib/tokens.js`);
    return e.json(200, tokens.save(e.app, e.auth.id, e.requestInfo().body));
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "DELETE",
  "/api/finanzas/tokens",
  (e) => {
    const tokens = require(`${__hooks}/lib/tokens.js`);
    tokens.clear(e.app, e.auth.id);
    return e.json(200, { token: null });
  },
  $apis.requireAuth("users"),
);

// El contexto para el asistente: lo usan la app y los tokens (uno de solo
// lectura puede leerlo, no cambiarlo).
routerAdd(
  "GET",
  "/api/finanzas/contexto",
  (e) => {
    const tokens = require(`${__hooks}/lib/tokens.js`);
    return e.json(200, tokens.context(e.app, e.auth.id));
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "PUT",
  "/api/finanzas/contexto",
  (e) => {
    const tokens = require(`${__hooks}/lib/tokens.js`);
    return e.json(200, tokens.saveContext(e.app, e.auth.id, e.requestInfo().body));
  },
  $apis.requireAuth("users"),
);

// Los correos que revisa un asistente: cuáles ya se registraron o se
// descartaron (ver lib/mail.js).
routerAdd(
  "GET",
  "/api/finanzas/correos",
  (e) => {
    const mail = require(`${__hooks}/lib/mail.js`);
    return e.json(200, mail.status(e.app, e.auth.id, e.request.url.query().get("ids")));
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/finanzas/correos/descartar",
  (e) => {
    const mail = require(`${__hooks}/lib/mail.js`);
    return e.json(200, mail.skip(e.app, e.auth.id, (e.requestInfo().body || {}).ids));
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

// ---------- Invitaciones: la única forma de tener cuenta ----------
// Ver `pb_migrations/1792500000_invitations.js`. El enlace vence a los 7 días;
// quien invita puede volver a copiarlo, renovarlo o cancelar la invitación.

routerAdd(
  "POST",
  "/api/finanzas/invitations",
  (e) => {
    const inv = require(`${__hooks}/lib/invitations.js`);
    const body = e.requestInfo().body || {};
    return e.json(200, inv.create(e.app, e.auth.id, body.email, body.name));
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "POST",
  "/api/finanzas/invitations/{id}/renew",
  (e) => {
    const inv = require(`${__hooks}/lib/invitations.js`);
    return e.json(200, inv.renew(e.app, e.auth.id, e.request.pathValue("id")));
  },
  $apis.requireAuth("users"),
);

routerAdd(
  "DELETE",
  "/api/finanzas/invitations/{id}",
  (e) => {
    const inv = require(`${__hooks}/lib/invitations.js`);
    inv.cancel(e.app, e.auth.id, e.request.pathValue("id"));
    return e.noContent(204);
  },
  $apis.requireAuth("users"),
);

// Sin sesión: lo que ve la persona invitada al abrir el enlace.
routerAdd("GET", "/api/finanzas/invite/{token}", (e) => {
  const inv = require(`${__hooks}/lib/invitations.js`);
  return e.json(200, inv.describe(e.app, e.request.pathValue("token")));
});

// Sin sesión: la persona invitada elige su clave y queda dentro.
routerAdd("POST", "/api/finanzas/invite/{token}", (e) => {
  const inv = require(`${__hooks}/lib/invitations.js`);
  const body = e.requestInfo().body || {};
  const user = inv.accept(e.app, e.request.pathValue("token"), body.password);
  return $apis.recordAuthResponse(e, user, "password");
});

// Sin sesión: en una instalación nueva, sin usuarios, la primera cuenta.
routerAdd("GET", "/api/finanzas/setup", (e) => {
  const inv = require(`${__hooks}/lib/invitations.js`);
  return e.json(200, { open: inv.setupOpen(e.app) });
});

routerAdd("POST", "/api/finanzas/setup", (e) => {
  const inv = require(`${__hooks}/lib/invitations.js`);
  const body = e.requestInfo().body || {};
  const user = inv.setup(e.app, body.email, body.name, body.password);
  return $apis.recordAuthResponse(e, user, "password");
});

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

// ---------- Lo que creó el registro automático y se borra no vuelve (ver lib/ignored.js) ----------
onRecordDelete((e) => {
  const ext = e.record.getString("external_id");
  // El pago unido a un programado: el registro automático tampoco lo vuelve a crear.
  const key = e.record.getString("recurring_key");
  const owner = e.record.getString("owner");
  e.next();
  const restoring = require(`${__hooks}/lib/restoring.js`);
  // Al cargar un respaldo o borrarlo todo no es la persona descartando algo.
  if ((!ext && !key) || restoring.restoring(e.app, owner)) return;
  try {
    const ignored = require(`${__hooks}/lib/ignored.js`);
    if (ext) ignored.remember(e.app, owner, ext);
    if (key) ignored.remember(e.app, owner, key);
  } catch (err) {
    console.log("[finanzas] borrados: " + err);
  }
}, "transactions");

// ---------- Provisiones: al pagar se libera lo apartado (ver lib/provisions.js) ----------
onRecordAfterCreateSuccess((e) => {
  const restoring = require(`${__hooks}/lib/restoring.js`);
  if (!restoring.restoring(e.app, e.record.getString("owner"))) {
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
  const restoring = require(`${__hooks}/lib/restoring.js`);
  if (!restoring.restoring(e.app, e.record.getString("owner"))) {
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
    const restoring = require(`${__hooks}/lib/restoring.js`);
    let counts;
    // Borrarlo todo es empezar de cero: tampoco se recuerda lo borrado.
    restoring.setRestoring(e.app, e.auth.id, true);
    try {
      e.app.runInTransaction((tx) => {
        counts = backup.clean(tx, e.auth.id);
        backup.seedCategories(tx, e.auth.id);
      });
    } finally {
      restoring.setRestoring(e.app, e.auth.id, false);
    }
    return e.json(200, counts);
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
