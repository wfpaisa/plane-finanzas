/**
 * El respaldo completo en un zip: `finanzas.json` con los datos, igual al
 * respaldo de siempre, y `adjuntos/<id del movimiento>/<archivo>` con los
 * adjuntos tal cual. Los datos los arma el servidor (pb_hooks/lib/backup.js);
 * aquí se descargan los adjuntos, se empaca y, al importar, se suben al
 * movimiento nuevo que les corresponde.
 */
import { pb } from "./pb.svelte";

const DATA = "finanzas.json";
const FILES = "adjuntos/";

export type Backup = { app: string; data: { transactions?: { id: string; attachments?: string[] }[] } };

/** Los adjuntos del respaldo, por id viejo del movimiento. */
export type BackupFiles = Map<string, File[]>;

// PocketBase le agrega al nombre un sufijo al azar (`foto_a1b2c3d4e5.jpg`);
// se quita para que al subirlo no quede con dos.
function plainName(name: string) {
  return name.replace(/_[a-z0-9]{10}(\.[^.]+)?$/i, "$1");
}

/** Descarga los datos y los adjuntos y devuelve el zip. `progress` va de 0 a 1. */
export async function exportZip(progress?: (p: number) => void): Promise<Blob> {
  const { zipSync, strToU8 } = await import("fflate");
  const backup = await pb.send<Backup>("/api/finanzas/backup", { method: "GET" });
  const withFiles = (backup.data.transactions ?? []).filter((t) => t.attachments?.length);
  const total = withFiles.reduce((n, t) => n + t.attachments!.length, 0);

  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    [DATA]: strToU8(JSON.stringify(backup, null, 2)),
  };
  let done = 0;
  if (total) {
    const token = await pb.files.getToken();
    for (const t of withFiles) {
      for (const name of t.attachments!) {
        const url = pb.files.getURL({ id: t.id, collectionName: "transactions" }, name, { token });
        const res = await fetch(url);
        if (!res.ok) throw new Error(`No se pudo descargar el adjunto ${name}.`);
        // Fotos y PDF ya vienen comprimidos: se guardan sin volver a comprimir.
        entries[`${FILES}${t.id}/${name}`] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }];
        progress?.(++done / total);
      }
    }
  }
  const zip = zipSync(entries, { level: 6 });
  return new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}

/** Lee un respaldo: zip con adjuntos o el JSON de antes, que no los trae. */
export async function readBackup(file: File): Promise<{ backup: Backup; files: BackupFiles }> {
  const files: BackupFiles = new Map();
  let text: string;
  if (file.name.toLowerCase().endsWith(".zip") || file.type.includes("zip")) {
    const { unzipSync, strFromU8 } = await import("fflate");
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    } catch {
      throw new Error("El zip está dañado o no se puede leer.");
    }
    if (!entries[DATA]) throw new Error("El zip no es un respaldo de Finanzas.");
    text = strFromU8(entries[DATA]);
    for (const [path, bytes] of Object.entries(entries)) {
      const m = path.match(/^adjuntos\/([^/]+)\/([^/]+)$/);
      if (!m) continue;
      const list = files.get(m[1]) ?? [];
      list.push(new File([bytes as Uint8Array<ArrayBuffer>], plainName(m[2])));
      files.set(m[1], list);
    }
  } else {
    text = await file.text();
  }
  let backup: Backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es un JSON válido.");
  }
  if (backup?.app !== "finanzas" || !backup.data) throw new Error("El archivo no es un respaldo de Finanzas.");
  return { backup, files };
}

/**
 * Sube los adjuntos a los movimientos recién creados. `ids` es lo que
 * devuelve la importación: id viejo -> id nuevo. Devuelve cuántos no se
 * pudieron subir; los datos ya quedaron importados aunque falle alguno.
 */
export async function uploadFiles(files: BackupFiles, ids: Record<string, string>, progress?: (p: number) => void) {
  const total = [...files.values()].reduce((n, l) => n + l.length, 0);
  let done = 0;
  let failed = 0;
  for (const [oldId, list] of files) {
    const id = ids[oldId];
    if (!id) {
      failed += list.length;
      continue;
    }
    const form = new FormData();
    for (const f of list) form.append("attachments", f);
    try {
      await pb.collection("transactions").update(id, form);
    } catch {
      failed += list.length;
    }
    done += list.length;
    progress?.(done / total);
  }
  return failed;
}
