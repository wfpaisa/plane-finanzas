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

/**
 * De dónde salió un movimiento, si no lo registró la persona. Los que
 * llegaron por correo o texto pegado (cuando la app los leía) no muestran
 * origen: ya no hay nada que ver de eso.
 */
export const SOURCE_LABEL: Record<string, string> = {
  recurrente: "Pago programado",
  csv: "Registro CSV",
};

export const FREQUENCIES = [
  { id: "monthly", label: "Mensual" },
  { id: "yearly", label: "Anual" },
  { id: "once", label: "Una vez" },
] as const;

/** Las ayudas de los saldos, las mismas en Cuentas y en el teléfono. */
export const BALANCE_TIPS = {
  balance: "Saldo inicial más los ingresos y menos los gastos registrados. En una deuda, un saldo negativo indica cuánto debes.",
  total: "Suma de los saldos de tus cuentas activas, menos las deudas. No incluye las cuentas que excluiste del total.",
  earmarked:
    "Parte del saldo que reservaste para tus ahorros y para pagos programados, como el predial. Este dinero sigue en la cuenta y ya está incluido en su saldo.",
  free: "Saldo después de restar el dinero reservado. Si es negativo, el dinero reservado supera el saldo.",
  available: "Lo que tienes a favor en tus cuentas, menos el dinero reservado y todas tus deudas.",
  limit: "Límite de crédito de la tarjeta.",
  owed: "Lo que debes en esta tarjeta: sus gastos menos los pagos que le has hecho.",
  cardFree: "Cupo menos lo que debes. Es lo que aún puedes gastar con la tarjeta.",
} as const;
