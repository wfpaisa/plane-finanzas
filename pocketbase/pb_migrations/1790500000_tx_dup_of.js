/// <reference path="../pb_data/types.d.ts" />

/**
 * Posible repetido: cuando un movimiento anotado a mano y uno que trajo el
 * banco (Gmail, texto pegado, CSV) parecen el mismo, el que llega segundo
 * apunta al primero con `dup_of`. La persona decide si unirlos o no (ver
 * pb_hooks/lib/dupes.js).
 */
migrate(
  (app) => {
    const tx = app.findCollectionByNameOrId("transactions");
    tx.fields.add(new RelationField({ name: "dup_of", collectionId: tx.id, maxSelect: 1, cascadeDelete: false }));
    const mine = " && (dup_of = '' || dup_of.owner = @request.auth.id)";
    tx.createRule += mine;
    tx.updateRule += mine;
    app.save(tx);
  },
  (app) => {
    const tx = app.findCollectionByNameOrId("transactions");
    const mine = " && (dup_of = '' || dup_of.owner = @request.auth.id)";
    tx.createRule = tx.createRule.replace(mine, "");
    tx.updateRule = tx.updateRule.replace(mine, "");
    tx.fields.removeByName("dup_of");
    app.save(tx);
  },
);
