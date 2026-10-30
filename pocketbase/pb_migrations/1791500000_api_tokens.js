/// <reference path="../pb_data/types.d.ts" />

/**
 * Tokens de acceso: para que un asistente o un programa use la API con la
 * cuenta de alguien sin su clave. El token solo se muestra al crearlo; aquí
 * se guarda su hash (`hash`, oculto) y el comienzo (`prefix`) para
 * reconocerlo en la lista. Se crean por su ruta, que genera el token en el
 * servidor; desde el cliente solo se listan y se borran. Ver
 * pb_hooks/lib/tokens.js.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const OWN = "owner = @request.auth.id";
    const tokens = new Collection({
      type: "base",
      name: "api_tokens",
      listRule: OWN,
      viewRule: OWN,
      createRule: null,
      updateRule: null,
      deleteRule: OWN,
      fields: [
        { name: "owner", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { name: "name", type: "text", required: true, max: 80 },
        { name: "prefix", type: "text", max: 20 },
        { name: "hash", type: "text", required: true, hidden: true, max: 100 },
        // "read": solo consultar; "write": consultar y cambiar.
        { name: "scope", type: "select", required: true, maxSelect: 1, values: ["read", "write"] },
        // Vacío: no vence.
        { name: "expires", type: "date" },
        { name: "last_used", type: "date" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_api_tokens_hash ON api_tokens (hash)", "CREATE INDEX idx_api_tokens_owner ON api_tokens (owner)"],
    });
    app.save(tokens);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("api_tokens"));
  },
);
