/// <reference path="../pb_data/types.d.ts" />

// Notas de un programado: el enlace de pago, el número de referencia o lo que
// haga falta para pagarlo. Se ven al editarlo.
migrate(
  (app) => {
    const recurring = app.findCollectionByNameOrId("recurring");
    recurring.fields.add(new TextField({ name: "notes", max: 2000 }));
    app.save(recurring);
  },
  (app) => {
    const recurring = app.findCollectionByNameOrId("recurring");
    recurring.fields.removeByName("notes");
    app.save(recurring);
  },
);
