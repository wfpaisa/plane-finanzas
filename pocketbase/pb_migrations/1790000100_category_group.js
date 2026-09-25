/// <reference path="../pb_data/types.d.ts" />

/**
 * Fijos o variables: así se agrupan los gastos en el registro de siempre, y
 * es lo que decide cuánto queda "para gastar" en el mes. Y el origen "csv"
 * para lo que llega del registro exportado.
 */
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("categories");
    c.fields.add(new Field({ name: "group", type: "select", maxSelect: 1, values: ["fijo", "variable"] }));
    app.save(c);

    // Lo importado desde un CSV se marca aparte.
    const t = app.findCollectionByNameOrId("transactions");
    const source = t.fields.getByName("source");
    source.values = ["manual", "gmail", "texto", "recurrente", "csv"];
    app.save(t);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("categories");
    c.fields.removeByName("group");
    app.save(c);
  },
);
