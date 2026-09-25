/**
 * Levanta PocketBase (API) y Vite (web) en modo desarrollo.
 * Si falta el binario de PocketBase, lo descarga primero.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PB = join(ROOT, "pocketbase");
const PB_BIN = join(PB, "pocketbase");

if (!existsSync(PB_BIN)) {
  const descarga = Bun.spawn(["bash", "scripts/pb-download.sh"], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await descarga.exited) !== 0) process.exit(1);
}

const api = Bun.spawn(
  [
    PB_BIN,
    "serve",
    "--dir", join(PB, "pb_data"),
    "--hooksDir", join(PB, "pb_hooks"),
    "--migrationsDir", join(PB, "pb_migrations"),
    "--publicDir", join(PB, "pb_public"),
    "--http", process.env.PB_HTTP ?? "127.0.0.1:8093",
  ],
  { cwd: ROOT, stdout: "inherit", stderr: "inherit", env: { ...process.env } },
);

const web = Bun.spawn(["bunx", "vite", "--host"], {
  cwd: ROOT,
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env },
});

const stop = async () => {
  api.kill();
  web.kill();
  await Promise.allSettled([api.exited, web.exited]);
  process.exit(0);
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await Promise.race([api.exited, web.exited]);
stop();
