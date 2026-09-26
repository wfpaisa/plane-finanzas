/// <reference path="../pb_data/types.d.ts" />

/**
 * Una regla puede descartar: los correos que la cumplen no se vuelven
 * movimiento ni esperan en la bandeja. Ver pb_hooks/lib/inbox.js.
 */
migrate(
  (app) => {
    const rules = app.findCollectionByNameOrId("rules");
    rules.fields.getByName("type").values = ["income", "expense", "transfer", "discard"];
    app.save(rules);
  },
  (app) => {
    const rules = app.findCollectionByNameOrId("rules");
    for (const r of app.findRecordsByFilter("rules", "type = 'discard'", "", 0, 0)) app.delete(r);
    rules.fields.getByName("type").values = ["income", "expense", "transfer"];
    app.save(rules);
  },
);
