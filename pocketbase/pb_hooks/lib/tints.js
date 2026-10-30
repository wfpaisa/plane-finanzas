/**
 * El color automático de una categoría.
 *
 * Son veinte tintes (`tint-1`..`tint-20`: los diez de theme.css y diez más de
 * finanzas.css). Se elige el que menos se repite entre las categorías del
 * mismo tipo (gasto o ingreso) del usuario, y entre todas si hay empate: así
 * cada categoría tiene uno propio hasta que se acaban. La web hace la misma
 * cuenta para enseñarlo antes de guardar (`nextCategoryTint` en
 * src/lib/palettes.ts).
 */
var COUNT = 20;

function pick(cats, kind) {
  var best = "tint-1";
  var bestScore = Infinity;
  for (var i = 1; i <= COUNT; i++) {
    var t = "tint-" + i;
    var same = 0;
    var all = 0;
    for (var j = 0; j < cats.length; j++) {
      if (cats[j].color !== t) continue;
      all++;
      if (cats[j].kind === kind) same++;
    }
    var score = same * 1000 + all;
    if (score < bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

/** Las categorías del usuario, en forma simple, sin la que se excluye. */
function load(app, owner, exceptId) {
  var rows = app.findRecordsByFilter("categories", "owner = {:o}", "created", 1000, 0, { o: owner });
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (exceptId && rows[i].id === exceptId) continue;
    out.push({ kind: rows[i].getString("kind"), color: rows[i].getString("color") });
  }
  return out;
}

module.exports = { COUNT: COUNT, pick: pick, load: load };
