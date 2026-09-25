/// <reference path="../pb_data/types.d.ts" />

/**
 * Etiquetas en las categorías, en vez del grupo fijo/variable.
 *
 * El grupo era un solo valor de dos posibles; las etiquetas son libres y una
 * categoría puede llevar varias. Lo que ya estaba agrupado pasa a la etiqueta
 * del mismo nombre ("fijo" o "variable"), así las cuentas de fijos del móvil
 * siguen dando lo mismo. Se escriben como las de los movimientos: minúsculas
 * y sin comas.
 */
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("categories");
    c.fields.add(new Field({ name: "tags", type: "json", maxSize: 2000 }));
    app.save(c);

    for (const r of app.findRecordsByFilter("categories", "group != ''", "", 0, 0)) {
      r.set("tags", [r.getString("group")]);
      app.save(r);
    }

    c.fields.removeByName("group");
    app.save(c);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("categories");
    c.fields.add(new Field({ name: "group", type: "select", maxSelect: 1, values: ["fijo", "variable"] }));
    app.save(c);

    for (const r of app.findRecordsByFilter("categories", "id != ''", "", 0, 0)) {
      let tags = [];
      try {
        tags = JSON.parse(r.getString("tags") || "[]") || [];
      } catch (_) {
        tags = [];
      }
      const g = tags.indexOf("fijo") >= 0 ? "fijo" : tags.indexOf("variable") >= 0 ? "variable" : "";
      if (g) {
        r.set("group", g);
        app.save(r);
      }
    }

    c.fields.removeByName("tags");
    app.save(c);
  },
);
