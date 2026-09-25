/// <reference path="../pb_data/types.d.ts" />

/**
 * Un color propio para cada categoría que ya existe.
 *
 * Hasta ahora las de partida y las del CSV repetían tintes (y Ajustes no
 * dejaba elegirlo). Por usuario, la primera de cada color lo conserva y las
 * que lo repiten reciben el tinte menos usado entre las de su tipo, de los
 * veinte que hay ahora. Es la misma cuenta de `pb_hooks/lib/tints.js`, escrita
 * aquí porque las migraciones no ven esa carpeta.
 */
migrate(
  (app) => {
    const COUNT = 20;
    const rows = app.findRecordsByFilter("categories", "id != ''", "owner,created", 0, 0);
    const byOwner = {};
    for (const r of rows) (byOwner[r.getString("owner")] ||= []).push(r);

    for (const owner in byOwner) {
      const kept = [];
      const later = [];
      const seen = {};
      for (const r of byOwner[owner]) {
        const key = r.getString("kind") + ":" + r.getString("color");
        if (r.getString("color") && !seen[key]) {
          seen[key] = true;
          kept.push({ kind: r.getString("kind"), color: r.getString("color") });
        } else later.push(r);
      }
      for (const r of later) {
        const kind = r.getString("kind");
        let best = "tint-1";
        let bestScore = Infinity;
        for (let i = 1; i <= COUNT; i++) {
          const t = "tint-" + i;
          let same = 0;
          let all = 0;
          for (const c of kept) {
            if (c.color !== t) continue;
            all++;
            if (c.kind === kind) same++;
          }
          if (same * 1000 + all < bestScore) {
            best = t;
            bestScore = same * 1000 + all;
          }
        }
        r.set("color", best);
        app.saveNoValidate(r);
        kept.push({ kind, color: best });
      }
    }
  },
  () => {
    // Nada que deshacer: los colores de antes no se guardaron.
  },
);
