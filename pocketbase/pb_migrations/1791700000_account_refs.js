/// <reference path="../pb_data/types.d.ts" />

// Cuentas: terminaciones y llaves con que la nombran los avisos ("*1234",
// "@ana123"). Con ellas el lector sabe de qué cuenta sale el dinero y si va a
// otra cuenta propia (ver pb_hooks/lib/refs.js).
migrate(
  (app) => {
    const accounts = app.findCollectionByNameOrId("accounts");
    accounts.fields.add(new JSONField({ name: "refs", maxSize: 4000 }));
    app.save(accounts);
  },
  (app) => {
    const accounts = app.findCollectionByNameOrId("accounts");
    accounts.fields.removeByName("refs");
    app.save(accounts);
  },
);
