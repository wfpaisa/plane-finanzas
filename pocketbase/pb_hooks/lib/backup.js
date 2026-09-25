/**
 * Respaldo de un usuario: exportar todo a un JSON, borrarlo todo y volverlo a
 * cargar desde ese JSON.
 *
 * Los ids no viajan tal cual: al importar cada registro se crea con un id
 * nuevo y las relaciones se traducen, así el mismo respaldo sirve para otra
 * cuenta u otro servidor. Los adjuntos de las transacciones (archivos) no se
 * exportan, ni el token de Gmail: la conexión se queda como está.
 *
 * Los ahorros compartidos: se exportan y se borran los propios. En los ajenos
 * no se toca nada, tampoco los aportes que uno hizo ahí.
 */

var defaults = require(__hooks + "/lib/defaults.js");

var VERSION = 1;

// Los campos que se guardan de cada colección, sin id, dueño ni fechas de registro.
var FIELDS = {
  categories: ["name", "kind", "icon", "color", "keywords", "budget", "group"],
  accounts: ["name", "type", "bank", "palette", "icon", "initial_balance", "match_keys", "exclude_from_total", "archived", "sort", "notes"],
  recurring: ["name", "kind", "amount", "frequency", "day_of_month", "month", "start_date", "end_date", "category", "account", "paused", "auto_create"],
  transactions: ["type", "date", "account", "to_account", "category", "amount", "description", "notes", "tags", "source", "external_id", "raw"],
  savings: ["members", "name", "icon", "palette", "target_amount", "target_date", "monthly_amount", "day_of_month", "annual_rate", "allocations", "auto", "archived", "notes"],
  saving_movements: ["saving", "account", "created_by", "amount", "date", "note", "external_id"],
  rules: ["match", "amount", "category", "tags", "description", "to_notes", "paused"],
};

function plainOf(record, fields) {
  var all = JSON.parse(JSON.stringify(record));
  var out = { id: record.id };
  for (var i = 0; i < fields.length; i++) out[fields[i]] = all[fields[i]];
  return out;
}

function own(app, name, userId) {
  return app.findRecordsByFilter(name, "owner = {:u}", "created", 0, 0, { u: userId });
}

function exportData(app, userId) {
  var data = {};
  var names = ["categories", "accounts", "recurring", "transactions", "savings", "rules"];
  for (var i = 0; i < names.length; i++) {
    data[names[i]] = own(app, names[i], userId).map(function (r) {
      return plainOf(r, FIELDS[names[i]]);
    });
  }
  data.saving_movements = app
    .findRecordsByFilter("saving_movements", "saving.owner = {:u}", "created", 0, 0, { u: userId })
    .map(function (r) {
      return plainOf(r, FIELDS.saving_movements);
    });

  var gmail = null;
  try {
    var g = app.findFirstRecordByFilter("gmail_connections", "owner = {:u}", { u: userId });
    gmail = { query: g.getString("query"), paused: g.getBool("paused") };
  } catch (_) {
    // Sin Gmail conectado.
  }
  data.gmail = gmail;

  var user = app.findRecordById("users", userId);
  return {
    app: "finanzas",
    version: VERSION,
    exported: new Date().toISOString(),
    user: user.email(),
    data: data,
  };
}

function seedCategories(app, userId) {
  var col = app.findCollectionByNameOrId("categories");
  for (var i = 0; i < defaults.categories.length; i++) {
    var c = defaults.categories[i];
    var r = new Record(col);
    r.set("owner", userId);
    r.set("name", c.name);
    r.set("kind", c.kind);
    r.set("icon", c.icon);
    if (c.color) r.set("color", c.color);
    r.set("keywords", c.keywords);
    if (c.group) r.set("group", c.group);
    app.save(r);
  }
}

/**
 * Borra todo lo del usuario. La conexión de Gmail se queda, pero vuelve a
 * leer desde cero en la próxima sincronización.
 */
function clean(app, userId) {
  var counts = {};
  // Primero lo que depende de otros, para que ningún borrado en cascada
  // descuadre la cuenta.
  var names = ["rules", "transactions", "recurring", "savings", "accounts", "categories"];
  for (var i = 0; i < names.length; i++) {
    var list = own(app, names[i], userId);
    for (var j = 0; j < list.length; j++) app.delete(list[j]);
    counts[names[i]] = list.length;
  }
  try {
    var g = app.findFirstRecordByFilter("gmail_connections", "owner = {:u}", { u: userId });
    g.set("last_sync", "");
    g.set("last_result", null);
    app.save(g);
  } catch (_) {
    // Sin Gmail conectado.
  }
  return counts;
}

function userExists(app, id) {
  if (!id) return false;
  try {
    app.findRecordById("users", id);
    return true;
  } catch (_) {
    return false;
  }
}

/** Reemplaza todo lo del usuario por el respaldo. Todo o nada: va en una transacción. */
function restore(app, userId, backup) {
  if (!backup || backup.app !== "finanzas" || !backup.data) {
    throw new Error("El archivo no es un respaldo de Finanzas.");
  }
  if (backup.version > VERSION) {
    throw new Error("El respaldo es de una versión más nueva de la app.");
  }
  var data = backup.data;
  var counts = {};
  var dupes = require(__hooks + "/lib/dupes.js");
  dupes.setRestoring(app, userId, true);
  try {
    restoreData(app, userId, data, counts);
  } finally {
    dupes.setRestoring(app, userId, false);
  }
  return counts;
}

function restoreData(app, userId, data, counts) {
  app.runInTransaction(function (tx) {
    clean(tx, userId);

    // viejo id -> nuevo id, por colección.
    var ids = { categories: {}, accounts: {}, savings: {} };
    function map(name, id) {
      return id ? ids[name][id] || "" : "";
    }

    function insert(name, rows, fix) {
      var col = tx.findCollectionByNameOrId(name);
      rows = rows || [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var r = new Record(col);
        var fields = FIELDS[name];
        for (var f = 0; f < fields.length; f++) {
          if (row[fields[f]] !== undefined && row[fields[f]] !== null) r.set(fields[f], row[fields[f]]);
        }
        if (name !== "saving_movements") r.set("owner", userId);
        if (fix) fix(r, row);
        try {
          tx.save(r);
        } catch (err) {
          throw new Error(name + " #" + (i + 1) + ": " + (err && err.message ? err.message : err));
        }
        if (ids[name]) ids[name][row.id] = r.id;
      }
      counts[name] = rows.length;
    }

    insert("categories", data.categories);
    insert("accounts", data.accounts);
    insert("recurring", data.recurring, function (r, row) {
      r.set("category", map("categories", row.category));
      r.set("account", map("accounts", row.account));
    });
    insert("transactions", data.transactions, function (r, row) {
      r.set("account", map("accounts", row.account));
      r.set("to_account", map("accounts", row.to_account));
      r.set("category", map("categories", row.category));
    });
    insert("savings", data.savings, function (r, row) {
      r.set(
        "members",
        (row.members || []).filter(function (m) {
          return m !== userId && userExists(tx, m);
        }),
      );
      r.set(
        "allocations",
        (row.allocations || []).map(function (a) {
          return { account: map("accounts", a.account), percent: a.percent };
        }),
      );
    });
    // Los respaldos de antes de las reglas no las traen.
    insert("rules", data.rules, function (r, row) {
      r.set("category", map("categories", row.category));
    });
    insert("saving_movements", data.saving_movements, function (r, row) {
      r.set("saving", map("savings", row.saving));
      // Los aportes de otros miembros siguen siendo suyos si esa persona
      // existe aquí; su cuenta no viaja en el respaldo y queda vacía.
      r.set("created_by", userExists(tx, row.created_by) ? row.created_by : userId);
      r.set("account", map("accounts", row.account));
    });

    if (data.gmail) {
      try {
        var g = tx.findFirstRecordByFilter("gmail_connections", "owner = {:u}", { u: userId });
        if (data.gmail.query) g.set("query", data.gmail.query);
        g.set("paused", !!data.gmail.paused);
        tx.save(g);
      } catch (_) {
        // Sin Gmail conectado aquí: la búsqueda se pierde, no pasa nada.
      }
    }
  });
  return counts;
}

module.exports = { exportData: exportData, clean: clean, restore: restore, seedCategories: seedCategories };
