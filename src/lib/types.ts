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
  /** Remitentes de correo que la reconocen: "alertas@banco.com", "banco.com". */
  senders: string[] | null;
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
  /** La regla que lo ajustó al importarlo o al aplicarla a lo guardado. */
  rule?: string;
  expand?: { dup_of?: Transaction; rule?: Rule };
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
  /** Los remitentes que se leen, además de los de cada cuenta. */
  senders: string[] | null;
  paused: boolean;
  last_sync: string;
  last_result: { read: number; created: number; pending?: number; skipped: number; at: string } | null;
  last_error: string;
}

/** Lo que dejó una lectura de Gmail o un texto pegado. */
export interface SyncResult {
  /** Los que una regla volvió movimiento. */
  created: number;
  /** Los que quedaron en la bandeja esperando una decisión. */
  pending: number;
  /** Los que ya se habían leído o se descartaron. */
  skipped: number;
  read?: number;
}

/** Un correo (o texto pegado) en la bandeja: ver pb_hooks/lib/inbox.js. */
export interface InboxRow extends RecordModel {
  owner: string;
  external_id: string;
  source: "gmail" | "texto";
  sender: string;
  subject: string;
  date: string;
  text: string;
  /** El texto con negritas y enlaces, si llegó en HTML (ver parsers.htmlToRich). */
  rich?: string;
  parsed: { amount: number; type: TxType; description: string; merchant: string; bank: string | null } | null;
  status: "pendiente" | "procesado";
  rule: string;
  expand?: { rule?: Rule };
}

/** El movimiento que se propone para un correo. */
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
  rule: string;
}

export interface Suggestion {
  tx: TxDraft;
  parsed: InboxRow["parsed"];
  /** Con qué reconocer correos como este, para una regla nueva. */
  pattern: { sender: string; match: string };
  /** La regla que se usó (o que coincide hoy). */
  rule: Rule | null;
  /** El movimiento que ya tiene, si lo tiene. */
  transaction: string;
}

/**
 * Una regla: la plantilla con que se crean los movimientos de los correos que
 * coinciden. Ver pb_hooks/lib/rules.js.
 */
export interface Rule extends RecordModel {
  owner: string;
  name: string;
  /** El "De:" del correo debe tener alguno de estos (separados por coma). */
  sender: string;
  /** Textos separados por coma; basta con que aparezca uno. */
  match: string;
  /** El movimiento debe traer este valor; 0: cualquiera. */
  amount: number;
  /** Vacío: el que se leyó del correo. */
  type: TxType | "";
  account: string;
  to_account: string;
  /** El valor del movimiento; 0: el del correo. */
  set_amount: number;
  category: string;
  tags: string[] | null;
  /** Admite {mes}, {año} y {original}. */
  description: string;
  notes: string;
  paused: boolean;
}
