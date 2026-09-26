/**
 * Gmail por su API REST, con OAuth de Google.
 *
 * Cada usuario conecta SU cuenta de Gmail (permiso de solo lectura) y aquí se
 * guarda el `refresh_token`. La aplicación de Google (cliente y secreto) es
 * una sola y se configura con variables de entorno; ver el README.
 *
 * Todo es síncrono: `$http.send` de PocketBase bloquea hasta la respuesta.
 */

var SCOPE = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email";

/** Los remitentes que se leen si la persona no ha dicho otros: los bancos más comunes en Colombia. */
var DEFAULT_SENDERS = [
  "bancolombia",
  "bold.co",
  "nequi",
  "davivienda",
  "daviplata",
  "bbva",
  "bancodebogota",
  "bancodeoccidente",
  "colpatria",
  "nu.com.co",
  "rappipay",
  "lulobank",
];

/** La búsqueda de Gmail para una lista de remitentes. */
function queryFor(senders) {
  var list = (senders || [])
    .map(function (s) {
      // Sin espacios ni paréntesis: romperían la búsqueda. Un fragmento como
      // "nu@" o "@nu.com" se busca sin la arroba ni el punto de las puntas.
      return String(s || "")
        .trim()
        .toLowerCase()
        .replace(/[\s()"]+/g, "")
        .replace(/^[@.]+|[@.]+$/g, "");
    })
    .filter(Boolean);
  if (!list.length) list = DEFAULT_SENDERS;
  return "from:(" + list.join(" OR ") + ")";
}

function env(name, fallback) {
  var v = $os.getenv(name);
  return v ? v : fallback || "";
}

function config() {
  var appUrl = env("APP_URL", "http://127.0.0.1:8093").replace(/\/+$/, "");
  return {
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
    appUrl: appUrl,
    // A dónde vuelve el navegador después de autorizar. En desarrollo la web
    // corre en otro puerto que PocketBase.
    webUrl: env("WEB_URL", appUrl).replace(/\/+$/, ""),
    redirectUri: appUrl + "/api/finanzas/gmail/callback",
  };
}

function configured() {
  var c = config();
  return !!(c.clientId && c.clientSecret);
}

function form(obj) {
  var out = [];
  for (var k in obj) out.push(encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]));
  return out.join("&");
}

function authUrl(state) {
  var c = config();
  return (
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    form({
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: state,
    })
  );
}

function tokenRequest(body) {
  var res = $http.send({
    url: "https://oauth2.googleapis.com/token",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form(body),
    timeout: 30,
  });
  if (res.statusCode !== 200) {
    throw new Error("Google respondió " + res.statusCode + ": " + toString(res.body, 400));
  }
  return res.json;
}

function exchangeCode(code) {
  var c = config();
  return tokenRequest({
    code: code,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    redirect_uri: c.redirectUri,
    grant_type: "authorization_code",
  });
}

function accessToken(refreshToken) {
  var c = config();
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    grant_type: "refresh_token",
  }).access_token;
}

function api(token, path) {
  var res = $http.send({
    url: "https://gmail.googleapis.com/gmail/v1/users/me/" + path,
    headers: { Authorization: "Bearer " + token },
    timeout: 30,
  });
  if (res.statusCode !== 200) {
    throw new Error("Gmail respondió " + res.statusCode + ": " + toString(res.body, 400));
  }
  return res.json;
}

function profile(token) {
  return api(token, "profile");
}

/**
 * Los ids de los mensajes que casan con la búsqueda (hasta `max`). Incluye la
 * papelera y el spam: mucha gente borra las alertas del banco apenas las lee.
 */
function listIds(token, query, max) {
  var ids = [];
  var page = "";
  do {
    var r = api(
      token,
      "messages?maxResults=100&includeSpamTrash=true&q=" + encodeURIComponent(query) + (page ? "&pageToken=" + page : ""),
    );
    var msgs = r.messages || [];
    for (var i = 0; i < msgs.length && ids.length < max; i++) ids.push(msgs[i].id);
    page = r.nextPageToken || "";
  } while (page && ids.length < max);
  return ids;
}

// ---------- base64url -> texto UTF-8, sin ayuda del entorno ----------

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function b64bytes(s) {
  s = String(s || "").replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/]/g, "");
  var bytes = [];
  var buf = 0;
  var bits = 0;
  for (var i = 0; i < s.length; i++) {
    buf = (buf << 6) | B64.indexOf(s.charAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  return bytes;
}

function utf8(bytes) {
  var out = "";
  for (var i = 0; i < bytes.length; ) {
    var b = bytes[i++];
    var cp;
    if (b < 0x80) cp = b;
    else if (b < 0xe0) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else if (b < 0xf0) cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else {
      cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else out += String.fromCharCode(cp);
  }
  return out;
}

function decodeBase64Url(s) {
  return utf8(b64bytes(s));
}

function header(msg, name) {
  var hs = (msg.payload && msg.payload.headers) || [];
  for (var i = 0; i < hs.length; i++) if (String(hs[i].name).toLowerCase() === name) return hs[i].value;
  return "";
}

/** Las dos versiones del cuerpo: `text/plain` y `text/html` (vacías si no están). */
function bodyParts(payload) {
  var plain = "";
  var html = "";
  (function walk(p) {
    if (!p) return;
    var mime = String(p.mimeType || "");
    if (p.body && p.body.data) {
      if (mime === "text/plain" && !plain) plain = decodeBase64Url(p.body.data);
      else if (mime === "text/html" && !html) html = decodeBase64Url(p.body.data);
    }
    var parts = p.parts || [];
    for (var i = 0; i < parts.length; i++) walk(parts[i]);
  })(payload);
  return { plain: plain, html: html };
}

/** El cuerpo en texto: el `text/plain` si hay, y si no el HTML aplanado. */
function bodyText(parts, htmlToText) {
  return parts.plain && parts.plain.replace(/\s/g, "").length > 20 ? parts.plain : htmlToText(parts.html) || parts.plain;
}

/**
 * Un correo: remitente, asunto, fecha, el texto (con el que se lee) y, si
 * trae HTML, el texto con negritas y enlaces (`rich`, ver parsers.htmlToRich).
 */
function getMessage(token, id, htmlToText, htmlToRich) {
  var m = api(token, "messages/" + id + "?format=full");
  var parts = bodyParts(m.payload);
  var ms = +m.internalDate || Date.now();
  // La fecha local de Colombia (UTC-5), que es la del extracto.
  var local = new Date(ms - 5 * 3600 * 1000).toISOString().slice(0, 10);
  return {
    id: m.id,
    from: header(m, "from"),
    subject: header(m, "subject"),
    date: local,
    text: bodyText(parts, htmlToText) || m.snippet || "",
    rich: parts.html && htmlToRich ? htmlToRich(parts.html) : "",
  };
}

/** El HTML del correo, tal como llegó ("" si solo trae texto). */
function getHtml(token, id) {
  return bodyParts(api(token, "messages/" + id + "?format=full").payload).html;
}

module.exports = {
  DEFAULT_SENDERS: DEFAULT_SENDERS,
  queryFor: queryFor,
  config: config,
  configured: configured,
  authUrl: authUrl,
  exchangeCode: exchangeCode,
  accessToken: accessToken,
  profile: profile,
  listIds: listIds,
  getMessage: getMessage,
  getHtml: getHtml,
  decodeBase64Url: decodeBase64Url,
};
