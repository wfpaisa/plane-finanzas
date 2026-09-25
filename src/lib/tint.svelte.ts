/**
 * El tinte del fondo de toda la app: lo elige cada quien en Ajustes y se
 * guarda en su usuario (`users.tint`), así al cambiar de cuenta en el mismo
 * navegador se ve el de cada una. El navegador guarda además una copia del
 * último, para pintarlo antes de que cargue nada.
 *
 * Va en `<html data-tint>` como `--tint-h` (el tono) y `--tint-k` (cuánto
 * color: un gris no tiñe, un color vivo tiñe un poco más que la bruma);
 * `glass.css` los usa en el lienzo, el vidrio, las líneas y el texto. Sin
 * tinte (`null`) queda la bruma de partida. El mismo cálculo lo hace el guion de `index.html` antes de
 * pintar, para que no parpadee.
 */
import { isHex, oklchOf } from "./palettes";
import { pb } from "./pb.svelte";
import type { User } from "./types";

const KEY = "finanzas-tinte";
/** De quién es la copia guardada; sin dueño es de antes de guardarlo en el usuario. */
const OWNER = "finanzas-tinte-de";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function keep(color: string | null, owner: string) {
  try {
    if (color) localStorage.setItem(KEY, color);
    else localStorage.removeItem(KEY);
    if (owner) localStorage.setItem(OWNER, owner);
  } catch {
    // Sin almacenamiento se queda para esta pestaña.
  }
}

let chosen = $state<string | null>(isHex(read(KEY)) ? read(KEY) : null);

/* Se aplica al momento: las gráficas se redibujan por el cambio de `chosen`
   y leen ya los colores nuevos. */
function apply(color: string | null) {
  const root = document.documentElement;
  if (color) {
    const { h, c } = oklchOf(color);
    root.dataset.tint = "";
    root.style.setProperty("--tint-h", h.toFixed(1));
    root.style.setProperty("--tint-k", Math.min(1.4, c / 0.1).toFixed(2));
  } else {
    delete root.dataset.tint;
    root.style.removeProperty("--tint-h");
    root.style.removeProperty("--tint-k");
  }
  chosen = color;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Lo guarda en la sesión al momento, para que al refrescarla no se devuelva,
 * y en el usuario un momento después: al arrastrar el selector de color
 * llegan muchos seguidos y solo vale el último.
 */
function save(user: User, color: string | null) {
  pb.authStore.save(pb.authStore.token, { ...user, tint: color ?? "" });
  clearTimeout(timer);
  timer = setTimeout(() => {
    pb.collection("users")
      .update(user.id, { tint: color ?? "" })
      // Sin internet vale para este navegador hasta que la sesión se refresque.
      .catch(() => {});
  }, 600);
}

/**
 * Al entrar (o cambiar de cuenta) manda el tinte del usuario. Quien ya había
 * elegido uno antes de que se guardara en el usuario lo conserva: la copia sin
 * dueño se le sube a la primera cuenta que entre.
 */
function follow() {
  const user = pb.authStore.record as User | null;
  if (!user) return;
  const own = isHex(user.tint) ? user.tint : null;
  const local = isHex(read(KEY)) ? read(KEY) : null;
  if (!own && local && !read(OWNER)) {
    keep(local, user.id);
    save(user, local);
    return;
  }
  if (own !== chosen) apply(own);
  keep(own, user.id);
}

apply(chosen);
follow();
pb.authStore.onChange(follow);

export const tint = {
  get value(): string | null {
    return chosen;
  },
  set(next: string | null) {
    apply(next);
    const user = pb.authStore.record as User | null;
    keep(next, user?.id ?? "");
    if (user) save(user, next);
  },
};
