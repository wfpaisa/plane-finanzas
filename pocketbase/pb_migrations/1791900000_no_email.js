/// <reference path="../pb_data/types.d.ts" />

/**
 * Sin correo: los movimientos se registran a mano o por la API (un asistente).
 *
 * Se van la lectura de Gmail y todo lo que la servía:
 * - Las colecciones `gmail_connections`, `inbox` (la bandeja), `rules` y
 *   `merchants` (los alias de comercios), con sus datos.
 * - `accounts.senders` y `accounts.refs`: con qué remitentes, terminaciones
 *   y llaves se reconocía cada cuenta en los avisos.
 * - `categories.keywords`: las palabras que categorizaban lo importado.
 * - `transactions.raw` (el texto del aviso), `transactions.rule` (la regla
 *   que lo creó) y `transactions.dup_of` (el posible repetido).
 * - De `ignored_imports`, los ids de correos y textos pegados: quedan solo
 *   las marcas que usa el registro automático (`rec:`, `prov:`, `pay:`) y
 *   las de CSV.
 *
 * Los movimientos que llegaron por correo se quedan, con su `source` y su
 * `external_id`.
 *
 * Volver atrás recrea las colecciones y los campos vacíos: los datos borrados
 * no vuelven. Para eso está el respaldo de antes.
 */

const DROP = ["inbox", "rules", "merchants", "gmail_connections"];
const FIELDS = { accounts: ["senders", "refs"], categories: ["keywords"], transactions: ["raw", "dup_of", "rule"] };
// Lo que las reglas de `transactions` exigían de esos dos campos.
const TX_RULES = [" && (dup_of = '' || dup_of.owner = @request.auth.id)", " && (rule = '' || rule.owner = @request.auth.id)"];

migrate(
  (app) => {
    // Primero los campos que apuntan a las colecciones que se van.
    for (const [name, fields] of Object.entries(FIELDS)) {
      const col = app.findCollectionByNameOrId(name);
      if (name === "transactions") {
        for (const r of TX_RULES) {
          col.createRule = col.createRule.replace(r, "");
          col.updateRule = col.updateRule.replace(r, "");
        }
      }
      for (const f of fields) col.fields.removeByName(f);
      col.indexes = col.indexes.filter((i) => !fields.some((f) => i.includes("(" + f + ")")));
      app.save(col);
    }
    for (const name of DROP) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {
        // Ya no estaba.
      }
    }
    app
      .db()
      .newQuery(
        "DELETE FROM ignored_imports WHERE external_id NOT LIKE 'rec:%' AND external_id NOT LIKE 'prov:%' AND external_id NOT LIKE 'pay:%' AND external_id NOT LIKE 'csv:%'",
      )
      .execute();
  },
  (app) => {
    app.save(new Collection({
      "id": "pbc_1121724375",
      "name": "rules",
      "type": "base",
      "system": false,
      "fields": [
        {
          "autogeneratePattern": "[a-z0-9]{15}",
          "help": "",
          "hidden": false,
          "id": "text3208210256",
          "max": 15,
          "min": 15,
          "name": "id",
          "pattern": "^[a-z0-9]+$",
          "presentable": false,
          "primaryKey": true,
          "required": true,
          "system": true,
          "type": "text"
        },
        {
          "cascadeDelete": true,
          "collectionId": "_pb_users_auth_",
          "help": "",
          "hidden": false,
          "id": "relation3479234172",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "owner",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "relation"
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text2052834565",
          "max": 500,
          "min": 0,
          "name": "match",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "cascadeDelete": false,
          "collectionId": "pbc_3292755704",
          "help": "",
          "hidden": false,
          "id": "relation105650625",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "category",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "relation"
        },
        {
          "help": "",
          "hidden": false,
          "id": "json1874629670",
          "maxSize": 2000,
          "name": "tags",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "json"
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text1843675174",
          "max": 200,
          "min": 0,
          "name": "description",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "help": "",
          "hidden": false,
          "id": "bool170366908",
          "name": "to_notes",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "bool"
        },
        {
          "help": "",
          "hidden": false,
          "id": "bool1186025115",
          "name": "paused",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "bool"
        },
        {
          "hidden": false,
          "id": "autodate2990389176",
          "name": "created",
          "onCreate": true,
          "onUpdate": false,
          "presentable": false,
          "system": false,
          "type": "autodate"
        },
        {
          "hidden": false,
          "id": "autodate3332085495",
          "name": "updated",
          "onCreate": true,
          "onUpdate": true,
          "presentable": false,
          "system": false,
          "type": "autodate"
        },
        {
          "help": "",
          "hidden": false,
          "id": "number2392944706",
          "max": null,
          "min": 0,
          "name": "amount",
          "onlyInt": false,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text1579384326",
          "max": 80,
          "min": 0,
          "name": "name",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text1593854671",
          "max": 300,
          "min": 0,
          "name": "sender",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "help": "",
          "hidden": false,
          "id": "select2363381545",
          "maxSelect": 1,
          "name": "type",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "select",
          "values": [
            "income",
            "expense",
            "transfer",
            "discard"
          ]
        },
        {
          "cascadeDelete": false,
          "collectionId": "pbc_2324088501",
          "help": "",
          "hidden": false,
          "id": "relation2100713124",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "account",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "relation"
        },
        {
          "cascadeDelete": false,
          "collectionId": "pbc_2324088501",
          "help": "",
          "hidden": false,
          "id": "relation4088294225",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "to_account",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "relation"
        },
        {
          "help": "",
          "hidden": false,
          "id": "number719603155",
          "max": null,
          "min": 0,
          "name": "set_amount",
          "onlyInt": false,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text18589324",
          "max": 1000,
          "min": 0,
          "name": "notes",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        }
      ],
      "indexes": [
        "CREATE INDEX idx_rules_owner ON rules (owner)"
      ],
      "listRule": "owner = @request.auth.id",
      "viewRule": "owner = @request.auth.id",
      "createRule": "@request.auth.id != \"\" && owner = @request.auth.id && (account = '' || account.owner = @request.auth.id) && (to_account = '' || to_account.owner = @request.auth.id)",
      "updateRule": "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id) && (account = '' || account.owner = @request.auth.id) && (to_account = '' || to_account.owner = @request.auth.id)",
      "deleteRule": "owner = @request.auth.id"
    }));
    app.save(new Collection({
      "id": "pbc_2824622168",
      "name": "merchants",
      "type": "base",
      "system": false,
      "fields": [
        {
          "autogeneratePattern": "[a-z0-9]{15}",
          "help": "",
          "hidden": false,
          "id": "text3208210256",
          "max": 15,
          "min": 15,
          "name": "id",
          "pattern": "^[a-z0-9]+$",
          "presentable": false,
          "primaryKey": true,
          "required": true,
          "system": true,
          "type": "text"
        },
        {
          "cascadeDelete": true,
          "collectionId": "_pb_users_auth_",
          "help": "",
          "hidden": false,
          "id": "relation3479234172",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "owner",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "relation"
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text2052834565",
          "max": 500,
          "min": 0,
          "name": "match",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": true,
          "system": false,
          "type": "text"
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text1579384326",
          "max": 120,
          "min": 0,
          "name": "name",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": true,
          "system": false,
          "type": "text"
        },
        {
          "cascadeDelete": false,
          "collectionId": "pbc_3292755704",
          "help": "",
          "hidden": false,
          "id": "relation105650625",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "category",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "relation"
        },
        {
          "hidden": false,
          "id": "autodate2990389176",
          "name": "created",
          "onCreate": true,
          "onUpdate": false,
          "presentable": false,
          "system": false,
          "type": "autodate"
        },
        {
          "hidden": false,
          "id": "autodate3332085495",
          "name": "updated",
          "onCreate": true,
          "onUpdate": true,
          "presentable": false,
          "system": false,
          "type": "autodate"
        }
      ],
      "indexes": [
        "CREATE INDEX idx_merchants_owner ON merchants (owner)"
      ],
      "listRule": "owner = @request.auth.id",
      "viewRule": "owner = @request.auth.id",
      "createRule": "@request.auth.id != \"\" && owner = @request.auth.id && (category = '' || category.owner = @request.auth.id)",
      "updateRule": "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id) && (category = '' || category.owner = @request.auth.id)",
      "deleteRule": "owner = @request.auth.id"
    }));
    app.save(new Collection({
      "id": "pbc_3771074676",
      "name": "gmail_connections",
      "type": "base",
      "system": false,
      "fields": [
        {
          "autogeneratePattern": "[a-z0-9]{15}",
          "help": "",
          "hidden": false,
          "id": "text3208210256",
          "max": 15,
          "min": 15,
          "name": "id",
          "pattern": "^[a-z0-9]+$",
          "presentable": false,
          "primaryKey": true,
          "required": true,
          "system": true,
          "type": "text"
        },
        {
          "cascadeDelete": true,
          "collectionId": "_pb_users_auth_",
          "help": "",
          "hidden": false,
          "id": "relation3479234172",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "owner",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "relation"
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text3885137012",
          "max": 200,
          "min": 0,
          "name": "email",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": true,
          "id": "text3343851925",
          "max": 2000,
          "min": 0,
          "name": "refresh_token",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": true,
          "id": "text613431530",
          "max": 200,
          "min": 0,
          "name": "oauth_state",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "help": "",
          "hidden": false,
          "id": "bool1186025115",
          "name": "paused",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "bool"
        },
        {
          "help": "",
          "hidden": false,
          "id": "date3120574758",
          "max": "",
          "min": "",
          "name": "last_sync",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "date"
        },
        {
          "help": "",
          "hidden": false,
          "id": "json2574074825",
          "maxSize": 20000,
          "name": "last_result",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "json"
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text1066830442",
          "max": 2000,
          "min": 0,
          "name": "last_error",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "hidden": false,
          "id": "autodate2990389176",
          "name": "created",
          "onCreate": true,
          "onUpdate": false,
          "presentable": false,
          "system": false,
          "type": "autodate"
        },
        {
          "hidden": false,
          "id": "autodate3332085495",
          "name": "updated",
          "onCreate": true,
          "onUpdate": true,
          "presentable": false,
          "system": false,
          "type": "autodate"
        },
        {
          "help": "",
          "hidden": false,
          "id": "json277483616",
          "maxSize": 8000,
          "name": "senders",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "json"
        }
      ],
      "indexes": [
        "CREATE UNIQUE INDEX idx_gmail_owner ON gmail_connections (owner)"
      ],
      "listRule": "owner = @request.auth.id",
      "viewRule": "owner = @request.auth.id",
      "createRule": null,
      "updateRule": "owner = @request.auth.id && @request.body.refresh_token:isset = false && @request.body.oauth_state:isset = false && @request.body.owner:isset = false && @request.body.email:isset = false",
      "deleteRule": "owner = @request.auth.id"
    }));
    app.save(new Collection({
      "id": "pbc_3042397650",
      "name": "inbox",
      "type": "base",
      "system": false,
      "fields": [
        {
          "autogeneratePattern": "[a-z0-9]{15}",
          "help": "",
          "hidden": false,
          "id": "text3208210256",
          "max": 15,
          "min": 15,
          "name": "id",
          "pattern": "^[a-z0-9]+$",
          "presentable": false,
          "primaryKey": true,
          "required": true,
          "system": true,
          "type": "text"
        },
        {
          "cascadeDelete": true,
          "collectionId": "_pb_users_auth_",
          "help": "",
          "hidden": false,
          "id": "relation3479234172",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "owner",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "relation"
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text2675300272",
          "max": 300,
          "min": 0,
          "name": "external_id",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": true,
          "system": false,
          "type": "text"
        },
        {
          "help": "",
          "hidden": false,
          "id": "select1602912115",
          "maxSelect": 1,
          "name": "source",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "select",
          "values": [
            "gmail",
            "texto"
          ]
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text1593854671",
          "max": 300,
          "min": 0,
          "name": "sender",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text4224597626",
          "max": 500,
          "min": 0,
          "name": "subject",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "help": "",
          "hidden": false,
          "id": "date2862495610",
          "max": "",
          "min": "",
          "name": "date",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "date"
        },
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text999008199",
          "max": 20000,
          "min": 0,
          "name": "text",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "help": "",
          "hidden": false,
          "id": "json3680925218",
          "maxSize": 4000,
          "name": "parsed",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "json"
        },
        {
          "help": "",
          "hidden": false,
          "id": "select2063623452",
          "maxSelect": 1,
          "name": "status",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "select",
          "values": [
            "pendiente",
            "procesado"
          ]
        },
        {
          "cascadeDelete": false,
          "collectionId": "pbc_3174063690",
          "help": "",
          "hidden": false,
          "id": "relation1916208593",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "transaction",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "relation"
        },
        {
          "cascadeDelete": false,
          "collectionId": "pbc_1121724375",
          "help": "",
          "hidden": false,
          "id": "relation1188605132",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "rule",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "relation"
        },
        {
          "hidden": false,
          "id": "autodate2990389176",
          "name": "created",
          "onCreate": true,
          "onUpdate": false,
          "presentable": false,
          "system": false,
          "type": "autodate"
        },
        {
          "hidden": false,
          "id": "autodate3332085495",
          "name": "updated",
          "onCreate": true,
          "onUpdate": true,
          "presentable": false,
          "system": false,
          "type": "autodate"
        }
      ],
      "indexes": [
        "CREATE UNIQUE INDEX idx_inbox_owner_ext ON inbox (owner, external_id)",
        "CREATE INDEX idx_inbox_owner_status ON inbox (owner, status, date)"
      ],
      "listRule": "owner = @request.auth.id",
      "viewRule": "owner = @request.auth.id",
      "createRule": null,
      "updateRule": null,
      "deleteRule": "owner = @request.auth.id"
    }));

    const fields = {
      "accounts": [
        {
          "help": "",
          "hidden": false,
          "id": "json277483616",
          "maxSize": 4000,
          "name": "senders",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "json"
        },
        {
          "help": "",
          "hidden": false,
          "id": "json1422217831",
          "maxSize": 4000,
          "name": "refs",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "json"
        }
      ],
      "categories": [
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text2858399070",
          "max": 2000,
          "min": 0,
          "name": "keywords",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        }
      ],
      "transactions": [
        {
          "autogeneratePattern": "",
          "help": "",
          "hidden": false,
          "id": "text447994709",
          "max": 4000,
          "min": 0,
          "name": "raw",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "cascadeDelete": false,
          "collectionId": "pbc_3174063690",
          "help": "",
          "hidden": false,
          "id": "relation1509882180",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "dup_of",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "relation"
        },
        {
          "cascadeDelete": false,
          "collectionId": "pbc_1121724375",
          "help": "",
          "hidden": false,
          "id": "relation1188605132",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "rule",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "relation"
        }
      ]
    };
    for (const [name, list] of Object.entries(fields)) {
      const col = app.findCollectionByNameOrId(name);
      for (const f of list) col.fields.addMarshaledJSON(JSON.stringify(f));
      if (name === "transactions") {
        col.createRule += TX_RULES.join("");
        col.updateRule += TX_RULES.join("");
        col.indexes = [...col.indexes, ...["CREATE INDEX `idx_tx_dup_of` ON `transactions` (dup_of)", "CREATE INDEX `idx_tx_rule` ON `transactions` (rule)"]];
      }
      app.save(col);
    }
  },
);
