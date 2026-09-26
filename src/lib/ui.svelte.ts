/** El formulario de transacción es uno solo y se abre desde cualquier pantalla. */
import type { Transaction } from "./types";

let open = $state(false);
let tx = $state<Transaction | null>(null);
/** Valores de partida para uno nuevo. `date` solo lo usa la pantalla del celular. */
export type TxPreset = Partial<Pick<Transaction, "type" | "account" | "category"> & { date: string }>;

let preset = $state<TxPreset | undefined>(undefined);

export const txModal = {
  get open() {
    return open;
  },
  get tx() {
    return tx;
  },
  get preset() {
    return preset;
  },
  new(p?: TxPreset) {
    tx = null;
    preset = p;
    open = true;
  },
  edit(t: Transaction) {
    tx = t;
    preset = undefined;
    open = true;
  },
  close() {
    open = false;
  },
};
