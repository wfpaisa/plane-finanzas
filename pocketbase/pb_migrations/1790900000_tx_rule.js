/// <reference path="../pb_data/types.d.ts" />

/**
 * Qué regla le puso la categoría, las etiquetas o la descripción a un
 * movimiento, para mostrarlo en la lista (ver pb_hooks/lib/rules.js). Al
 * borrar la regla el movimiento queda como está y sin la marca.
 */
migrate(
  (app) => {
    const tx = app.findCollectionByNameOrId("transactions");
    const rules = app.findCollectionByNameOrId("rules");
    tx.fields.add(new RelationField({ name: "rule", collectionId: rules.id, maxSelect: 1, cascadeDelete: false }));
    const mine = " && (rule = '' || rule.owner = @request.auth.id)";
    tx.createRule += mine;
    tx.updateRule += mine;
    tx.addIndex("idx_tx_rule", false, "rule", "");
    app.save(tx);
  },
  (app) => {
    const tx = app.findCollectionByNameOrId("transactions");
    const mine = " && (rule = '' || rule.owner = @request.auth.id)";
    tx.createRule = tx.createRule.replace(mine, "");
    tx.updateRule = tx.updateRule.replace(mine, "");
    tx.removeIndex("idx_tx_rule");
    tx.fields.removeByName("rule");
    app.save(tx);
  },
);
