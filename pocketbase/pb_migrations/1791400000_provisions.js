/// <reference path="../pb_data/types.d.ts" />

/**
 * Provisiones: un gasto recurrente (el predial, el SOAT) que se aparta mes a
 * mes en una cuenta y se libera al pagarlo. Lo apartado es un ahorro de tipo
 * "provision" unido al recurrente (`recurring.saving`): así la cuenta muestra
 * cuánto está apartado, sin que salga en la página de ahorros ni se reste dos
 * veces en el plan. Ver src/lib/finance.ts y pb_hooks/lib/provisions.js.
 */
migrate(
  (app) => {
    const savings = app.findCollectionByNameOrId("savings");
    // Vacío: un ahorro con meta, como siempre.
    savings.fields.add(new SelectField({ name: "kind", maxSelect: 1, values: ["goal", "provision"] }));
    app.save(savings);

    const rec = app.findCollectionByNameOrId("recurring");
    rec.fields.add(new RelationField({ name: "saving", collectionId: savings.id, maxSelect: 1, cascadeDelete: false }));
    const mine = " && (saving = '' || saving.owner = @request.auth.id)";
    rec.createRule += mine;
    rec.updateRule += mine;
    app.save(rec);
  },
  (app) => {
    const rec = app.findCollectionByNameOrId("recurring");
    const mine = " && (saving = '' || saving.owner = @request.auth.id)";
    rec.createRule = rec.createRule.replace(mine, "");
    rec.updateRule = rec.updateRule.replace(mine, "");
    rec.fields.removeByName("saving");
    app.save(rec);

    for (const s of app.findRecordsByFilter("savings", "kind = 'provision'", "", 0, 0)) app.delete(s);
    const savings = app.findCollectionByNameOrId("savings");
    savings.fields.removeByName("kind");
    app.save(savings);
  },
);
