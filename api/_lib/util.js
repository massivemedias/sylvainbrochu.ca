// Petits outils HTTP communs aux fonctions.

export function json(res, statut, donnees) {
  res.statusCode = statut;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(donnees));
}

export function vide(res) {
  res.statusCode = 204;
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

export async function corps(req, max = 2_500_000) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return req.body; } }
    if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString("utf8")); } catch { return {}; } }
    return req.body;
  }
  const morceaux = []; let taille = 0;
  for await (const m of req) { taille += m.length; if (taille > max) throw new Error("TROP_GROS"); morceaux.push(m); }
  const brut = Buffer.concat(morceaux).toString("utf8");
  if (!brut) return {};
  try { return JSON.parse(brut); } catch { return {}; }
}

export function cookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

export function parametres(req) {
  return new URL(req.url, "https://www.sylvainbrochu.ca").searchParams;
}

export function erreur(res, e) {
  const msg = e && e.message ? e.message : String(e);
  if (msg === "STOCKAGE_ABSENT") return json(res, 503, { erreur: "STOCKAGE_ABSENT", message: "Le stockage Redis n'est pas encore branché au projet Vercel." });
  if (msg === "COURRIEL_ABSENT") return json(res, 503, { erreur: "COURRIEL_ABSENT", message: "La connexion Gmail n'est pas configurée (variable MAIL_APP_PASSWORD)." });
  console.error(e);
  return json(res, 500, { erreur: "ERREUR", message: msg });
}

// Date du jour à Montréal, au format AAAA-MM-JJ
const FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
export const aujourdhui = (d = new Date()) => FMT.format(d);
export const joursAvant = (n, d = new Date()) => aujourdhui(new Date(d.getTime() - n * 86400e3));
