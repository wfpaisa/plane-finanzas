/// <reference path="../pb_data/types.d.ts" />

/**
 * El tinte del fondo va con la persona y no con el navegador: al entrar con
 * otra cuenta en el mismo teléfono se ve el suyo. Es un hexadecimal
 * (`#3b82f6`) o vacío para la bruma de partida.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new Field({ name: "tint", type: "text", max: 7, pattern: "^(#[0-9a-fA-F]{6})?$" }));
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("tint");
    app.save(users);
  },
);
