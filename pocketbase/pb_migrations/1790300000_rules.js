/// <reference path="../pb_data/types.d.ts" />

/**
 * Reglas: "si el movimiento dice X, es tal cosa". Afinan lo que llega de
 * Gmail (o del texto pegado) más allá de las palabras clave de las
 * categorías: además de la categoría ponen etiquetas, cambian la descripción
 * por una legible y dejan el texto del banco en las notas.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const categories = app.findCollectionByNameOrId("categories");
    const OWN = "owner = @request.auth.id";

    const rules = new Collection({
      type: "base",
      name: "rules",
      listRule: OWN,
      viewRule: OWN,
      createRule: `@request.auth.id != "" && ${OWN}`,
      updateRule: `${OWN} && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)`,
      deleteRule: OWN,
      fields: [
        { name: "owner", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        // Uno o varios textos separados por coma; basta con que aparezca uno.
        { name: "match", type: "text", required: true, max: 500 },
        { name: "category", type: "relation", collectionId: categories.id, maxSelect: 1, cascadeDelete: false },
        { name: "tags", type: "json", maxSize: 2000 },
        // Admite {mes}, {año} y {original}.
        { name: "description", type: "text", max: 200 },
        { name: "to_notes", type: "bool" },
        { name: "paused", type: "bool" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_rules_owner ON rules (owner)"],
    });
    app.save(rules);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("rules"));
  },
);
