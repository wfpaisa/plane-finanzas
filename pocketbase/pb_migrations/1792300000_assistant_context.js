/// <reference path="../pb_data/types.d.ts" />

/**
 * El contexto para el asistente: lo que la persona quiere que la IA sepa al
 * leer sus mensajes (qué llave o terminación es qué cuenta, en qué categoría
 * va cada comercio). Texto libre; se lee y se cambia por la ruta
 * /api/finanzas/contexto y va dentro de la guía. Es oculto: otra persona
 * puede ver el registro de usuario (para compartir ahorros) y no debe leerlo.
 * Ver pb_hooks/lib/tokens.js.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new TextField({ name: "assistant_context", max: 10000, hidden: true }));
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("assistant_context");
    app.save(users);
  },
);
