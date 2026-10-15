/**
 * Tokens de acceso: la cuenta de alguien, por la API, sin su clave.
 *
 * Sirven para que un asistente (Claude, ChatGPT…) o un programa propio
 * consulte y registre en la cuenta: anotar movimientos, marcar pagos
 * programados, ajustar categorías. El token va en `Authorization: Bearer fz_…`; un middleware
 * (ver main.pb.js) lo reconoce y deja `e.auth` como si la persona hubiera
 * entrado, así las reglas de cada colección siguen valiendo.
 *
 * Lo que un token NO puede, aunque sea de escritura: tocar el usuario (clave,
 * correo), crear o ver otros tokens, cargar un respaldo,
 * borrarlo todo, buscar a otros usuarios ni sacar una sesión normal
 * (auth-refresh). Con permiso de lectura, además, solo consulta.
 *
 * Cada persona tiene un solo token y no vence. Se guarda su hash, para
 * reconocerlo, y el token en un campo oculto (`secret`), para que la persona
 * lo vuelva a ver en Ajustes; solo lo entrega una ruta que exige su sesión.
 */

var PREFIX = "fz_";
var ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Las colecciones que un token puede usar por la API de registros. */
var COLLECTIONS = [
  "accounts",
  "account_balances",
  "categories",
  "transactions",
  "recurring",
  "savings",
  "saving_movements",
  "ignored_imports",
];

/** Rutas propias que un token no puede usar. */
var DENIED = [
  /^\/api\/finanzas\/tokens(\/|$)/,
  /^\/api\/finanzas\/clean$/,
  /^\/api\/finanzas\/users\//,
  /^\/api\/finanzas\/(invitations|invite|setup)(\/|$)/,
];

/** POST que solo consultan: los puede usar un token de lectura. */
var READ_POSTS = [/^\/api\/files\/token$/];


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

/** El token de la persona (el más reciente, si quedan varios de antes) y cuántos tiene. */
function find(app, userId) {
  var list = app.findRecordsByFilter("api_tokens", "owner = {:u}", "-created", 0, 0, { u: userId });
  return { rec: list.length ? list[0] : null, count: list.length };
}

/**
 * El token de la persona, para verlo en Ajustes. `token` va vacío si se creó
 * antes de que se guardara (solo quedó su hash): hay que crear uno nuevo.
 */
function mine(app, userId) {
  var f = find(app, userId);
  if (!f.rec) return { token: null };
  var r = f.rec;
  return {
    token: r.getString("secret"),
    scope: r.getString("scope"),
    expires: r.getString("expires"),
    last_used: r.getString("last_used"),
    created: r.getString("created"),
    count: f.count,
  };
}

/** Borra todos los tokens de la persona. */
function clear(app, userId) {
  var list = app.findRecordsByFilter("api_tokens", "owner = {:u}", "", 0, 0, { u: userId });
  for (var i = 0; i < list.length; i++) app.delete(list[i]);
}

/**
 * Cada persona tiene un solo token, que no vence. `body`: { scope: "read" |
 * "write", renew }. Si ya tiene uno que se puede mostrar y no pide `renew`,
 * solo cambia su permiso; si no, borra los que tenga y crea otro.
 */
function save(app, userId, body) {
  body = body || {};
  var scope = body.scope === "write" ? "write" : "read";
  var f = find(app, userId);
  if (f.rec && f.count === 1 && f.rec.getString("secret") && !body.renew) {
    f.rec.set("scope", scope);
    app.save(f.rec);
    return mine(app, userId);
  }
  clear(app, userId);
  var raw = PREFIX + $security.randomStringWithAlphabet(40, ALPHABET);
  var rec = new Record(app.findCollectionByNameOrId("api_tokens"));
  rec.set("owner", userId);
  rec.set("name", "Token de acceso");
  rec.set("prefix", raw.slice(0, 8));
  rec.set("hash", hash(raw));
  rec.set("secret", raw);
  rec.set("scope", scope);
  rec.set("expires", "");
  app.save(rec);
  return mine(app, userId);
}

// ---------- El contexto para el asistente ----------

var CONTEXT_MAX = 10000;

/** El contexto que la persona dejó para el asistente. */
function context(app, userId) {
  return { context: app.findRecordById("users", userId).getString("assistant_context") };
}

/** Guarda el contexto completo (reemplaza el anterior). `body`: { context }. */
function saveContext(app, userId, body) {
  var text = String((body && body.context) || "").trim();
  if (text.length > CONTEXT_MAX) throw new BadRequestError("El contexto puede tener máximo " + CONTEXT_MAX + " caracteres. Quita lo que ya no sirva.");
  var u = app.findRecordById("users", userId);
  u.set("assistant_context", text);
  app.save(u);
  return { context: text };
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
  var ctx = user.getString("assistant_context").trim();
  var who = [
    "- URL base: `" + baseUrl + "`",
    "- Id de usuario (va en el campo `owner` al crear registros): `" + user.id + "`",
    "- Nombre: " + (user.getString("name") || "(sin nombre)"),
  ];
  if (token) {
    who.push("- Permiso de este token: " + (scope === "write" ? "consultar y cambiar" : "solo consultar (GET)"));
    if (expires) who.push("- Vence: " + expires.slice(0, 10));
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
    "## Contexto de la persona",
    "",
    "Lo que la persona quiere que sepas: qué llave, usuario o terminación es cada cuenta, en qué categoría va cada comercio y otras preferencias. Úsalo al leer sus mensajes del banco para elegir la cuenta, la categoría y el tipo (por ejemplo, un envío a una llave que es otra cuenta suya es una transferencia, no un gasto).",
    "",
    ctx ? "```\n" + ctx + "\n```" : "(Todavía no hay contexto.)",
    "",
    "- Si descubres algo nuevo que sirva la próxima vez (una llave, una terminación, un comercio frecuente), pregúntale a la persona si lo agregas. Con su visto bueno, guárdalo con `PUT /api/finanzas/contexto` `{\"context\": \"...\"}`: envía el texto completo, con lo de antes más lo nuevo.",
    "- Una línea por dato, corta. No guardes montos, saldos ni movimientos: eso ya está en la app.",
    "- Si algo del contexto ya no es cierto, propón corregirlo o quitarlo.",
    "",
    "## Antes de cambiar algo",
    "",
    "1. Lee primero las cuentas y las categorías. Usa los ids reales; no los inventes.",
    "2. Propón los cambios a la persona y espera su visto bueno antes de crear, editar o borrar en cantidad.",
    "3. Borrar no se puede deshacer.",
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
    "Filtros: `filter=(type='expense' && description~'mercado')`. Operadores: `=`, `!=`, `>`, `<`, `~` (contiene), `&&`, `||`.",
    "La respuesta de listar trae `items`, `page`, `perPage`, `totalItems` y `totalPages`; pide páginas hasta cubrir `totalPages`.",
    "`expand=category,account` agrega los registros relacionados en `expand`.",
    "",
    "## Qué es cada cosa",
    "",
    "- **accounts**: cuentas (banco, tarjeta, efectivo…). `archived: true` la saca de las listas sin borrar sus movimientos. Una tarjeta de crédito (`type: tarjeta`) tiene saldo negativo mientras se deba; `credit_limit` es su cupo, y lo disponible es el cupo más el saldo. Pagar la tarjeta es una transferencia hacia ella.",
    "- **account_balances**: saldo actual de cada cuenta (solo lectura; el `id` es el de la cuenta).",
    "- **categories**: categorías de ingreso (`kind: income`) o gasto (`kind: expense`). `budget`: límite mensual. `tags`: etiquetas que heredan sus movimientos.",
    "- **transactions**: movimientos. `type`: " + Object.keys(TYPES).map(function (k) { return "`" + k + "` (" + TYPES[k] + ")"; }).join(", ") + ". Una transferencia usa `account` (origen) y `to_account` (destino) y no lleva categoría. Lo que registres tú lleva `source: manual`; lo que registres desde un correo, `source: gmail` (ver «Registrar desde Gmail»). `recurring_key` dice qué movimiento programado paga (ver «Gastos e ingresos y movimientos programados»).",
    "- **recurring**: movimientos programados (sueldo, arriendo, servicios). `frequency`: `monthly`, `yearly` u `once`. `auto_create`: la app registra el movimiento en su fecha. `for_payment` (solo transferencias): el dinero que mueve queda reservado para un pago. Ver «Gastos e ingresos y movimientos programados».",
    "- **savings** y **saving_movements**: ahorros con meta y sus aportes (positivo) o retiros (negativo).",
    "- **ignored_imports**: marcas de lo que no se debe volver a crear: movimientos del registro automático o de correos que la persona borró, y correos descartados. Se llena solo; para descartar correos usa `correos/descartar`.",
    "",
    "## Registrar un movimiento",
    "",
    "`POST /api/collections/transactions/records` con `owner`, `type`, `date`, `account`, `amount`, `description` y `source: \"manual\"`. Un gasto o ingreso lleva `category` de su mismo tipo; una transferencia lleva `to_account` distinta de `account` y no lleva categoría. `tags` y `notes` son opcionales.",
    "",
    "- Antes de registrar, busca si ya existe uno igual (mismo tipo, cuenta y monto, en fechas cercanas) y pregunta si es el mismo.",
    "- Si viene de un correo, sigue «Registrar desde Gmail».",
    "- Si es el pago de un movimiento programado, no lo crees aquí: usa `recurring/mark` (ver abajo).",
    "",
    "## Registrar desde Gmail",
    "",
    "Finanzas no lee el correo: si tienes acceso al Gmail de la persona, búscalos tú. Finanzas recuerda qué correos ya se revisaron, para que ni tú ni otro asistente registren dos veces el mismo.",
    "",
    "1. Busca en Gmail los avisos de los bancos, billeteras y tarjetas de la persona: compras, pagos, transferencias enviadas y recibidas, retiros. Usa los remitentes que estén en el contexto; si no hay, búscalos por palabras como «compraste», «transferiste», «recibiste», «pagaste» y en las fechas recientes.",
    "2. Con los ids de los mensajes de Gmail (el `id` de la API de Gmail), pide `GET /api/finanzas/correos?ids=<id1>,<id2>`. Cada uno viene `registrado`, `descartado` o `nuevo`. Sigue solo con los `nuevo`.",
    "3. De cada correo nuevo saca el tipo, el monto, la fecha, la cuenta y el comercio o la persona. Usa el contexto para saber qué cuenta es cada llave o terminación y en qué categoría va cada comercio.",
    "4. Busca si la persona ya lo registró a mano (mismo tipo, monto y cuenta, en fechas cercanas) o si es el pago de un movimiento programado (ver «Gastos e ingresos y movimientos programados»).",
    "5. Muéstrale a la persona la tabla de lo que vas a registrar y espera su visto bueno.",
    "6. Registra cada uno con `source: \"gmail\"` y el id del mensaje en `external_id`. Si la respuesta dice que `external_id` ya existe, ese correo ya está registrado: no lo repitas.",
    "7. Los correos revisados que no son un movimiento (publicidad, avisos de seguridad, extractos) márcalos con `POST /api/finanzas/correos/descartar` `{\"ids\": [\"<id>\"]}` para no revisarlos otra vez.",
    "8. Si aprendiste algo que sirva la próxima vez (un remitente de un banco, una llave, un comercio), propón agregarlo al contexto.",
    "",
    "No copies el texto del correo en `notes` ni en el contexto: basta con el movimiento.",
    "",
    "## Gastos e ingresos y movimientos programados",
    "",
    "- **Cuándo toca**: uno mensual cae cada mes en `day_of_month` (o el último día, si el mes es más corto); uno anual, en `month` y `day_of_month`; uno de una vez, en `start_date`. `day_of_month: 0` es «sin día fijo»: toca el mes entero y no se registra solo. `start_date` y `end_date` limitan los meses; `paused` lo saca de todo.",
    "- **El plan del mes** (`summary`): ingresos programados menos gastos programados menos el aporte mensual a los ahorros (en uno compartido, solo la parte de la persona). Lo que queda (`free`) es lo que se puede gastar. Un ingreso cuenta completo en el mes en que cae (uno anual, como una prima, solo en su mes). Un gasto anual cuenta como la doceava parte cada mes; un gasto de una vez no cuenta. Una transferencia solo cuenta, como pago programado, si tiene `for_payment: true` (reserva dinero para un pago, por ejemplo el predial). En la app, lo que se debe en tarjetas de crédito también se suma a lo que hay que reservar y se resta de lo disponible para gastar (sin contar los pagos programados de ese mes hechos con tarjeta, que ya están en los gastos programados).",
    "- **Pagado**: un mes queda pagado cuando un movimiento lleva la marca de ese mes: `rec:<id>:<AAAA-MM>` (mensual), `rec:<id>:<AAAA>` (anual) o `rec:<id>` (de una vez). Si lo creó la app (al marcarlo o con el registro automático), la marca va en `external_id` y `source` es `recurrente`. Si es un movimiento que ya existía (uno que la persona registró antes), va en `recurring_key`.",
    "- **Estados** de lo que falta: `vencido` (la fecha ya pasó), `hoy`, `previsto`, `automatico` (se registrará solo en su fecha) y `sin_fecha`.",
    "- **Registro automático**: cada día, a las 6 a. m., crea los de `auto_create` cuya fecha ya llegó y que no estén pagados. Si la persona borró el de un mes, no lo vuelve a crear.",
    "- **Dinero por reservar**: un gasto anual o de una vez con provisión (`recurring.saving`, un ahorro de tipo `provision`) pide reservar una parte cada mes; cada aporte lleva la marca `prov:<id>:<AAAA-MM>`. Al marcar el pago, lo reservado se libera solo.",
    "- **No crees el pago con la API de registros**: sin la marca, el mes sigue pendiente y el registro automático crearía otro. Usa `recurring/mark`.",
    "- **Antes de marcar, busca si el pago ya llegó**: `GET /api/finanzas/plan` trae en cada pendiente sus `candidates` (mismo tipo, monto parecido, cerca de la fecha). Si uno es el pago, únelo con `transaction`; si no, créalo. Así no queda registrado dos veces.",
    "",
    "## Simular antes de cambiar",
    "",
    "`recurring/mark` acepta `\"dry_run\": true`: hacen todo y lo deshacen al final. La respuesta es la misma que sin simular, con `dry_run: true`. Úsalo siempre antes del cambio real y muestra el resultado a la persona.",
    "",
    "- La simulación también guarda y deshace, así que necesita un token de escritura.",
    "",
    "## Rutas propias",
    "",
    "| Petición | Qué hace |",
    "| --- | --- |",
    "| `GET /api/finanzas/guia` | Esta guía. |",
    "| `GET /api/finanzas/plan?ym=AAAA-MM&months=12&recurring=` | La proyección de un mes (por defecto, el actual): `summary` (ingresos, gastos programados, ahorros y lo libre), `items` (cada programado que toca, con `date`, `status`, el movimiento que lo pagó o sus `candidates`), `extra` (lo marcado cuyo programado ya no toca), `reserves` (dinero por reservar) y `next` (los meses siguientes). Con `recurring`, solo ese programado. No guarda nada. |",
    "| `POST /api/finanzas/recurring/mark` `{\"recurring\": \"<id>\", \"ym\": \"AAAA-MM\"}` | Marca un programado como pagado o recibido en un mes. Sin más, crea el movimiento con sus datos (se pueden cambiar `amount`, `date`, `account` y `description`). Con `transaction: \"<id>\"` une un movimiento que ya existe. Con `unlink: true` lo desmarca: borra el que creó la app o le quita la marca al que se unió. Acepta `dry_run`. Devuelve `{action, key, transaction}`. |",
    "| `POST /api/finanzas/automatic/run` | Registra ahora los movimientos programados y aportes automáticos pendientes. |",
    "| `GET /api/finanzas/correos?ids=<id1>,<id2>` | Qué pasó con cada correo de Gmail (máximo 200): `{items: {<id>: {status, transaction}}}`, con `status` `registrado`, `descartado` o `nuevo`. |",
    "| `POST /api/finanzas/correos/descartar` `{\"ids\": [...]}` | Marca correos revisados que no son un movimiento, para no revisarlos otra vez. |",
    "| `GET /api/finanzas/contexto` | El contexto de la persona: `{context}`. |",
    "| `PUT /api/finanzas/contexto` `{\"context\": \"...\"}` | Reemplaza el contexto completo. Pide antes el visto bueno de la persona. |",
    "| `GET /api/finanzas/backup` | Todos los datos en un JSON. |",
    "",
    "## Receta: poner al día los pagos programados",
    "",
    "1. `GET /api/finanzas/plan?ym=<mes>` para el mes actual y los anteriores que haga falta.",
    "2. De cada `items[]` con `status` `vencido` u `hoy`, mira `candidates`: si uno es claramente el pago (mismo monto, fecha cercana, cuenta o descripción que lo confirma), propón unirlo; si no hay, pregunta si ya se pagó.",
    "3. Muestra a la persona la tabla: programado, mes, qué movimiento se usaría o si se crea uno nuevo.",
    "4. Simula cada uno con `POST /api/finanzas/recurring/mark` y `dry_run: true`; con su visto bueno, repite sin `dry_run`.",
    "5. Si en `extra` hay pagos marcados de programados que ya no tocan, avísale: puede ser un programado que se pausó o se cambió de fecha.",
    "",
    "Otras tareas frecuentes: registrar movimientos que la persona te cuente, crear movimientos programados en `recurring` o recategorizar movimientos antiguos (`PATCH transactions`, con su visto bueno).",
    "",
    "## Límites de los tokens",
    "",
    "Un token no puede cambiar la clave ni el correo, crear otros tokens, cargar un respaldo, borrar todos los datos ni buscar a otros usuarios. Un token de solo lectura solo consulta: puede usar los GET.",
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
  mine: mine,
  save: save,
  clear: clear,
  context: context,
  saveContext: saveContext,
  guide: guide,
};
