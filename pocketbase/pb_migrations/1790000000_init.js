/// <reference path="../pb_data/types.d.ts" />

/**
 * El esquema de Finanzas.
 *
 * Todo cuelga de `owner`: cada usuario ve solo lo suyo. La excepción son los
 * ahorros, que se comparten con `members` --otros usuarios que ven y aportan
 * al mismo ahorro desde sus propias cuentas--.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    // Otros usuarios se pueden ver por id (para mostrar el nombre de quien
    // comparte un ahorro), pero listar solo se lista uno mismo.
    users.viewRule = '@request.auth.id != ""';
    app.save(users);

    const OWN = "owner = @request.auth.id";
    const AUTHED = '@request.auth.id != ""';
    const stamps = [
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ];
    const owner = { name: "owner", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true };

    // ---------- Cuentas ----------
    const accounts = new Collection({
      type: "base",
      name: "accounts",
      listRule: OWN,
      viewRule: OWN,
      createRule: `${AUTHED} && ${OWN}`,
      updateRule: `${OWN} && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)`,
      deleteRule: OWN,
      fields: [
        owner,
        { name: "name", type: "text", required: true, max: 80 },
        {
          name: "type",
          type: "select",
          maxSelect: 1,
          values: ["ahorros", "corriente", "inversion", "cdt", "pension", "efectivo", "tarjeta", "credito", "inmueble", "otro"],
        },
        { name: "bank", type: "text", max: 60 },
        { name: "palette", type: "text", max: 40 },
        { name: "icon", type: "text", max: 60 },
        { name: "initial_balance", type: "number" },
        { name: "match_keys", type: "text", max: 200 },
        { name: "exclude_from_total", type: "bool" },
        { name: "archived", type: "bool" },
        { name: "sort", type: "number" },
        { name: "notes", type: "text", max: 1000 },
        ...stamps,
      ],
      indexes: ["CREATE INDEX idx_accounts_owner ON accounts (owner)"],
    });
    app.save(accounts);

    // ---------- Categorías ----------
    const categories = new Collection({
      type: "base",
      name: "categories",
      listRule: OWN,
      viewRule: OWN,
      createRule: `${AUTHED} && ${OWN}`,
      updateRule: `${OWN} && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)`,
      deleteRule: OWN,
      fields: [
        owner,
        { name: "name", type: "text", required: true, max: 60 },
        { name: "kind", type: "select", required: true, maxSelect: 1, values: ["income", "expense"] },
        { name: "icon", type: "text", max: 60 },
        { name: "color", type: "text", max: 20 },
        { name: "keywords", type: "text", max: 2000 },
        { name: "budget", type: "number", min: 0 },
        ...stamps,
      ],
      indexes: ["CREATE INDEX idx_categories_owner ON categories (owner)"],
    });
    app.save(categories);

    // ---------- Transacciones ----------
    const mineRefs =
      "account.owner = @request.auth.id && (to_account = '' || to_account.owner = @request.auth.id) && (category = '' || category.owner = @request.auth.id)";
    const transactions = new Collection({
      type: "base",
      name: "transactions",
      listRule: OWN,
      viewRule: OWN,
      createRule: `${AUTHED} && ${OWN} && ${mineRefs}`,
      updateRule: `${OWN} && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id) && ${mineRefs}`,
      deleteRule: OWN,
      fields: [
        owner,
        { name: "type", type: "select", required: true, maxSelect: 1, values: ["income", "expense", "transfer"] },
        { name: "date", type: "date", required: true },
        { name: "account", type: "relation", required: true, collectionId: accounts.id, maxSelect: 1, cascadeDelete: true },
        { name: "to_account", type: "relation", collectionId: accounts.id, maxSelect: 1, cascadeDelete: true },
        { name: "category", type: "relation", collectionId: categories.id, maxSelect: 1, cascadeDelete: false },
        { name: "amount", type: "number", min: 0 },
        { name: "description", type: "text", max: 200 },
        { name: "notes", type: "text", max: 5000 },
        { name: "tags", type: "json", maxSize: 4000 },
        {
          name: "attachments",
          type: "file",
          maxSelect: 10,
          maxSize: 10 * 1024 * 1024,
          protected: true,
          thumbs: ["200x200"],
        },
        { name: "source", type: "select", maxSelect: 1, values: ["manual", "gmail", "texto", "recurrente"] },
        { name: "external_id", type: "text", max: 200 },
        { name: "raw", type: "text", max: 4000 },
        ...stamps,
      ],
      indexes: [
        "CREATE INDEX idx_tx_owner_date ON transactions (owner, date)",
        "CREATE INDEX idx_tx_account ON transactions (account)",
        "CREATE UNIQUE INDEX idx_tx_external ON transactions (owner, external_id) WHERE external_id != ''",
      ],
    });
    app.save(transactions);

    // ---------- Ahorros (bolsillos) ----------
    const SHARED = "(owner = @request.auth.id || members.id ?= @request.auth.id)";
    const savings = new Collection({
      type: "base",
      name: "savings",
      listRule: SHARED,
      viewRule: SHARED,
      createRule: `${AUTHED} && ${OWN}`,
      // Los miembros editan el ahorro, pero solo el dueño decide con quién se comparte.
      updateRule:
        "(owner = @request.auth.id || (members.id ?= @request.auth.id && @request.body.members:isset = false)) && (@request.body.owner:isset = false || @request.body.owner = owner)",
      deleteRule: OWN,
      fields: [
        owner,
        { name: "members", type: "relation", collectionId: users.id, maxSelect: 20, cascadeDelete: false },
        { name: "name", type: "text", required: true, max: 80 },
        { name: "icon", type: "text", max: 60 },
        { name: "palette", type: "text", max: 40 },
        { name: "target_amount", type: "number", min: 0 },
        { name: "target_date", type: "date" },
        { name: "monthly_amount", type: "number", min: 0 },
        { name: "day_of_month", type: "number", min: 1, max: 31, onlyInt: true },
        { name: "annual_rate", type: "number", min: 0, max: 100 },
        // [{ account: "id", percent: 60 }]: cómo se reparte el aporte entre cuentas.
        { name: "allocations", type: "json", maxSize: 4000 },
        { name: "auto", type: "bool" },
        { name: "archived", type: "bool" },
        { name: "notes", type: "text", max: 1000 },
        ...stamps,
      ],
      indexes: ["CREATE INDEX idx_savings_owner ON savings (owner)"],
    });
    app.save(savings);

    const MOV = "(saving.owner = @request.auth.id || saving.members.id ?= @request.auth.id)";
    const savingMovements = new Collection({
      type: "base",
      name: "saving_movements",
      listRule: MOV,
      viewRule: MOV,
      createRule: `${AUTHED} && ${MOV} && created_by = @request.auth.id && (account = '' || account.owner = @request.auth.id)`,
      updateRule: `(created_by = @request.auth.id || saving.owner = @request.auth.id) && (account = '' || account.owner = @request.auth.id || account.owner = created_by)`,
      deleteRule: "created_by = @request.auth.id || saving.owner = @request.auth.id",
      fields: [
        { name: "saving", type: "relation", required: true, collectionId: savings.id, maxSelect: 1, cascadeDelete: true },
        { name: "account", type: "relation", collectionId: accounts.id, maxSelect: 1, cascadeDelete: false },
        { name: "created_by", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        // Positivo aporta, negativo retira.
        { name: "amount", type: "number" },
        { name: "date", type: "date", required: true },
        { name: "note", type: "text", max: 300 },
        { name: "external_id", type: "text", max: 200 },
        ...stamps,
      ],
      indexes: [
        "CREATE INDEX idx_mov_saving ON saving_movements (saving)",
        "CREATE UNIQUE INDEX idx_mov_external ON saving_movements (saving, external_id) WHERE external_id != ''",
      ],
    });
    app.save(savingMovements);

    // ---------- Fijos: ingresos y gastos que se repiten ----------
    const recurring = new Collection({
      type: "base",
      name: "recurring",
      listRule: OWN,
      viewRule: OWN,
      createRule: `${AUTHED} && ${OWN} && (account = '' || account.owner = @request.auth.id) && (category = '' || category.owner = @request.auth.id)`,
      updateRule: `${OWN} && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id) && (account = '' || account.owner = @request.auth.id) && (category = '' || category.owner = @request.auth.id)`,
      deleteRule: OWN,
      fields: [
        owner,
        { name: "name", type: "text", required: true, max: 80 },
        { name: "kind", type: "select", required: true, maxSelect: 1, values: ["income", "expense"] },
        { name: "amount", type: "number", min: 0 },
        { name: "frequency", type: "select", maxSelect: 1, values: ["monthly", "yearly", "once"] },
        { name: "day_of_month", type: "number", min: 1, max: 31, onlyInt: true },
        { name: "month", type: "number", min: 1, max: 12, onlyInt: true },
        { name: "start_date", type: "date" },
        { name: "end_date", type: "date" },
        { name: "category", type: "relation", collectionId: categories.id, maxSelect: 1, cascadeDelete: false },
        { name: "account", type: "relation", collectionId: accounts.id, maxSelect: 1, cascadeDelete: false },
        { name: "paused", type: "bool" },
        { name: "auto_create", type: "bool" },
        ...stamps,
      ],
      indexes: ["CREATE INDEX idx_recurring_owner ON recurring (owner)"],
    });
    app.save(recurring);

    // ---------- Conexión con Gmail ----------
    const gmail = new Collection({
      type: "base",
      name: "gmail_connections",
      listRule: OWN,
      viewRule: OWN,
      createRule: null,
      // Desde el cliente solo se tocan la búsqueda y la pausa.
      updateRule: `${OWN} && @request.body.refresh_token:isset = false && @request.body.oauth_state:isset = false && @request.body.owner:isset = false && @request.body.email:isset = false`,
      deleteRule: OWN,
      fields: [
        owner,
        { name: "email", type: "text", max: 200 },
        { name: "refresh_token", type: "text", hidden: true, max: 2000 },
        { name: "oauth_state", type: "text", hidden: true, max: 200 },
        { name: "query", type: "text", max: 1000 },
        { name: "paused", type: "bool" },
        { name: "last_sync", type: "date" },
        { name: "last_result", type: "json", maxSize: 20000 },
        { name: "last_error", type: "text", max: 2000 },
        ...stamps,
      ],
      indexes: ["CREATE UNIQUE INDEX idx_gmail_owner ON gmail_connections (owner)"],
    });
    app.save(gmail);

    // ---------- Saldos: una vista, así nadie suma en el cliente ----------
    const balances = new Collection({
      type: "view",
      name: "account_balances",
      listRule: OWN,
      viewRule: OWN,
      viewQuery: `
        SELECT
          a.id AS id,
          a.owner AS owner,
          (COALESCE(a.initial_balance, 0)
            + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
                        FROM transactions t WHERE t.account = a.id), 0)
            + COALESCE((SELECT SUM(t.amount) FROM transactions t
                        WHERE t.type = 'transfer' AND t.to_account = a.id), 0)
          ) AS balance,
          (SELECT MAX(t.date) FROM transactions t WHERE t.account = a.id OR t.to_account = a.id) AS last_movement
        FROM accounts a
      `,
    });
    app.save(balances);
  },
  (app) => {
    for (const name of [
      "account_balances",
      "gmail_connections",
      "recurring",
      "saving_movements",
      "savings",
      "transactions",
      "categories",
      "accounts",
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {
        // Ya no estaba.
      }
    }
  },
);
