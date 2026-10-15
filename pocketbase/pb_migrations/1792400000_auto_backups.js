/// <reference path="../pb_data/types.d.ts" />

/**
 * Respaldos automáticos de PocketBase: dos al día (5:00 y 17:00, hora del
 * servidor) y se guardan los últimos 30 en pb_data/backups. Los mismos que
 * tenía finanzas-lite. Se pueden cambiar en el panel /_/ → Settings → Backups.
 */
migrate(
  (app) => {
    const settings = app.settings();
    settings.backups.cron = "0 5,17 * * *";
    settings.backups.cronMaxKeep = 30;
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.backups.cron = "";
    app.save(settings);
  },
);
