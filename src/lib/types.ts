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
  /** Terminaciones y llaves con que la nombran los avisos: "*1234", "@ana123". */
  refs?: string[] | null;
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
  /**
   * La marca del programado que paga (`rec:<id>:<AAAA-MM>`), si es un
   * movimiento que ya existía y se unió a él. Ver pb_hooks/lib/plan.js.
   */
  recurring_key?: string;
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
  /** El comercio que se leyó y su alias (nombre limpio), si tiene. */
  merchant?: { text: string; alias: { id: string; name: string; match: string; category: string } | null };
}

/**
 * El nombre limpio de un comercio: los correos cuyo comercio contiene alguno
 * de los textos de `match` se registran con `name` y, si la tiene, `category`.
 * Ver pb_hooks/lib/merchants.js.
 */
export interface Merchant extends RecordModel {
  owner: string;
  /** Textos separados por coma; basta con que aparezca uno. */
  match: string;
  name: string;
  category: string;
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
  /** Vacío: el que se leyó del correo. "discard": descarta los correos, no crea nada. */
  type: TxType | "discard" | "";
  account: string;
  to_account: string;
  /** El valor del movimiento; 0: el del correo. */
  set_amount: number;
  category: string;
  tags: string[] | null;
  /** Admite {mes}, {año}, {original} y {comercio}, con filtros: {comercio|capitalizar}. */
  description: string;
  notes: string;
  paused: boolean;
}
