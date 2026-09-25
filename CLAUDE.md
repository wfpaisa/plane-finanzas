# CLAUDE.md

## Este repositorio es público

Todo lo que se sube aquí lo puede ver cualquiera en GitHub. **No pongas información personal ni financiera real** en código, pruebas, comentarios, commits, capturas ni datos de ejemplo.

Nada de esto debe entrar al repo:

- Nombres reales, correos, teléfonos, cédulas o direcciones.
- Números o terminaciones de cuentas y tarjetas reales (`*1234` sí; la terminación real, no).
- Llaves Bre-B, usuarios de Nequi o alias de pago reales.
- Mensajes de bancos copiados tal cual: cámbiales nombres, montos, llaves y terminaciones antes de usarlos en pruebas o ejemplos.
- Movimientos, saldos o exportaciones reales (`pb_data/`, respaldos, CSV propios).
- Secretos: `.env`, credenciales de Google OAuth, tokens o claves de superusuario.
- IPs, dominios o rutas del servidor propio (por eso `desplegar.sh` está en `.gitignore`).

Usa datos ficticios: `Ana Perez`, `demo@ejemplo.com`, `*1234`, `@ana123`, `Banco Principal`. Las capturas de `docs/capturas/` se toman con la cuenta demo y los datos de `seed/`.

Antes de hacer commit, revisa el diff buscando datos que parezcan reales. Si algo ya se subió, no basta con borrarlo en un commit nuevo: sigue en el historial y hay que reescribirlo.

La única excepción es el correo de contacto en `public/privacidad.html` y el nombre en `LICENSE`, que son públicos a propósito.
