/// <reference path="../pb_data/types.d.ts" />

/**
 * Lo importado que se borró: el `external_id` de un movimiento que vino del
 * banco (Gmail, texto pegado, CSV) o de un fijo. Sin esto, una lectura de Gmail
 * desde cero (una conexión nueva, un respaldo cargado en otro servidor) lo
 * volvía a crear. Ver pb_hooks/lib/ignored.js.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const OWN = "owner = @request.auth.id";
    const col = new Collection({
      type: "base",
      name: "ignored_imports",
      listRule: OWN,
      viewRule: OWN,
      // Los crea el servidor al borrar; la persona puede quitarlos para que vuelva.
      createRule: null,
      updateRule: null,
      deleteRule: OWN,
      fields: [
        { name: "owner", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { name: "external_id", type: "text", required: true, max: 300 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_ignored_owner_ext ON ignored_imports (owner, external_id)"],
    });
    app.save(col);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("ignored_imports"));
  },
);
