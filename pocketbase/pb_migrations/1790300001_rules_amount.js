/// <reference path="../pb_data/types.d.ts" />

/**
 * Valor de la regla: si lo tiene, el movimiento debe traer ese mismo valor
 * además del texto. 0 o vacío: cualquier valor.
 */
migrate(
  (app) => {
    const rules = app.findCollectionByNameOrId("rules");
    rules.fields.add(new NumberField({ name: "amount", min: 0 }));
    app.save(rules);
  },
  (app) => {
    const rules = app.findCollectionByNameOrId("rules");
    rules.fields.removeByName("amount");
    app.save(rules);
  },
);
