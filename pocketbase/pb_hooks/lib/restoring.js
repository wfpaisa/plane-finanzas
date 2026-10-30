/**
 * Mientras se carga un respaldo o se borra todo, lo que pasa no es la persona
 * decidiendo: no se recuerda lo borrado ni se libera lo reservado.
 */

function restoring(app, userId) {
  return app.store().has("finanzas:restoring:" + userId);
}

function setRestoring(app, userId, on) {
  if (on) app.store().set("finanzas:restoring:" + userId, true);
  else app.store().remove("finanzas:restoring:" + userId);
}

module.exports = { restoring: restoring, setRestoring: setRestoring };
