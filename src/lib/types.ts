import type { RecordModel } from "pocketbase";

import type { Frequency, Kind, TxType } from "./finance";

export interface User extends RecordModel {
  email: string;
  name: string;
  avatar: string;
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
  match_keys: string;
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
  keywords: string;
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
  raw: string;
  /** Posible repetido: el movimiento que parece el mismo (ver pb_hooks/lib/dupes.js). */
  dup_of: string;
  expand?: { dup_of?: Transaction };
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
  monthly_amount: number;
  day_of_month: number;
  annual_rate: number;
  allocations: Allocation[] | null;
  auto: boolean;
  archived: boolean;
  notes: string;
  expand?: { members?: User[]; owner?: User };
}

export interface SavingMovement extends RecordModel {
  saving: string;
  account: string;
  created_by: string;
  amount: number;
  date: string;
  note: string;
}

export interface Recurring extends RecordModel {
  owner: string;
  name: string;
  kind: Kind;
  amount: number;
  frequency: Frequency;
  day_of_month: number;
  month: number;
  start_date: string;
  end_date: string;
  category: string;
  account: string;
  paused: boolean;
  auto_create: boolean;
}

export interface GmailConnection extends RecordModel {
  owner: string;
  email: string;
  query: string;
  paused: boolean;
  last_sync: string;
  last_result: { read: number; created: number; skipped: number; ignored: number; at: string } | null;
  last_error: string;
}

export interface ImportItem {
  externalId: string;
  type: TxType;
  amount: number;
  date: string;
  description: string;
  account: string;
  accountName: string;
  toAccountName: string;
  categoryName: string;
  tags: string[];
  bank: string | null;
  status: "creado" | "nuevo" | "duplicado" | "sin cuenta";
}

export interface ImportResult {
  created: number;
  skipped: number;
  ignored: number;
  read?: number;
  items: ImportItem[];
}

/** "Si el movimiento dice X, es tal cosa": ver pb_hooks/lib/rules.js. */
export interface Rule extends RecordModel {
  owner: string;
  /** Textos separados por coma; basta con que aparezca uno. */
  match: string;
  /** El movimiento debe traer este valor; 0: cualquiera. */
  amount: number;
  category: string;
  tags: string[] | null;
  /** Admite {mes}, {año} y {original}. */
  description: string;
  to_notes: boolean;
  paused: boolean;
}
