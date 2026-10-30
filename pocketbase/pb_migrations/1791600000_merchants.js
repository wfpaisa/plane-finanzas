/// <reference path="../pb_data/types.d.ts" />

/**
 * Comercios: el nombre limpio de un comercio ("IKEA ENVIGADO" -> "Ikea") y,
 * si se quiere, su categoría. Se reconoce por el comercio que se leyó del
 * correo: basta con que contenga alguno de los textos de `match`. Con uno,
 * una sola regla general ("{comercio}") sirve para todas las compras. Ver
 * pb_hooks/lib/merchants.js.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const categories = app.findCollectionByNameOrId("categories");
    const OWN = "owner = @request.auth.id";
    const mineCat = "(category = '' || category.owner = @request.auth.id)";
    const merchants = new Collection({
      type: "base",
      name: "merchants",
      listRule: OWN,
      viewRule: OWN,
      createRule: `@request.auth.id != "" && ${OWN} && ${mineCat}`,
      updateRule: `${OWN} && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id) && ${mineCat}`,
      deleteRule: OWN,
      fields: [
        { name: "owner", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        // Uno o varios textos separados por coma; basta con que aparezca uno.
        { name: "match", type: "text", required: true, max: 500 },
        { name: "name", type: "text", required: true, max: 120 },
        { name: "category", type: "relation", collectionId: categories.id, maxSelect: 1, cascadeDelete: false },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_merchants_owner ON merchants (owner)"],
    });
    app.save(merchants);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("merchants"));
  },
);
