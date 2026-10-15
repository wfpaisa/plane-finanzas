/**
 * Invitaciones: una persona registrada invita a otra y el servidor crea su
 * usuario con una clave al azar que nadie conoce. El enlace lleva un `token`
 * que sirve una sola vez para elegir la clave de verdad.
 */

var DAYS = 7;

function expiresAt() {
  return new Date(Date.now() + DAYS * 864e5).toISOString().replace("T", " ");
}

function expired(rec) {
  var s = rec.getString("expires");
  return !s || new Date(s.replace(" ", "T")).getTime() < Date.now();
}

function view(rec) {
  return {
    id: rec.id,
    email: rec.getString("email"),
    name: rec.getString("name"),
    token: rec.getString("token"),
    expires: rec.getString("expires"),
    accepted: rec.getString("accepted"),
  };
}

/** La invitación de quien la pide; si no es suya, como si no existiera. */
function mine(app, who, id) {
  var rec;
  try {
    rec = app.findRecordById("invitations", id);
  } catch (_) {
    throw new NotFoundError("No se encontró la invitación.");
  }
  if (rec.getString("invited_by") !== who) throw new NotFoundError("No se encontró la invitación.");
  return rec;
}

function byToken(app, token) {
  token = String(token || "");
  if (token.length < 32) throw new NotFoundError("Este enlace de invitación no es válido.");
  var rec;
  try {
    rec = app.findFirstRecordByData("invitations", "token", token);
  } catch (_) {
    throw new NotFoundError("Este enlace de invitación no es válido.");
  }
  if (rec.getString("accepted")) throw new BadRequestError("Esta invitación ya se usó. Entra con tu correo y tu clave.");
  if (expired(rec)) throw new BadRequestError("Este enlace de invitación venció. Pídele a quien te invitó que lo renueve.");
  return rec;
}

function create(app, who, email, name) {
  email = String(email || "")
    .trim()
    .toLowerCase();
  name = String(name || "").trim();
  if (!email || email.indexOf("@") < 1) throw new BadRequestError("Escribe un correo válido.");
  if (!name) throw new BadRequestError("Escribe el nombre de la persona.");

  var existing = null;
  try {
    existing = app.findAuthRecordByEmail("users", email);
  } catch (_) {}

  if (existing) {
    var pending = null;
    try {
      pending = app.findFirstRecordByFilter("invitations", "user = {:u} && accepted = ''", { u: existing.id });
    } catch (_) {}
    if (!pending) throw new BadRequestError("Ya hay una cuenta con ese correo. Esa persona puede entrar con su clave.");
    if (pending.getString("invited_by") !== who)
      throw new BadRequestError("Esa persona ya tiene una invitación pendiente de otra persona.");
    // La misma invitación: se renueva y se devuelve su enlace.
    pending.set("expires", expiresAt());
    app.save(pending);
    return view(pending);
  }

  var result;
  app.runInTransaction(function (tx) {
    var user = new Record(tx.findCollectionByNameOrId("users"));
    user.setEmail(email);
    user.set("name", name);
    user.setPassword($security.randomString(40));
    tx.save(user);

    var inv = new Record(tx.findCollectionByNameOrId("invitations"));
    inv.set("email", email);
    inv.set("name", name);
    inv.set("token", $security.randomString(48));
    inv.set("invited_by", who);
    inv.set("user", user.id);
    inv.set("expires", expiresAt());
    tx.save(inv);
    result = view(inv);
  });
  return result;
}

function renew(app, who, id) {
  var rec = mine(app, who, id);
  if (rec.getString("accepted")) throw new BadRequestError("Esta invitación ya se aceptó.");
  rec.set("expires", expiresAt());
  app.save(rec);
  return view(rec);
}

/** Cancelar una invitación sin usar borra también su usuario, que nunca entró. */
function cancel(app, who, id) {
  var rec = mine(app, who, id);
  if (rec.getString("accepted")) throw new BadRequestError("Esta invitación ya se aceptó y no se puede cancelar.");
  app.delete(app.findRecordById("users", rec.getString("user")));
}

function describe(app, token) {
  var rec = byToken(app, token);
  var by = "";
  try {
    var u = app.findRecordById("users", rec.getString("invited_by"));
    by = u.getString("name") || u.email();
  } catch (_) {}
  return { email: rec.getString("email"), name: rec.getString("name"), invited_by: by };
}

/** Pone la clave elegida, marca la invitación como usada y devuelve el usuario. */
function accept(app, token, password) {
  password = String(password || "");
  if (password.length < 8) throw new BadRequestError("La clave debe tener al menos 8 caracteres.");
  var rec = byToken(app, token);
  var user = app.findRecordById("users", rec.getString("user"));
  app.runInTransaction(function (tx) {
    user.setPassword(password);
    user.setVerified(true);
    tx.save(user);
    rec.set("accepted", new Date().toISOString().replace("T", " "));
    tx.save(rec);
  });
  return user;
}

/** Sin ningún usuario todavía (instalación nueva), la primera persona se registra sola. */
function setupOpen(app) {
  return app.countRecords("users") === 0;
}

function setup(app, email, name, password) {
  if (!setupOpen(app)) throw new ForbiddenError("Ya hay cuentas creadas. Pide a alguien que ya use la aplicación que te invite.");
  email = String(email || "")
    .trim()
    .toLowerCase();
  name = String(name || "").trim();
  password = String(password || "");
  if (!email || email.indexOf("@") < 1) throw new BadRequestError("Escribe un correo válido.");
  if (!name) throw new BadRequestError("Escribe tu nombre.");
  if (password.length < 8) throw new BadRequestError("La clave debe tener al menos 8 caracteres.");
  var user = new Record(app.findCollectionByNameOrId("users"));
  user.setEmail(email);
  user.set("name", name);
  user.setPassword(password);
  user.setVerified(true);
  app.save(user);
  return user;
}

module.exports = {
  create: create,
  renew: renew,
  cancel: cancel,
  describe: describe,
  accept: accept,
  setupOpen: setupOpen,
  setup: setup,
};
