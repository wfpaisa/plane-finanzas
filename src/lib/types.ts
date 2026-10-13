import type { RecordModel } from "pocketbase";

import type { Frequency, Kind, TxType } from "./finance";

export interface User extends RecordModel {
  email: string;
  name: string;
  avatar: string;
  /** El tinte del fondo (`#3b82f6`); vacío es la bruma de partida. */
  tint?: string;
}

export type AccountType =
  | "ahorros"
  | "corriente"
  | "inversion"
  | "cdt"
  | "pension"
  | "efectivo"
  | "tarjeta"
  | "credito"
  | "inmueble"
  | "otro";

export interface Account extends RecordModel {
  owner: string;
  name: string;
  type: AccountType;
  bank: string;
  /** Su color: un hexadecimal (antes, el id de una paleta). */
  palette: string;
  icon: string;
  initial_balance: number;
  exclude_from_total: boolean;
  archived: boolean;
  sort: number;
  notes: string;
}

export interface Balance extends RecordModel {
  owner: string;
  balance: number;
  last_movement: string | null;
}

export interface Category extends RecordModel {
  owner: string;
  name: string;
  kind: Kind;
  /** Las heredan sus movimientos: ver `lib/tags.ts`. */
  tags: string[] | null;
  icon: string;
  color: string;
  budget: number;
}

export interface Transaction extends RecordModel {
  owner: string;
  type: TxType;
  date: string;
  account: string;
  to_account: string;
  category: string;
  amount: number;
  description: string;
  notes: string;
  tags: string[] | null;
  attachments: string[];
  source: "manual" | "gmail" | "texto" | "recurrente" | "csv" | "";
  external_id: string;
  /**
   * La marca del programado que paga (`rec:<id>:<AAAA-MM>`), si es un
   * movimiento que ya existía y se unió a él. Ver pb_hooks/lib/plan.js.
   */
  recurring_key?: string;
}

export interface Allocation {
  account: string;
  percent: number;
}

export interface Saving extends RecordModel {
  owner: string;
  members: string[];
  name: string;
  icon: string;
  palette: string;
  target_amount: number;
  target_date: string;
  /** En uno compartido, la suma de lo que pone cada quien (`shares`). */
  monthly_amount: number;
  /**
   * En uno compartido, cuánto pone al mes cada persona: `{ idDelUsuario: 200000 }`.
   * Vacío, todo el aporte es del dueño.
   */
  shares: Record<string, number> | null;
  day_of_month: number;
  annual_rate: number;
  allocations: Allocation[] | null;
  auto: boolean;
  archived: boolean;
  notes: string;
  /** "provision": lo apartado para un gasto recurrente (ver `Recurring.saving`); vacío, un ahorro con meta. */
  kind?: "goal" | "provision" | "";
  expand?: { members?: User[]; owner?: User };
}

export interface SavingMovement extends RecordModel {
  saving: string;
  account: string;
  created_by: string;
  amount: number;
  date: string;
  note: string;
  /** `prov:<recurrente>:<mes>` el apartado de una provisión; `pay:<marca del pago>` lo que se liberó al pagar. */
  external_id?: string;
}

export interface Recurring extends RecordModel {
  owner: string;
  name: string;
  kind: TxType;
  amount: number;
  frequency: Frequency;
  /** 0: sin día fijo. Ver `occurrenceDate`. */
  day_of_month: number;
  month: number;
  start_date: string;
  end_date: string;
  category: string;
  account: string;
  /** El destino, si es una transferencia. */
  to_account: string;
  tags: string[] | null;
  /** La provisión: dónde se aparta mes a mes para pagarlo (un ahorro de tipo "provision"). */
  saving?: string;
  paused: boolean;
  auto_create: boolean;
}

/** Un movimiento por registrar, con sus datos ya puestos (por ejemplo, el de un pago programado). */
export interface TxDraft {
  type: TxType;
  amount: number;
  date: string;
  account: string;
  to_account: string;
  category: string;
  description: string;
  notes: string;
  tags: string[];
}
