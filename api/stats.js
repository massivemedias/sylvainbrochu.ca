// /api/stats : mesure d'audience du site, sans témoin ni service tiers.
// POST (public) : une page vue, un téléchargement du CV, un envoi du formulaire, ou un signal « toujours en ligne ».
// GET (admin) ?jours=7|30|90 : tableaux de bord.
import { createHash } from "node:crypto";
import { exiger } from "./_lib/auth.js";
import { cmd, pipe } from "./_lib/kv.js";
import { aujourdhui, corps, erreur, joursAvant, json, parametres, vide } from "./_lib/util.js";

const ROBOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|facebookexternalhit|embedly|whatsapp|curl|wget|python|node-fetch|axios/i;
const DUREE = 400 * 86400;
const LIVE_MS = 5 * 60 * 1000;

function source(ref, utm) {
  if (utm) return utm.slice(0, 40).toLowerCase();
  if (!ref) return "Direct ou courriel";
  let h = "";
  try { h = new URL(ref).hostname.replace(/^www\./, ""); } catch { return "Direct ou courriel"; }
  if (/sylvainbrochu\.ca$/.test(h)) return null;
  if (/(^|\.)google\./.test(h)) return "Google";
  if (/bing\.com$/.test(h)) return "Bing";
  if (/duckduckgo/.test(h)) return "DuckDuckGo";
  if (/linkedin\.com$|lnkd\.in$/.test(h)) return "LinkedIn";
  if (/facebook\.com$|fb\.me$|m\.facebook/.test(h)) return "Facebook";
  if (/instagram\.com$/.test(h)) return "Instagram";
  if (/indeed\./.test(h)) return "Indeed";
  if (/mail\.|outlook\.|gmail/.test(h)) return "Courriel";
  if (/^t\.co$|x\.com$|twitter\.com$/.test(h)) return "X";
  if (/chatgpt|openai|perplexity|claude\.ai/.test(h)) return "Assistants IA";
  return h.slice(0, 60);
}

function appareil(ua) {
  if (/iPad|Tablet/i.test(ua)) return "Tablette";
  if (/Mobi|Android|iPhone/i.test(ua)) return "Mobile";
  return "Ordinateur";
}

async function enregistrer(req, res) {
  const ua = req.headers["user-agent"] || "";
  if (ROBOT.test(ua)) return vide(res);
  const b = await corps(req, 4000);
  const e = ["vue", "cv", "contact", "ping"].includes(b.e) ? b.e : "vue";
  const page = String(b.p || "/").slice(0, 120).replace(/[?#].*$/, "");
  if (page.startsWith("/admin")) return vide(res);
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const d = aujourdhui();
  const sel = (await cmd("GET", "sb:secret")) || "sb";
  const h = createHash("sha256").update(`${ip}|${ua}|${d}|${sel}`).digest("hex").slice(0, 14);
  const pays = String(req.headers["x-vercel-ip-country"] || "").toUpperCase();
  let ville = "";
  try { ville = decodeURIComponent(String(req.headers["x-vercel-ip-city"] || "")); } catch { ville = ""; }
  const lieu = ville ? `${ville}${pays ? ", " + pays : ""}` : (pays || "Inconnu");
  const maintenant = Date.now();
  const p = `sb:st:${d}:`;
  const c = [];
  const live = () => {
    c.push(["ZADD", "sb:live", maintenant, h]);
    c.push(["SET", `sb:livei:${h}`, JSON.stringify({ p: page, lieu, dev: appareil(ua), t: maintenant }), "EX", 900]);
    c.push(["ZREMRANGEBYSCORE", "sb:live", 0, maintenant - 3 * LIVE_MS]);
  };
  if (e === "ping") { live(); await pipe(c); return vide(res); }
  if (e === "vue") {
    const src = b.n ? source(b.r, b.u) : null;
    c.push(["INCR", p + "vues"], ["EXPIRE", p + "vues", DUREE]);
    c.push(["PFADD", p + "uv", h], ["EXPIRE", p + "uv", DUREE]);
    c.push(["HINCRBY", p + "pages", page, 1], ["EXPIRE", p + "pages", DUREE]);
    if (b.n) {
      c.push(["HINCRBY", p + "sources", src || "Direct ou courriel", 1], ["EXPIRE", p + "sources", DUREE]);
      c.push(["HINCRBY", p + "lieux", lieu, 1], ["EXPIRE", p + "lieux", DUREE]);
      c.push(["HINCRBY", p + "appareils", appareil(ua), 1], ["EXPIRE", p + "appareils", DUREE]);
    }
    live();
    c.push(["LPUSH", "sb:st:recent", JSON.stringify({ t: maintenant, e, p: page, src: b.n ? (src || "Direct ou courriel") : "", lieu, dev: appareil(ua), h })], ["LTRIM", "sb:st:recent", 0, 299]);
  } else {
    c.push(["INCR", p + e], ["EXPIRE", p + e, DUREE]);
    c.push(["LPUSH", "sb:st:recent", JSON.stringify({ t: maintenant, e, p: page, lieu, dev: appareil(ua), h })], ["LTRIM", "sb:st:recent", 0, 299]);
  }
  await pipe(c);
  return vide(res);
}

const hashVersObjet = (a) => { const o = {}; for (let i = 0; a && i < a.length; i += 2) o[a[i]] = Number(a[i + 1]); return o; };
const fusion = (liste) => { const o = {}; liste.forEach((x) => Object.entries(x).forEach(([k, v]) => { o[k] = (o[k] || 0) + v; })); return Object.entries(o).sort((a, b) => b[1] - a[1]); };

async function tableau(req, res) {
  const u = await exiger(req, res); if (!u) return;
  const jours = Math.min(Math.max(Number(parametres(req).get("jours")) || 30, 1), 120);
  const cache = await cmd("GET", `sb:cache:stats:${jours}`);
  const maintenant = Date.now();
  // En ligne maintenant : toujours frais
  const ids = (await cmd("ZRANGEBYSCORE", "sb:live", maintenant - LIVE_MS, "+inf")) || [];
  const details = ids.length ? await cmd("MGET", ...ids.map((i) => `sb:livei:${i}`)) : [];
  const enLigne = details.map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  if (cache) return json(res, 200, { ...JSON.parse(cache), enLigne });

  const dates = Array.from({ length: jours }, (_, i) => joursAvant(jours - 1 - i));
  const c = [];
  dates.forEach((d) => { const p = `sb:st:${d}:`; c.push(["GET", p + "vues"], ["PFCOUNT", p + "uv"], ["GET", p + "cv"], ["GET", p + "contact"]); });
  dates.forEach((d) => { const p = `sb:st:${d}:`; c.push(["HGETALL", p + "sources"], ["HGETALL", p + "pages"], ["HGETALL", p + "lieux"], ["HGETALL", p + "appareils"]); });
  c.push(["PFCOUNT", ...dates.map((d) => `sb:st:${d}:uv`)]);
  c.push(["LRANGE", "sb:st:recent", 0, 99]);
  const r = await pipe(c);
  const serie = dates.map((d, i) => ({ date: d, vues: Number(r[i * 4] || 0), visiteurs: Number(r[i * 4 + 1] || 0), cv: Number(r[i * 4 + 2] || 0), contact: Number(r[i * 4 + 3] || 0) }));
  const base = dates.length * 4;
  const parJour = (j) => dates.map((_, i) => hashVersObjet(r[base + i * 4 + j]));
  const resultat = {
    jours, serie,
    totaux: {
      vues: serie.reduce((s, x) => s + x.vues, 0),
      visiteurs: Number(r[base * 2] || 0),
      cv: serie.reduce((s, x) => s + x.cv, 0),
      contact: serie.reduce((s, x) => s + x.contact, 0),
    },
    sources: fusion(parJour(0)), pages: fusion(parJour(1)), lieux: fusion(parJour(2)), appareils: fusion(parJour(3)),
    recents: (r[base * 2 + 1] || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean),
  };
  await cmd("SET", `sb:cache:stats:${jours}`, JSON.stringify(resultat), "EX", 90);
  return json(res, 200, { ...resultat, enLigne });
}

export default async function handler(req, res) {
  try {
    if (req.method === "POST") return await enregistrer(req, res);
    if (req.method === "GET") return await tableau(req, res);
    return json(res, 405, { erreur: "Méthode non permise" });
  } catch (e) { return erreur(res, e); }
}
