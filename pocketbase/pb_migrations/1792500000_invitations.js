/// <reference path="../pb_data/types.d.ts" />

/**
 * Solo por invitación: nadie crea su propia cuenta. Una persona registrada
 * invita a otra con su nombre y su correo; el servidor crea el usuario sin
 * clave utilizable y un enlace (`token`) para que la persona invitada elija
 * su clave al entrar por primera vez.
 *
 * Todo lo hacen las rutas de `pb_hooks/main.pb.js` (ver lib/invitations.js): la API no deja crear
 * usuarios ni invitaciones. Quien invita puede ver las suyas para volver a
 * copiar el enlace.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.createRule = null;
    app.save(users);

    const col = new Collection({
      type: "base",
      name: "invitations",
      listRule: "invited_by = @request.auth.id",
      viewRule: "invited_by = @request.auth.id",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "email", type: "email", required: true },
        { name: "name", type: "text", max: 100 },
        { name: "token", type: "text", required: true, min: 32, max: 64 },
        { name: "invited_by", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        // Al borrar el usuario invitado se va su invitación.
        { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { name: "expires", type: "date", required: true },
        { name: "accepted", type: "date" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_invitations_token ON invitations (token)",
        "CREATE INDEX idx_invitations_by ON invitations (invited_by)",
      ],
    });
    app.save(col);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("invitations"));
    const users = app.findCollectionByNameOrId("users");
    users.createRule = "";
    app.save(users);
  },
);
