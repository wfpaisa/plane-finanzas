/// <reference path="../pb_data/types.d.ts" />

// Tarjetas de crédito: su cupo. Lo disponible de la tarjeta es el cupo más su
// saldo (negativo mientras se deba).
migrate(
  (app) => {
    const accounts = app.findCollectionByNameOrId("accounts");
    accounts.fields.add(new NumberField({ name: "credit_limit", min: 0 }));
    app.save(accounts);
  },
  (app) => {
    const accounts = app.findCollectionByNameOrId("accounts");
    accounts.fields.removeByName("credit_limit");
    app.save(accounts);
  },
);
