/** Avisos globales: un error o un "listo" desde cualquier pantalla. */
import { errorMessage } from "./pb.svelte";

let error = $state("");
let ok = $state("");

export const notify = {
  get error() {
    return error;
  },
  get ok() {
    return ok;
  },
  fail(err: unknown) {
    error = "";
    queueMicrotask(() => (error = errorMessage(err)));
  },
  done(msg: string) {
    ok = "";
    queueMicrotask(() => (ok = msg));
  },
};
