/// <reference path="../pb_data/types.d.ts" />

/**
 * Al editar, las reglas miran el registro como estaba: `account.owner =
 * @request.auth.id` revisa la cuenta de antes, no la que llega. Así cualquiera
 * podía mover un movimiento suyo a la cuenta de otra persona (sabiendo su id)
 * y cambiarle el saldo. Ahora también se revisa lo que llega en
 * `@request.body`: cada relación que cambia debe ser de quien edita.
 */

/** `campo` que llega, si llega, debe cumplir `cond` (o venir vacío si `empty`). */
const body = (field, cond, empty) =>
  ` && (@request.body.${field}:isset = false${empty ? ` || @request.body.${field} = ''` : ""} || ${cond})`;

const own = (field) => `@request.body.${field}.owner = @request.auth.id`;

const RULES = {
  transactions: body("account", own("account"), false) + body("to_account", own("to_account"), true) + body("category", own("category"), true),
  recurring:
    body("account", own("account"), true) +
    body("to_account", own("to_account"), true) +
    body("category", own("category"), true) +
    body("saving", own("saving"), true),
  saving_movements:
    // Quien lo creó no cambia; el ahorro nuevo debe ser uno en el que participa,
    // y la cuenta, de quien edita o de quien lo creó (como la regla de antes).
    " && (@request.body.created_by:isset = false || @request.body.created_by = created_by)" +
    body("saving", `(${own("saving")} || @request.body.saving.members.id ?= @request.auth.id)`, false) +
    body("account", `(${own("account")} || @request.body.account.owner = created_by)`, true),
};

migrate(
  (app) => {
    for (const [name, extra] of Object.entries(RULES)) {
      const c = app.findCollectionByNameOrId(name);
      c.updateRule += extra;
      app.save(c);
    }
  },
  (app) => {
    for (const [name, extra] of Object.entries(RULES)) {
      const c = app.findCollectionByNameOrId(name);
      c.updateRule = c.updateRule.replace(extra, "");
      app.save(c);
    }
  },
);
