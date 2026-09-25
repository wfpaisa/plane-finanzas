import type { AccountType } from "./types";

export const ACCOUNT_TYPES: { id: AccountType; label: string; icon: string }[] = [
  { id: "ahorros", label: "Ahorros", icon: "bank" },
  { id: "corriente", label: "Corriente", icon: "wallet-01" },
  { id: "inversion", label: "Inversión", icon: "analytics-up" },
  { id: "cdt", label: "CDT", icon: "coins-01" },
  { id: "pension", label: "Pensión / cesantías", icon: "umbrella" },
  { id: "efectivo", label: "Efectivo", icon: "money-bag-02" },
  { id: "tarjeta", label: "Tarjeta de crédito", icon: "credit-card" },
  { id: "credito", label: "Crédito / deuda", icon: "invoice-01" },
  { id: "inmueble", label: "Inmueble / bien", icon: "house-01" },
  { id: "otro", label: "Otro", icon: "wallet-02" },
];

export const accountTypeLabel = (t: string) => ACCOUNT_TYPES.find((x) => x.id === t)?.label ?? "Cuenta";
export const accountTypeIcon = (t: string) => ACCOUNT_TYPES.find((x) => x.id === t)?.icon ?? "wallet-01";

export const TX_TYPES = [
  { id: "expense", label: "Gasto", icon: "money-send-01" },
  { id: "income", label: "Ingreso", icon: "money-receive-01" },
  { id: "transfer", label: "Transferencia", icon: "arrow-data-transfer-horizontal" },
] as const;

export const txTypeLabel = (t: string) => TX_TYPES.find((x) => x.id === t)?.label ?? t;

export const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  gmail: "Gmail",
  texto: "Texto pegado",
  recurrente: "Automático",
  csv: "Registro CSV",
};

/** De dónde viene cada lado de un posible repetido. */
export function dupeSide(t: { source?: string; type: string }): string {
  if (!t.source || t.source === "manual") return "Anotaste";
  const from = t.source === "gmail" ? "Correo" : t.source === "csv" ? "CSV" : "Texto pegado";
  return t.type === "transfer" ? `${from}: transferencia` : `${from}: ${t.type === "income" ? "ingreso" : "gasto"}`;
}

export const FREQUENCIES = [
  { id: "monthly", label: "Mensual" },
  { id: "yearly", label: "Anual" },
  { id: "once", label: "Una vez" },
] as const;
