/**
 * El cliente de PocketBase y la sesión.
 *
 * La web y PocketBase viven en el mismo origen: en producción PocketBase sirve
 * la web (`pb_public`), y en desarrollo Vite le pasa `/api` (ver
 * `vite.config.ts`). Por eso no hace falta configurar ninguna URL.
 */
import PocketBase, { ClientResponseError } from "pocketbase";

import { clearSnaps } from "./local";
import type { User } from "./types";

export const pb = new PocketBase(import.meta.env.VITE_PB_URL || window.location.origin);
pb.autoCancellation(false);

// La sesión sigue aunque el token haya vencido: sin internet la app abre con
// lo guardado en el teléfono. Con internet, `store.start` pide entrar de nuevo.
const current = () => (pb.authStore.token && pb.authStore.record ? (pb.authStore.record as User) : null);

let user = $state<User | null>(current());

pb.authStore.onChange(() => {
  user = current();
});

export const session = {
  get user() {
    return user;
  },
  get id() {
    return user?.id ?? "";
  },
};

/** Salir borra la copia de los datos del teléfono; lo pendiente de enviar se queda para cuando vuelva a entrar. */
export function logout() {
  const id = user?.id;
  pb.authStore.clear();
  if (id) void clearSnaps(`${id}:`);
}

/** Salir sin borrar nada: la sesión venció y hay que entrar de nuevo. */
export function reauth() {
  pb.authStore.clear();
}

/** El mensaje que se le muestra a la persona, en español y sin jerga. */
export function errorMessage(err: unknown): string {
  if (err instanceof ClientResponseError) {
    if (err.status === 0) return "No hay conexión con el servidor.";
    const fields = Object.entries((err.response?.data ?? {}) as Record<string, { message?: string }>)
      .map(([k, v]) => `${k}: ${v?.message ?? ""}`)
      .join("\n");
    const base = err.response?.message || err.message;
    return fields ? `${base}\n${fields}` : base;
  }
  return err instanceof Error ? err.message : String(err);
}
