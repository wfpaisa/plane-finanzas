/**
 * Tokens de acceso: la cuenta de alguien, por la API, sin su clave.
 *
 * Sirven para que un asistente (Claude, ChatGPT…) o un programa propio
 * consulte y configure la cuenta: leer la bandeja, crear reglas, ajustar
 * categorías. El token va en `Authorization: Bearer fz_…`; un middleware
 * (ver main.pb.js) lo reconoce y deja `e.auth` como si la persona hubiera
 * entrado, así las reglas de cada colección siguen valiendo.
 *
 * Lo que un token NO puede, aunque sea de escritura: tocar el usuario (clave,
 * correo), crear o ver otros tokens, conectar Gmail, cargar un respaldo,
 * borrarlo todo, buscar a otros usuarios ni sacar una sesión normal
 * (auth-refresh). Con permiso de lectura, además, solo consulta.
 *
 * Del token se guarda solo su hash; se muestra una vez, al crearlo.
 */

var PREFIX = "fz_";
var ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Las colecciones que un token puede usar por la API de registros. */
var COLLECTIONS = [
  "accounts",
  "account_balances",
  "categories",
  "transactions",
  "rules",
  "merchants",
  "inbox",
  "recurring",
  "savings",
  "saving_movements",
  "gmail_connections",
  "ignored_imports",
];

/** Rutas propias que un token no puede usar. */
var DENIED = [
  /^\/api\/finanzas\/tokens(\/|$)/,
  /^\/api\/finanzas\/clean$/,
  /^\/api\/finanzas\/gmail\/(connect|callback)$/,
  /^\/api\/finanzas\/users\//,
];

/** POST que solo consultan: los puede usar un token de lectura. */
var READ_POSTS = [/^\/api\/finanzas\/inbox\/suggest$/, /^\/api\/finanzas\/rules\/check$/, /^\/api\/files\/token$/];

var DAY_MS = 24 * 60 * 60 * 1000;

function pbDate(ms) {
  return new Date(ms).toISOString().replace("T", " ");
}

function now() {
  return pbDate(Date.now());
}

function hash(raw) {
  return $security.sha256(String(raw));
}

function looksLikeToken(raw) {
  return String(raw || "").indexOf(PREFIX) === 0;
}

/** El token de la cabecera `Authorization`, con o sin "Bearer"; "" si no es uno de estos. */
function fromHeader(header) {
  var raw = String(header || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  return looksLikeToken(raw) ? raw : "";
}

/**
 * Por qué un token no puede hacer esta petición, o "" si puede.
 * `scope` es "read" o "write"; `path` va sin la consulta.
 */
function denied(scope, method, path) {
  method = String(method || "").toUpperCase();
  var reads = method === "GET" || method === "HEAD";
  var readPost = false;
  for (var i = 0; i < READ_POSTS.length; i++) if (READ_POSTS[i].test(path)) readPost = true;

  var ok = false;
  var m = /^\/api\/collections\/([^/]+)\/records(\/[^/]+)?$/.exec(path);
  if (m) ok = COLLECTIONS.indexOf(m[1]) >= 0;
  m = /^\/api\/files\/([^/]+)\/[^/]+\/[^/]+$/.exec(path);
  if (m) ok = reads && COLLECTIONS.indexOf(m[1]) >= 0;
  if (path === "/api/files/token") ok = true;
  if (/^\/api\/finanzas\//.test(path)) {
    ok = true;
    for (var j = 0; j < DENIED.length; j++) if (DENIED[j].test(path)) ok = false;
    // Exportar el respaldo sí; cargar uno encima de todo, no.
    if (path === "/api/finanzas/backup" && !reads) ok = false;
  }
  if (!ok) return "Este token no tiene acceso a esta ruta. Consulta GET /api/finanzas/guia para ver qué puede usar.";
  if (scope !== "write" && !reads && !readPost) return "Este token es de solo lectura: no puede crear, cambiar ni borrar.";
  return "";
}

/**
 * El usuario dueño de un token válido, y el registro del token. Lanza si no
 * existe o venció. Anota el último uso, como mucho una vez por minuto.
 */
function authenticate(app, raw) {
  var rec;
  try {
    rec = app.findFirstRecordByFilter("api_tokens", "hash = {:h}", { h: hash(raw) });
  } catch (_) {
    throw new UnauthorizedError("El token no existe o fue eliminado.");
  }
  var expires = rec.getString("expires");
  if (expires && expires < now()) throw new UnauthorizedError("El token venció. Crea uno nuevo en Ajustes.");
  var user = app.findRecordById("users", rec.getString("owner"));
  var last = rec.getString("last_used");
  if (!last || last < pbDate(Date.now() - 60 * 1000)) {
    try {
      rec.set("last_used", now());
      app.save(rec);
    } catch (err) {
      // Anotar el uso nunca debe impedir la petición.
      console.log("[finanzas] tokens: " + err);
    }
  }
  return { user: user, token: rec };
}

/**
 * Crea un token. `body`: { name, scope: "read" | "write", days: 0 (no vence) | n }.
 * Devuelve el token en claro: es la única vez que se ve.
 */
function create(app, userId, body) {
  body = body || {};
  var name = String(body.name || "").trim();
  if (!name) throw new BadRequestError("Escribe un nombre para reconocer el token.");
  var scope = body.scope === "write" ? "write" : "read";
  var days = Math.max(0, Math.floor(+body.days || 0));
  if (days > 3650) throw new BadRequestError("Elige un vencimiento de máximo 10 años.");

  var raw = PREFIX + $security.randomStringWithAlphabet(40, ALPHABET);
  var rec = new Record(app.findCollectionByNameOrId("api_tokens"));
  rec.set("owner", userId);
  rec.set("name", name.slice(0, 80));
  rec.set("prefix", raw.slice(0, 8));
  rec.set("hash", hash(raw));
  rec.set("scope", scope);
  rec.set("expires", days ? pbDate(Date.now() + days * DAY_MS) : "");
  app.save(rec);
  return { id: rec.id, token: raw, name: rec.getString("name"), scope: scope, expires: rec.getString("expires") };
}

// ---------- La guía: cómo usar la API, para quien no ve el código ----------

var TYPES = { income: "ingreso", expense: "gasto", transfer: "transferencia" };

function describeField(f, names) {
  var bits = [f.type];
  if (f.required) bits.push("obligatorio");
  if (f.values && f.values.length) bits.push("valores: " + f.values.join(", "));
  if (f.collectionId) bits.push("id de " + (names[f.collectionId] || f.collectionId) + (f.maxSelect > 1 ? " (varios)" : ""));
  if (f.type === "number" && (f.min || f.min === 0) && f.min !== null) bits.push("mín. " + f.min);
  if (f.type === "text" && f.max) bits.push("máx. " + f.max + " caracteres");
  return bits.join(" · ");
}

function schema(app) {
  var names = {};
  var cols = [];
  var all = JSON.parse(JSON.stringify(app.findAllCollections()));
  for (var i = 0; i < all.length; i++) names[all[i].id] = all[i].name;
  for (var j = 0; j < COLLECTIONS.length; j++) {
    var c = null;
    for (var k = 0; k < all.length; k++) if (all[k].name === COLLECTIONS[j]) c = all[k];
    if (!c) continue;
    var lines = ["### " + c.name + (c.type === "view" ? " (solo lectura)" : ""), "", "| Campo | Tipo |", "| --- | --- |"];
    var fields = c.fields || [];
    for (var n = 0; n < fields.length; n++) {
      var f = fields[n];
      if (f.hidden || f.name === "id" || f.type === "autodate") continue;
      lines.push("| `" + f.name + "` | " + describeField(f, names) + " |");
    }
    cols.push(lines.join("\n"));
  }
  return cols.join("\n\n");
}

/** La guía en Markdown, con los datos de quien la pide. */
function guide(app, user, token, baseUrl) {
  var scope = token ? token.getString("scope") : "write";
  var expires = token ? token.getString("expires") : "";
  var who = [
    "- URL base: `" + baseUrl + "`",
    "- Id de usuario (va en el campo `owner` al crear registros): `" + user.id + "`",
    "- Nombre: " + (user.getString("name") || "(sin nombre)"),
  ];
  if (token) {
    who.push("- Permiso de este token: " + (scope === "write" ? "consultar y cambiar" : "solo consultar (GET)"));
    who.push("- Vence: " + (expires ? expires.slice(0, 10) : "no vence"));
  }

  return [
    "# Finanzas: guía de la API",
    "",
    "Finanzas es una app para llevar las cuentas personales en pesos colombianos (COP).",
    "Esta guía explica cómo consultar y configurar la cuenta de una persona usando solo la API HTTP.",
    "Todo lo que ve la persona en la app se puede leer y cambiar por aquí.",
    "",
    "## Tu sesión",
    "",
    who.join("\n"),
    "",
    "Envía el token en cada petición:",
    "",
    "```",
    "Authorization: Bearer fz_...",
    "```",
    "",
    "Respuestas y cuerpos en JSON (`Content-Type: application/json`). Los errores traen `message` y, por campo, `data`.",
    "",
    "## Antes de cambiar algo",
    "",
    "1. Lee primero: cuentas, categorías, reglas y la bandeja. Usa los ids reales; no los inventes.",
    "2. Propón los cambios a la persona y espera su visto bueno antes de crear, editar o borrar en cantidad.",
    "3. Borrar no se puede deshacer. Un correo de la bandeja borrado no vuelve a leerse.",
    "4. Los montos son números positivos en pesos, sin separadores (`125000`). El tipo (`income`, `expense`, `transfer`) dice si entra o sale.",
    "5. Las fechas van como `AAAA-MM-DD 12:00:00.000Z`.",
    "6. Esta API no mueve dinero en ningún banco: solo registra y organiza.",
    "",
    "## API de registros",
    "",
    "Cada colección de abajo se maneja con las rutas estándar de PocketBase:",
    "",
    "| Acción | Petición |",
    "| --- | --- |",
    "| Listar | `GET /api/collections/{colección}/records?filter=...&sort=-date&page=1&perPage=200&expand=category` |",
    "| Ver uno | `GET /api/collections/{colección}/records/{id}` |",
    "| Crear | `POST /api/collections/{colección}/records` con el JSON del registro (incluye `owner`) |",
    "| Editar | `PATCH /api/collections/{colección}/records/{id}` con solo los campos que cambian |",
    "| Borrar | `DELETE /api/collections/{colección}/records/{id}` |",
    "",
    "Filtros: `filter=(status='pendiente' && sender~'bancolombia')`. Operadores: `=`, `!=`, `>`, `<`, `~` (contiene), `&&`, `||`.",
    "La respuesta de listar trae `items`, `page`, `perPage`, `totalItems` y `totalPages`; pide páginas hasta cubrir `totalPages`.",
    "`expand=category,account` agrega los registros relacionados en `expand`.",
    "",
    "## Qué es cada cosa",
    "",
    "- **accounts**: cuentas (banco, tarjeta, efectivo…). `senders` es la lista de remitentes de correo con que se reconoce la cuenta. `refs`: terminaciones y llaves con que la nombran los avisos (`\"*1234\"`, `\"@ana123\"`, el número completo); ver «Qué entiende el lector». `type: efectivo` marca la cuenta a donde van los retiros en cajero.",
    "- **account_balances**: saldo actual de cada cuenta (solo lectura; el `id` es el de la cuenta).",
    "- **categories**: categorías de ingreso (`kind: income`) o gasto (`kind: expense`). `keywords`: palabras separadas por comas que clasifican solos los movimientos que las mencionan. `budget`: límite mensual. `tags`: etiquetas que heredan sus movimientos.",
    "- **transactions**: movimientos. `type`: " + Object.keys(TYPES).map(function (k) { return "`" + k + "` (" + TYPES[k] + ")"; }).join(", ") + ". Una transferencia usa `account` (origen) y `to_account` (destino) y no lleva categoría. `external_id` une el movimiento con su correo de la bandeja. `recurring_key` dice qué movimiento programado paga (ver «Proyección y movimientos programados»).",
    "- **inbox**: la bandeja. Cada correo del banco (o texto pegado) leído. `status: pendiente` espera una decisión; `procesado` ya tiene movimiento. `parsed` trae lo que se leyó: monto, tipo y descripción. Se crea sola al leer Gmail; desde la API solo se lista o se borra (descartar).",
    "- **rules**: reglas que convierten correos en movimientos sin intervención. Ver abajo.",
    "- **merchants**: nombres de comercios (alias). `match`: textos separados por comas que se buscan en el comercio leído del correo (`parsed.merchant`); `name`: el nombre limpio; `category` (opcional): la categoría que se pone, antes que las palabras clave. Si coinciden varios, gana el de texto más largo. También sirven para cuentas o llaves de otras personas: `match: \"12345678901\"` nombra las transferencias a esa cuenta. La categoría del alias gana a la de la regla.",
    "- **recurring**: movimientos programados (sueldo, arriendo, servicios). `frequency`: `monthly`, `yearly` u `once`. `auto_create`: la app registra el movimiento en su fecha. Ver «Proyección y movimientos programados».",
    "- **savings** y **saving_movements**: ahorros con meta y sus aportes (positivo) o retiros (negativo).",
    "- **gmail_connections**: la conexión con Gmail. `senders` es la lista de remitentes que se leen; `paused` la detiene.",
    "- **ignored_imports**: ids de correos descartados que no se vuelven a leer.",
    "",
    "## Cómo lee Gmail la app",
    "",
    "- Cada 30 minutos busca en Gmail `from:(remitente1 OR remitente2 …)` con los remitentes de `gmail_connections.senders` y los `senders` de cada cuenta activa. Incluye la papelera y el spam.",
    "- **Gmail compara palabras completas**, no pedazos: `bancolombia` trae `@bancolombia.com.co` o un remitente llamado «Bancolombia», pero no `@notificacionesbancolombia.com`. Para un dominio así, agrega el dominio completo (`notificacionesbancolombia.com`). En `gmail/messages` y `rules/check`, `autoRead` dice si la lectura automática trae cada correo.",
    "- **Hasta dónde mira atrás**: la primera lectura, la que sigue a un cambio de remitentes (en Gmail o en una cuenta) y `gmail/sync` con `again` traen solo los **últimos 90 días** (máximo 300 correos). Después, solo lo nuevo desde la última lectura. Un correo más viejo nunca entra solo, aunque su remitente se agregue.",
    "- `status: nuevo` en `gmail/messages` solo dice que el correo nunca entró a la app, no que vaya a entrar: si tiene más de 90 días, no entrará.",
    "- **Lo que ya está en la app no entra otra vez**: la lectura se salta todo correo que ya está en la bandeja, que ya tiene un movimiento con su id en `external_id` (sin importar la fuente de ese movimiento) o que se descartó. `again` solo vuelve a traer lo descartado. `action` dice qué haría la regla con el correo; `onSync` dice qué hará la próxima lectura: `omitir` (ya está en la app), `no_lo_trae` (ningún remitente lo lee) o la misma `action` si entraría.",
    "- Lo que entra: si una regla lo reconoce, se registra de una vez; si no, queda pendiente en la bandeja. Si ya había uno igual de otra fuente (anotado a mano, o importado por CSV o texto pegado: mismo tipo, cuenta y monto, con un día de diferencia como mucho), el nuevo queda marcado como posible repetido (`dup_of`) y se une con `tx/merge`. Dos de la misma fuente no se marcan. Si la persona ya importó por CSV lo que ahora llegará por correo, avísale antes de agregar el remitente.",
    "- `ignored_imports` se llena solo, al descartar un correo de la bandeja o borrar un movimiento importado. La API no permite crear registros ahí.",
    "- Antes de agregar remitentes, revisa qué entraría: `GET /api/finanzas/gmail/messages?q=from:<remitente>&days=90` y `POST /api/finanzas/rules/check` con `{\"q\": \"from:<remitente>\", \"days\": 90}`.",
    "",
    "## Proyección y movimientos programados",
    "",
    "- **Cuándo toca**: uno mensual cae cada mes en `day_of_month` (o el último día, si el mes es más corto); uno anual, en `month` y `day_of_month`; uno de una vez, en `start_date`. `day_of_month: 0` es «sin día fijo»: toca el mes entero y no se registra solo. `start_date` y `end_date` limitan los meses; `paused` lo saca de todo.",
    "- **El plan del mes** (`summary`): ingresos programados menos gastos programados menos el aporte mensual a los ahorros (en uno compartido, solo la parte de la persona). Lo que queda (`free`) es lo que se puede gastar. Un anual cuenta como la doceava parte cada mes; uno de una vez y las transferencias no cuentan.",
    "- **Pagado**: un mes queda pagado cuando un movimiento lleva la marca de ese mes: `rec:<id>:<AAAA-MM>` (mensual), `rec:<id>:<AAAA>` (anual) o `rec:<id>` (de una vez). Si lo creó la app (al marcarlo o con el registro automático), la marca va en `external_id` y `source` es `recurrente`. Si es un movimiento que ya existía (uno que llegó por Gmail), va en `recurring_key` y el movimiento conserva su correo.",
    "- **Estados** de lo que falta: `vencido` (la fecha ya pasó), `hoy`, `previsto`, `automatico` (se registrará solo en su fecha) y `sin_fecha`.",
    "- **Registro automático**: cada día, a las 6 a. m., crea los de `auto_create` cuya fecha ya llegó y que no estén pagados. Si la persona borró el de un mes, no lo vuelve a crear.",
    "- **Dinero por reservar**: un gasto anual o de una vez con provisión (`recurring.saving`, un ahorro de tipo `provision`) pide reservar una parte cada mes; cada aporte lleva la marca `prov:<id>:<AAAA-MM>`. Al marcar el pago, lo reservado se libera solo.",
    "- **No crees el pago con la API de registros**: sin la marca, el mes sigue pendiente y el registro automático crearía otro. Usa `recurring/mark`.",
    "- **Antes de marcar, busca si el pago ya llegó**: `GET /api/finanzas/plan` trae en cada pendiente sus `candidates` (mismo tipo, monto parecido, cerca de la fecha). Si uno es el pago, únelo con `transaction`; si no, créalo. Así no queda registrado dos veces.",
    "",
    "## Qué entiende el lector",
    "",
    "Cada aviso se lee sin reglas y deja en `parsed`:",
    "",
    "- `operation`: `compra`, `pago`, `transferencia`, `retiro`, `nomina`, `ingreso`, `devolucion` u `otro`.",
    "- `refs`: las terminaciones y llaves del texto, cada una con `role`: `from` (de ahí sale el dinero: «desde tu cuenta *1234»), `to` (ahí llega: «a la tarjeta *5678», «en tu cuenta *1234») o vacío (no lo dice: «con tu T.Cred *1234»).",
    "- `rejected`: el aviso dice que la operación fue rechazada o no se hizo. **Se descarta solo**, aunque una regla lo reconozca.",
    "",
    "Con los `refs` de cada cuenta (`accounts.refs`):",
    "",
    "- La cuenta del movimiento es la que el aviso nombra (la de origen en un gasto, la de destino en un ingreso); si no nombra ninguna, la del remitente (`senders`).",
    "- Si nombra otra cuenta propia en la otra punta, es una **transferencia** entre las dos, sin categoría. Un retiro en cajero es una transferencia a la cuenta de tipo `efectivo`, si existe.",
    "- Una cuenta o llave que no es de ninguna cuenta propia queda como comercio: sale en `merchant` (en `inbox/suggest`, `gmail/messages` y `rules/check`) y se le pone nombre con un alias en `merchants`.",
    "",
    "Por eso, completar `refs` en cada cuenta evita una regla por tarjeta o por pago entre cuentas propias.",
    "",
    "## Reglas",
    "",
    "Una regla coincide con un correo cuando:",
    "",
    "- `sender` (si lo tiene) aparece en el remitente del correo, y",
    "- alguno de los textos de `match` (separados por comas; si tiene) aparece en el correo, y",
    "- `amount` (si es mayor que 0) es exactamente el monto del correo.",
    "",
    "No importan mayúsculas ni tildes. Si coinciden varias, gana la que exige monto, luego la de texto más largo. Una regla con solo remitente es la de «todo lo de este banco».",
    "",
    "Lo que la regla pone en el movimiento: `type` (`discard` descarta el correo sin crear nada), `account`, `to_account` (en transferencias), `category`, `tags`, `notes`, `set_amount` (monto fijo; 0 usa el del correo) y `description`. `paused: true` la desactiva. La fecha siempre es la del correo.",
    "",
    "**Lo que el aviso dice con certeza gana a la regla**, que queda como valor por defecto: la cuenta nombrada por su terminación o llave gana a `account`; una transferencia entre cuentas propias sigue siendo transferencia aunque la regla diga otro `type`; y la categoría del alias del comercio gana a `category`. Así, una regla general por banco con una categoría por defecto sirve para todas sus tarjetas y comercios.",
    "",
    "### Descripción",
    "",
    "- Marcas: `{mes}`, `{año}`, `{original}` (la descripción leída del correo) y `{comercio}` (el nombre del alias en `merchants`; si no hay alias, el comercio leído; si tampoco, la descripción).",
    "- Filtros, en cadena: `{comercio|sin_ciudad|capitalizar}`. Existen `capitalizar` (IKEA ENVIGADO → Ikea Envigado), `sin_ciudad` (quita municipios del final), `primera_palabra`, `mayusculas` y `minusculas`.",
    "- **Los filtros no se aplican al nombre de un alias**: `{comercio|capitalizar}` deja «EPM» y «KFC» tal como se escribieron en `merchants`. Solo limpian el comercio leído del correo cuando no tiene alias. Escribe cada alias con su nombre final.",
    "- Para ver cómo queda una descripción antes de guardar, prueba la regla con `POST /api/finanzas/rules/check` y el campo `rule`: no guarda nada y lo puede usar un token de solo lectura.",
    "- Sin descripción en la regla, el movimiento lleva el nombre del alias si lo hay, o la descripción leída.",
    "- Lo recomendado: completa `refs` en las cuentas, crea una regla general por banco (solo `sender`, con una categoría por defecto y `description: \"{comercio|sin_ciudad|capitalizar}\"`) y un alias en `merchants` por cada comercio o destinatario que necesite otro nombre o categoría. No crees una regla por comercio, por tarjeta ni por pago entre cuentas propias.",
    "",
    "Crea y edita reglas con `POST /api/finanzas/inbox/rule` (no con la API de registros): así se aplican de una vez a la bandeja.",
    "",
    "## Simular antes de cambiar",
    "",
    "`inbox/rule`, `inbox/process`, `rules/apply`, `merchants/apply` y `recurring/mark` aceptan `\"dry_run\": true`: hacen todo y lo deshacen al final. La respuesta es la misma que sin simular, con `dry_run: true`. Úsalo siempre antes del cambio real y muestra el resultado a la persona.",
    "",
    "- `rules/apply` devuelve `changes`: cada movimiento que cambiaría, con los campos `{from, to}`.",
    "- `merchants/apply` devuelve `changes` (nombre y categoría, antes y después) y `skipped`: los movimientos que el alias reconoce pero no cambia, con `reason` (anotado a mano, creado por un movimiento programado, o con una regla de descripción fija).",
    "- `inbox/process` devuelve `changes`: qué correo se registraría o descartaría, con el movimiento.",
    "- `inbox/rule` devuelve `changes`: los movimientos ya procesados que la regla rehace (con los campos `{from, to}`) y lo pendiente que registraría. **Simula siempre antes de editar una regla general**: puede rehacer muchos movimientos.",
    "- La simulación también guarda y deshace, así que necesita un token de escritura.",
    "",
    "## Rutas propias",
    "",
    "| Petición | Qué hace |",
    "| --- | --- |",
    "| `GET /api/finanzas/guia` | Esta guía. |",
    "| `POST /api/finanzas/inbox/suggest` `{\"id\": \"<id del correo>\"}` | Lo que la app propone para un correo: `tx` (movimiento), `parsed`, `pattern` (texto que lo distingue) y `rule` (la regla que coincide, si hay). |",
    "| `POST /api/finanzas/inbox/rule` `{\"rule\": {...}, \"inbox\": \"<id>\", \"scope\": \"rule\", \"apply\": true}` | Guarda la regla y la aplica al correo dado (opcional) y a todo lo pendiente. Para editar, manda `rule.id` y **solo los campos que cambian**: `{\"id\": \"<id>\", \"paused\": true}` la pausa. Al editar, también rehace desde su correo los movimientos ya procesados **donde esta regla es la que gana hoy** (no los que otra regla más precisa reconoce); `apply: false` lo evita. Con `scope: \"this\"` solo crea el movimiento de ese correo, sin guardar la regla. Devuelve `{rule, created, updated, pending, changes}`: `changes` dice qué cambió en cada movimiento. Con `dry_run: true`, lo mismo sin guardar nada. |",
    "| `GET /api/finanzas/gmail/messages?q=&all=&days=90&max=25&pageToken=&full=` | Los correos tal como están en Gmail, **incluidos la papelera y el spam** y los que ya se procesaron o descartaron. Sin `q` busca los remitentes que se leen; `q` es una búsqueda de Gmail (`from:nequi subject:compra`); `all=true` quita el filtro de remitentes; `days=0` quita el límite de fechas. Máximo 100 por página: sigue con `pageToken=<next>`. Cada correo trae `labels`, `trash`, `spam`, `status` en la app (`nuevo`, `pendiente`, `procesado`, `registrado`, `descartado`), `autoRead`, `onSync` (qué hará la próxima lectura), `parsed`, la regla que gana (`rule`), las que también coinciden (`also`), la acción de hoy (`registrar`, `descartar`, `pendiente`), el movimiento que crearía (`tx`) y `problems`. `text` va recortado salvo con `full=true`. No guarda nada. |",
    "| `POST /api/finanzas/rules/check` `{\"days\": 90, \"max\": 200, \"q\": \"\", \"source\": \"gmail\", \"rule\": {...}, \"messages\": \"problems\"}` | Valida las reglas contra correos reales sin guardar nada. `source: \"bandeja\"` usa los correos guardados en vez de Gmail. Con `rule` prueba una regla sin guardarla (con el `id` de una existente, prueba su edición). Devuelve `summary`, `rules` (cada una con `matches`, `pending`, `lost`, `samples`, `problems` y `ok`) y `messages` (solo los que tienen problemas o no tienen regla; `\"messages\": \"all\"` los trae todos). |",
    "| `POST /api/finanzas/inbox/process` `{\"dry_run\": false}` | Pasa las reglas por todos los correos pendientes y descarta los rechazados. Devuelve `{created, changes}`. |",
    "| `POST /api/finanzas/rules/apply` `{\"rule\": \"<id>\", \"dry_run\": false}` | Aplica la regla a los movimientos ya guardados (categoría, etiquetas, descripción). Devuelve `{changed, changes}`. |",
    "| `POST /api/finanzas/merchants/apply` `{\"id\": \"<id>\", \"dry_run\": false}` | Pone el nombre (y la categoría) del alias a los movimientos importados que ya existen (de Gmail, texto pegado o CSV). Sin `id`, todos los alias. No toca lo anotado a mano ni lo que una regla nombró con texto fijo. Devuelve `{changed, changes, skipped}`. |",
    "| `POST /api/finanzas/import-text` `{\"text\": \"...\"}` | Lleva a la bandeja notificaciones pegadas (una por párrafo). |",
    "| `POST /api/finanzas/gmail/sync` `{\"again\": false}` | Lee Gmail ahora. |",
    "| `GET /api/finanzas/inbox/{id}/html` | El HTML original de un correo de Gmail. |",
    "| `POST /api/finanzas/tx/merge` `{\"id\": \"<id>\"}` | Une un movimiento con su posible repetido (`dup_of`). |",
    "| `GET /api/finanzas/plan?ym=AAAA-MM&months=12&recurring=` | La proyección de un mes (por defecto, el actual): `summary` (ingresos, gastos programados, ahorros y lo libre), `items` (cada programado que toca, con `date`, `status`, el movimiento que lo pagó o sus `candidates`), `extra` (lo marcado cuyo programado ya no toca), `reserves` (dinero por reservar) y `next` (los meses siguientes). Con `recurring`, solo ese programado. No guarda nada. |",
    "| `POST /api/finanzas/recurring/mark` `{\"recurring\": \"<id>\", \"ym\": \"AAAA-MM\"}` | Marca un programado como pagado o recibido en un mes. Sin más, crea el movimiento con sus datos (se pueden cambiar `amount`, `date`, `account` y `description`). Con `transaction: \"<id>\"` une un movimiento que ya existe. Con `unlink: true` lo desmarca: borra el que creó la app o le quita la marca al que se unió. Acepta `dry_run`. Devuelve `{action, key, transaction}`. |",
    "| `POST /api/finanzas/automatic/run` | Registra ahora los movimientos programados y aportes automáticos pendientes. |",
    "| `GET /api/finanzas/backup` | Todos los datos en un JSON. |",
    "",
    "## Receta: revisar los correos y crear reglas",
    "",
    "1. Lee cuentas, categorías y reglas para conocer sus ids. Si a una cuenta le faltan `refs`, propón a la persona completarlas antes de crear reglas.",
    "2. Lista la bandeja pendiente: `GET /api/collections/inbox/records?filter=(status='pendiente')&sort=-date&perPage=200`.",
    "3. Agrupa los correos por remitente y por comercio o concepto (`parsed.description`, `subject`, `text`).",
    "4. Para un correo de cada grupo, pide `POST /api/finanzas/inbox/suggest` y usa `pattern` como punto de partida para `match`.",
    "5. Propón a la persona una tabla: nombre de la regla, remitente, texto, tipo, cuenta, categoría y cuántos correos cubre. Incluye reglas `discard` para lo que no es un movimiento (publicidad, códigos de verificación).",
    "6. Con su visto bueno, crea cada regla con `POST /api/finanzas/inbox/rule` y `scope: \"rule\"`.",
    "7. Vuelve a listar lo pendiente y repite con lo que quedó.",
    "",
    "## Receta: validar que las reglas estén bien",
    "",
    "1. `POST /api/finanzas/rules/check` con `{\"days\": 180, \"max\": 300}`. Si `summary.rulesWithProblems` es 0 y no hay mensajes con problemas, las reglas están bien.",
    "2. Revisa `rules[].problems`: cuentas o categorías borradas o archivadas, categoría de otro tipo, transferencias sin destino, remitentes que Gmail no lee, reglas duplicadas, reglas que nunca coinciden o que siempre pierden con otra.",
    "3. Revisa `messages[]`: correos sin regla (candidatos a una regla nueva), empates entre reglas, correos a los que les falta un dato y movimientos registrados que hoy quedarían distintos (`differences`).",
    "4. Antes de guardar un cambio, pruébalo: manda la regla corregida en `rule` y compara el resultado.",
    "5. Con el visto bueno de la persona, guárdala con `POST /api/finanzas/inbox/rule`. Para traer de nuevo correos descartados o borrados de la bandeja usa `POST /api/finanzas/gmail/sync` con `{\"again\": true}`.",
    "",
    "## Receta: poner al día los pagos programados",
    "",
    "1. `GET /api/finanzas/plan?ym=<mes>` para el mes actual y los anteriores que haga falta.",
    "2. De cada `items[]` con `status` `vencido` u `hoy`, mira `candidates`: si uno es claramente el pago (mismo monto, fecha cercana, cuenta o descripción que lo confirma), propón unirlo; si no hay, pregunta si ya se pagó.",
    "3. Muestra a la persona la tabla: programado, mes, qué movimiento se usaría o si se crea uno nuevo.",
    "4. Simula cada uno con `POST /api/finanzas/recurring/mark` y `dry_run: true`; con su visto bueno, repite sin `dry_run`.",
    "5. Si en `extra` hay pagos marcados de programados que ya no tocan, avísale: puede ser un programado que se pausó o se cambió de fecha.",
    "",
    "## Receta: nombres limpios para los comercios",
    "",
    "1. Junta los comercios que se leen: `parsed.merchant` en `GET /api/finanzas/gmail/messages` o en la bandeja (`inbox`).",
    "2. Agrupa los que son el mismo comercio (IKEA ENVIGADO e IKEA BOGOTA son Ikea) y propón a la persona una tabla: texto a buscar, nombre y categoría.",
    "3. Con su visto bueno, crea cada alias con `POST /api/collections/merchants/records` (`owner`, `match`, `name`, `category`).",
    "4. Revisa que las reglas de compras usen `{comercio}` en la descripción, o que no tengan descripción.",
    "5. Para actualizar los movimientos que ya existen, simula primero con `POST /api/finanzas/merchants/apply` y `{\"dry_run\": true}`; con el visto bueno, repite sin `dry_run`.",
    "",
    "Otras tareas frecuentes: agregar `keywords` a las categorías (`PATCH categories`), completar `senders` de cada cuenta, crear movimientos programados en `recurring`, o recategorizar movimientos antiguos con `rules/apply`.",
    "",
    "## Límites de los tokens",
    "",
    "Un token no puede cambiar la clave ni el correo, crear otros tokens, conectar Gmail, cargar un respaldo, borrar todos los datos ni buscar a otros usuarios. Un token de solo lectura solo consulta: puede usar los GET y los POST que no guardan nada (`inbox/suggest` y `rules/check`).",
    "",
    "## Esquema",
    "",
    "Campos de cada colección, leídos del servidor. `id`, `created` y `updated` los pone el servidor.",
    "",
    schema(app),
    "",
  ].join("\n");
}

module.exports = {
  PREFIX: PREFIX,
  COLLECTIONS: COLLECTIONS,
  fromHeader: fromHeader,
  denied: denied,
  authenticate: authenticate,
  create: create,
  guide: guide,
};
