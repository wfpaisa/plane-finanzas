/// <reference path="../pb_data/types.d.ts" />

/**
 * Un recurrente lleva todo lo que necesita su movimiento: puede ser una
 * transferencia (con su cuenta de destino) y traer etiquetas. El día del mes
 * pasa a ser opcional: 0 es "sin día fijo" (ver src/lib/finance.ts); antes
 * valía por el 1, y los que no lo tenían quedan en 1.
 */
migrate(
  (app) => {
    const rec = app.findCollectionByNameOrId("recurring");
    const accounts = app.findCollectionByNameOrId("accounts");
    rec.fields.getByName("kind").values = ["income", "expense", "transfer"];
    rec.fields.add(new RelationField({ name: "to_account", collectionId: accounts.id, maxSelect: 1, cascadeDelete: false }));
    rec.fields.add(new JSONField({ name: "tags", maxSize: 2000 }));
    const mine = " && (to_account = '' || to_account.owner = @request.auth.id)";
    rec.createRule += mine;
    rec.updateRule += mine;
    app.save(rec);
    // Hasta ahora, sin día era el día 1: los de antes lo siguen siendo.
    for (const r of app.findRecordsByFilter("recurring", "day_of_month = 0 && frequency != 'once'", "", 0, 0)) {
      r.set("day_of_month", 1);
      app.saveNoValidate(r);
    }
  },
  (app) => {
    const rec = app.findCollectionByNameOrId("recurring");
    for (const r of app.findRecordsByFilter("recurring", "kind = 'transfer'", "", 0, 0)) app.delete(r);
    const mine = " && (to_account = '' || to_account.owner = @request.auth.id)";
    rec.createRule = rec.createRule.replace(mine, "");
    rec.updateRule = rec.updateRule.replace(mine, "");
    rec.fields.removeByName("tags");
    rec.fields.removeByName("to_account");
    rec.fields.getByName("kind").values = ["income", "expense"];
    app.save(rec);
  },
);
