/// <reference path="../pb_data/types.d.ts" />

/**
 * La bandeja: lo que llega del banco ya no se vuelve movimiento a ciegas.
 *
 * - `inbox`: cada correo (o texto pegado) leído. Queda `pendiente` hasta que
 *   la persona decide; si una regla lo reconoce se crea el movimiento solo y
 *   queda `procesado`, con la regla. Su movimiento es el que lleva el mismo
 *   `external_id` (así sigue unido aunque se junte con un repetido).
 *   Descartar es borrarlo: su id pasa a `ignored_imports` y no vuelve (ver
 *   pb_hooks/lib/inbox.js).
 * - `rules` pasa a ser una plantilla completa: nombre, remitente, tipo,
 *   cuentas y un valor fijo opcional (`set_amount`; 0 toma el del correo).
 * - `accounts.senders` reemplaza a `match_keys`: la cuenta se reconoce por el
 *   remitente del correo. De las pistas viejas pasan las que parecen un
 *   remitente (texto, no terminaciones ni llaves).
 * - `gmail_connections.senders` reemplaza a la búsqueda escrita a mano: los
 *   remitentes que se leen.
 */

function senderLike(k) {
  return /[a-z]/i.test(k) && k.charAt(0) !== "@" && !/^\*?\d+$/.test(k);
}

function splitQuery(q) {
  const m = /from:\(([^)]*)\)/i.exec(String(q || ""));
  const inner = m ? m[1] : String(q || "").replace(/^from:/i, "");
  return inner
    .split(/\s+OR\s+|\s+/i)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && s !== "or");
}

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const accounts = app.findCollectionByNameOrId("accounts");
    const rules = app.findCollectionByNameOrId("rules");
    const gmail = app.findCollectionByNameOrId("gmail_connections");
    const OWN = "owner = @request.auth.id";

    // ---------- Cuentas: remitentes en vez de pistas ----------
    accounts.fields.add(new JSONField({ name: "senders", maxSize: 4000 }));
    app.save(accounts);
    for (const a of app.findAllRecords("accounts")) {
      const keys = a
        .getString("match_keys")
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(senderLike);
      a.set("senders", [...new Set(keys)]);
      app.saveNoValidate(a);
    }
    accounts.fields.removeByName("match_keys");
    app.save(accounts);

    // ---------- Gmail: la lista de remitentes ----------
    gmail.fields.add(new JSONField({ name: "senders", maxSize: 8000 }));
    app.save(gmail);
    for (const g of app.findAllRecords("gmail_connections")) {
      g.set("senders", splitQuery(g.getString("query")));
      app.saveNoValidate(g);
    }
    gmail.fields.removeByName("query");
    app.save(gmail);

    // ---------- Reglas: la plantilla completa ----------
    rules.fields.add(new TextField({ name: "name", max: 80 }));
    rules.fields.add(new TextField({ name: "sender", max: 300 }));
    rules.fields.add(new SelectField({ name: "type", maxSelect: 1, values: ["income", "expense", "transfer"] }));
    rules.fields.add(new RelationField({ name: "account", collectionId: accounts.id, maxSelect: 1, cascadeDelete: false }));
    rules.fields.add(new RelationField({ name: "to_account", collectionId: accounts.id, maxSelect: 1, cascadeDelete: false }));
    rules.fields.add(new NumberField({ name: "set_amount", min: 0 }));
    rules.fields.add(new TextField({ name: "notes", max: 1000 }));
    // Con remitente basta: el texto deja de ser obligatorio.
    rules.fields.getByName("match").required = false;
    const mineAcc = " && (account = '' || account.owner = @request.auth.id) && (to_account = '' || to_account.owner = @request.auth.id)";
    rules.createRule += mineAcc;
    rules.updateRule += mineAcc;
    app.save(rules);

    // ---------- La bandeja ----------
    const inbox = new Collection({
      type: "base",
      name: "inbox",
      listRule: OWN,
      viewRule: OWN,
      // La llena el servidor al leer Gmail; decidir pasa por sus rutas.
      createRule: null,
      updateRule: null,
      // Descartar: al borrarlo se anota en ignored_imports (ver main.pb.js).
      deleteRule: OWN,
      fields: [
        { name: "owner", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { name: "external_id", type: "text", required: true, max: 300 },
        { name: "source", type: "select", maxSelect: 1, values: ["gmail", "texto"] },
        { name: "sender", type: "text", max: 300 },
        { name: "subject", type: "text", max: 500 },
        { name: "date", type: "date" },
        { name: "text", type: "text", max: 20000 },
        // Lo que se leyó del texto, para la lista: { amount, type, description }.
        { name: "parsed", type: "json", maxSize: 4000 },
        { name: "status", type: "select", required: true, maxSelect: 1, values: ["pendiente", "procesado"] },
        { name: "rule", type: "relation", collectionId: rules.id, maxSelect: 1, cascadeDelete: false },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_inbox_owner_ext ON inbox (owner, external_id)",
        "CREATE INDEX idx_inbox_owner_status ON inbox (owner, status, date)",
      ],
    });
    app.save(inbox);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("inbox"));

    const rules = app.findCollectionByNameOrId("rules");
    const mineAcc = " && (account = '' || account.owner = @request.auth.id) && (to_account = '' || to_account.owner = @request.auth.id)";
    rules.createRule = rules.createRule.replace(mineAcc, "");
    rules.updateRule = rules.updateRule.replace(mineAcc, "");
    for (const f of ["name", "sender", "type", "account", "to_account", "set_amount", "notes"]) rules.fields.removeByName(f);
    app.save(rules);

    const gmail = app.findCollectionByNameOrId("gmail_connections");
    gmail.fields.add(new TextField({ name: "query", max: 1000 }));
    app.save(gmail);
    for (const g of app.findAllRecords("gmail_connections")) {
      let senders = [];
      try {
        senders = JSON.parse(g.getString("senders") || "[]") || [];
      } catch (_) {}
      g.set("query", senders.length ? `from:(${senders.join(" OR ")})` : "");
      app.saveNoValidate(g);
    }
    gmail.fields.removeByName("senders");
    app.save(gmail);

    const accounts = app.findCollectionByNameOrId("accounts");
    accounts.fields.add(new TextField({ name: "match_keys", max: 200 }));
    app.save(accounts);
    for (const a of app.findAllRecords("accounts")) {
      let senders = [];
      try {
        senders = JSON.parse(a.getString("senders") || "[]") || [];
      } catch (_) {}
      a.set("match_keys", senders.join(", ").slice(0, 200));
      app.saveNoValidate(a);
    }
    accounts.fields.removeByName("senders");
    app.save(accounts);
  },
);
