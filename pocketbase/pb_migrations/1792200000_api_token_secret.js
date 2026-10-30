/// <reference path="../pb_data/types.d.ts" />

/**
 * Un solo token por persona, que se puede volver a ver: se guarda en claro en
 * un campo oculto (`secret`), que solo entrega la ruta /api/finanzas/tokens a
 * la persona con su sesión. Los tokens de antes no lo tienen: siguen
 * funcionando, pero para verlo hay que crear uno nuevo. Ver
 * pb_hooks/lib/tokens.js.
 */
migrate(
  (app) => {
    const tokens = app.findCollectionByNameOrId("api_tokens");
    tokens.fields.add(new TextField({ name: "secret", hidden: true, max: 100 }));
    tokens.deleteRule = null;
    app.save(tokens);
  },
  (app) => {
    const tokens = app.findCollectionByNameOrId("api_tokens");
    tokens.fields.removeByName("secret");
    tokens.deleteRule = "owner = @request.auth.id";
    app.save(tokens);
  },
);
