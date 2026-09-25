/** El formulario de transacción es uno solo y se abre desde cualquier pantalla. */
import type { Transaction } from "./types";

let open = $state(false);
let tx = $state<Transaction | null>(null);
let preset = $state<Partial<Pick<Transaction, "type" | "account" | "category">> | undefined>(undefined);

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
  new(p?: Partial<Pick<Transaction, "type" | "account" | "category">>) {
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
