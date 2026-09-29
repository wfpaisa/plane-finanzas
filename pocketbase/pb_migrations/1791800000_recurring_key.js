/// <reference path="../pb_data/types.d.ts" />

/**
 * Un movimiento que ya existía (uno que llegó por Gmail) puede ser el pago de
 * un movimiento programado: `recurring_key` lleva la marca de ese mes
 * (`rec:<id>:<AAAA-MM>`), la misma que va en `external_id` cuando el
 * movimiento lo crea la app. El `external_id` de lo importado es el id del
 * correo y no se puede cambiar. Ver pb_hooks/lib/plan.js.
 */
migrate(
  (app) => {
    const tx = app.findCollectionByNameOrId("transactions");
    tx.fields.add(new TextField({ name: "recurring_key", max: 100 }));
    tx.addIndex("idx_tx_recurring_key", true, "owner, recurring_key", "recurring_key != ''");
    app.save(tx);
  },
  (app) => {
    const tx = app.findCollectionByNameOrId("transactions");
    tx.removeIndex("idx_tx_recurring_key");
    tx.fields.removeByName("recurring_key");
    app.save(tx);
  },
);
