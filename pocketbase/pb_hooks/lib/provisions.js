/**
 * Provisiones: lo que se aparta mes a mes para un gasto recurrente (el
 * predial, el SOAT) es un ahorro de tipo "provision" unido al recurrente
 * (`recurring.saving`). Al pagarlo, lo apartado se libera: un retiro por todo
 * lo que llevaba, con la marca `pay:<marca del pago>`. Si se paga más, lo
 * demás salió de la plata libre; si se paga menos, lo que sobra queda libre.
 * Al borrar el pago, el retiro se borra y lo apartado vuelve.
 */

/** El recurrente de un movimiento marcado (`rec:<id>:…`), si tiene provisión. */
function provisionOf(app, tx) {
  var ext = tx.getString("external_id");
  if (ext.indexOf("rec:") !== 0) return null;
  var id = ext.split(":")[1];
  try {
    var r = app.findRecordById("recurring", id);
    if (!r.getString("saving") || r.getString("owner") !== tx.getString("owner")) return null;
    return r;
  } catch (_) {
    return null;
  }
}

/** Lo que lleva un ahorro: la suma de sus movimientos. */
function balanceOf(app, savingId) {
  var list = app.findRecordsByFilter("saving_movements", "saving = {:s}", "", 0, 0, { s: savingId });
  var total = 0;
  for (var i = 0; i < list.length; i++) total += list[i].getFloat("amount");
  return Math.round(total);
}

/** Pagado: libera todo lo apartado. No hace nada si no hay provisión, nada apartado o ya se liberó. */
function onPaid(app, tx) {
  var r = provisionOf(app, tx);
  if (!r) return null;
  var saving = r.getString("saving");
  var key = "pay:" + tx.getString("external_id");
  try {
    app.findFirstRecordByFilter("saving_movements", "saving = {:s} && external_id = {:k}", { s: saving, k: key });
    return null;
  } catch (_) {}
  var saved = balanceOf(app, saving);
  if (saved <= 0) return null;
  var mv = new Record(app.findCollectionByNameOrId("saving_movements"));
  mv.set("saving", saving);
  var account = r.getString("account") || tx.getString("account");
  if (account) mv.set("account", account);
  mv.set("created_by", tx.getString("owner"));
  mv.set("amount", -saved);
  mv.set("date", tx.getString("date") || new Date().toISOString());
  mv.set("note", "Pago de " + r.getString("name"));
  mv.set("external_id", key);
  app.save(mv);
  return mv;
}

/** El pago se borró: lo apartado vuelve. */
function onUnpaid(app, tx) {
  var ext = tx.getString("external_id");
  if (ext.indexOf("rec:") !== 0) return;
  var list = app.findRecordsByFilter("saving_movements", "external_id = {:k} && created_by = {:u}", "", 0, 0, {
    k: "pay:" + ext,
    u: tx.getString("owner"),
  });
  for (var i = 0; i < list.length; i++) app.delete(list[i]);
}

module.exports = { onPaid: onPaid, onUnpaid: onUnpaid };
