/// <reference path="../pb_data/types.d.ts" />

/**
 * Índices para dos consultas que recorrían todas las transacciones:
 *
 * - la vista `account_balances` suma lo que entra a cada cuenta por
 *   `to_account` (las transferencias), una vez por cuenta;
 * - al crear un movimiento, buscar su posible repetido pregunta por cada
 *   candidato si ya es pareja de otro (`dup_of`).
 */
migrate(
  (app) => {
    const tx = app.findCollectionByNameOrId("transactions");
    // Sin WHERE: SQLite solo usa un índice parcial si la consulta repite su
    // condición, y `to_account = a.id` no dice `to_account != ''`.
    tx.addIndex("idx_tx_to_account", false, "to_account", "");
    tx.addIndex("idx_tx_dup_of", false, "dup_of", "");
    app.save(tx);
  },
  (app) => {
    const tx = app.findCollectionByNameOrId("transactions");
    tx.removeIndex("idx_tx_to_account");
    tx.removeIndex("idx_tx_dup_of");
    app.save(tx);
  },
);
