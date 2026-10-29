// /api/offres : veille d'offres d'emploi, à partir de sources publiques.
// Carrière : Cirque du Soleil (Lever), Solotech, Humanise/GSM (Teamtailor), Guichet-Emplois.
// Temporaire (bar, service) : Hôtellerie Jobs, Guichet-Emplois.
// GET ?rafraichir=1 pour ignorer le cache (3 h).
import { createHash } from "node:crypto";
import { exiger } from "./_lib/auth.js";
import { cmd } from "./_lib/kv.js";
import { erreur, json, parametres } from "./_lib/util.js";

const CARRIERE = /(chargé|charg[ée]e|gestionnaire|directeur|directrice|direction|coordonnat|responsable|producteur|productrice|chef de projet|project manager|production manager|operations manager|producer|logisti|opérations|operations|événement|evenement|event|scénograph|exposition|fabrication|atelier)/i;
const EXCLURE = /(stagiaire|stage |intern\b|comptab|developpeur|développeur|software|ingénieur logiciel|vente au détail|caissier|marketing|ventes|sales|financ|juridique|legal|paie|payroll|data|analyste|cybers|informatique|\bTI\b|\bIT\b|ressources humaines|talent)/i;
const TEMPO = /(barman|barmaid|bartender|mixolog|serveu|banquet|maître d'hôtel|maitre d'hotel|sommelier|bar\b|salle|réception|evenement|événement)/i;

const id = (u) => createHash("sha1").update(u).digest("hex").slice(0, 12);
const entites = (s) => String(s || "").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const texte = (s) => entites(entites(String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "")).replace(/<[^>]+>/g, " ")).replace(/<[^>]+>/g, " ").replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();

async function obtenir(url, opts = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; sylvainbrochu.ca veille)", Accept: "*/*", ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r;
  } finally { clearTimeout(t); }
}

async function lever(compte, entreprise) {
  const r = await obtenir(`https://api.lever.co/v0/postings/${compte}?mode=json`);
  const l = await r.json();
  return l.filter((p) => /montr|qu[ée]bec|canada|remote|télétravail/i.test(p.categories?.location || "") && CARRIERE.test(p.text) && !EXCLURE.test(p.text))
    .map((p) => ({ titre: p.text, entreprise, lieu: p.categories?.location || "", url: p.hostedUrl, date: new Date(p.createdAt).toISOString(), source: "Lever", profil: "carriere", resume: texte(p.descriptionPlain || "").slice(0, 280) }));
}

async function solotech() {
  const r = await obtenir("https://careers.solotech.com/api/jobs?page=1&limit=100&sortBy=posted_date&descending=true");
  const j = await r.json();
  return (j.jobs || []).map((x) => x.data).filter((d) => /canada|montr|qu[ée]bec/i.test(`${d.country} ${d.city} ${d.full_location}`) && CARRIERE.test(d.title) && !EXCLURE.test(d.title))
    .map((d) => ({ titre: d.title, entreprise: "Solotech", lieu: d.full_location || `${d.city || ""}`, url: `https://careers.solotech.com/canada/jobs/${d.slug}?lang=fr-CA`, date: d.posted_date ? new Date(d.posted_date).toISOString() : "", source: "Solotech", profil: "carriere", resume: texte(d.description).slice(0, 280) }));
}

async function teamtailor(compte, entreprise) {
  const r = await obtenir(`https://${compte}.teamtailor.com/jobs.rss`);
  const x = await r.text();
  return [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const it = m[1]; const g = (t) => texte((it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]);
    return { titre: g("title"), entreprise, lieu: g("tt:location") || "Montréal", url: g("link"), date: g("pubDate") ? new Date(g("pubDate")).toISOString() : "", source: "Teamtailor", profil: "carriere", resume: g("description").slice(0, 280) };
  }).filter((o) => CARRIERE.test(o.titre));
}

async function guichet(q, profil) {
  const u = `https://www.guichetemplois.gc.ca/jobsearch/feed/jobSearchRSSfeed?searchstring=${encodeURIComponent(q)}&locationstring=${encodeURIComponent("Montréal, QC")}&sort=D`;
  const x = await (await obtenir(u)).text();
  return [...x.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
    const e = m[1];
    const titre = texte((e.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]);
    const url = (e.match(/href="([^"]+)"/) || [])[1] || "";
    const s = (e.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1] || "";
    const champ = (n) => texte((s.match(new RegExp(`${n}\\s*:?</strong>\\s*([^<]+)`)) || [])[1]);
    return { titre, entreprise: champ("Employeur"), lieu: champ("Emplacement"), salaire: champ("Salaire"), url, date: texte((e.match(/<updated>([^<]+)<\/updated>/) || [])[1]), source: "Guichet-Emplois", profil, resume: "" };
  }).filter((o) => /\(QC\)/.test(o.lieu));
}

async function hotellerie(q) {
  const x = await (await obtenir(`https://www.hotelleriejobs.com/fr/jobs?search=${encodeURIComponent(q)}`)).text();
  return [...x.matchAll(/<a[^>]+href="(\/fr\/job\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => {
    const parts = m[2].replace(/<[^>]+>/g, "|").split("|").map((s) => texte(s)).filter(Boolean);
    return { titre: parts[1] || parts[0] || "", entreprise: parts[0] || "", contrat: parts[2] || "", lieu: (parts[3] || "").replace(/, Canada$/, ""), url: "https://www.hotelleriejobs.com" + m[1], date: "", source: "Hôtellerie Jobs", profil: "temporaire", resume: "" };
  }).filter((o) => o.titre && /montr|laval|longueuil|brossard|boucherville|qu[ée]bec|saint-jean/i.test(o.lieu));
}

async function jooble(q, profil) {
  const cle = process.env.JOOBLE_KEY; if (!cle) return [];
  const r = await obtenir(`https://jooble.org/api/${cle}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords: q, location: "Montréal, QC" }) });
  const j = await r.json();
  return (j.jobs || []).map((o) => ({ titre: o.title, entreprise: o.company, lieu: o.location, url: o.link, date: o.updated, source: "Jooble (" + (o.source || "") + ")", profil, resume: texte(o.snippet).slice(0, 280) }));
}

async function collecter() {
  const taches = [
    ["Cirque du Soleil", () => lever("cirquedusoleil", "Cirque du Soleil")],
    ["Solotech", solotech],
    ["Humanise / GSM", () => teamtailor("humanisecollective", "Humanise / GSM")],
    ...["chargé de projets événementiel", "directeur de production", "gestionnaire de projets événements", "directeur des opérations", "coordonnateur de production"].map((q) => [`Guichet-Emplois : ${q}`, () => guichet(q, "carriere")]),
    ...["barman", "serveur banquet", "maître d'hôtel"].map((q) => [`Guichet-Emplois : ${q}`, () => guichet(q, "temporaire")]),
    ...["barman", "serveur", "banquet", "maître d'hôtel", "événements"].map((q) => [`Hôtellerie Jobs : ${q}`, () => hotellerie(q)]),
    ...(process.env.JOOBLE_KEY ? [["Jooble carrière", () => jooble("directeur de production OR chargé de projets événementiel", "carriere")], ["Jooble temporaire", () => jooble("barman", "temporaire")]] : []),
  ];
  const res = await Promise.allSettled(taches.map(([, f]) => f()));
  const etat = taches.map(([nom], i) => ({ source: nom, ok: res[i].status === "fulfilled", nombre: res[i].status === "fulfilled" ? res[i].value.length : 0, erreur: res[i].status === "rejected" ? String(res[i].reason?.message || res[i].reason).slice(0, 120) : "" }));
  const vu = new Set(); const offres = [];
  res.forEach((r) => { if (r.status === "fulfilled") r.value.forEach((o) => { if (!o.url || vu.has(o.url)) return; vu.add(o.url); offres.push({ id: id(o.url), ...o }); }); });
  offres.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return { offres, etat, maj: new Date().toISOString() };
}

// ---------- Carte : localisation des offres ----------
// Chaque offre est placée sur l'entreprise (recherche du nom dans OpenStreetMap), sinon sur la ville.
// Les résultats sont gardés dans le hash Redis sb:geo pour ne chercher qu'une fois.
const GEO = "sb:geo";
const sansAccents = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function villeDe(lieu) {
  let v = String(lieu || "").split(/[,|]/)[0].replace(/\(\s*QC\s*\)/i, "").replace(/\b(Canada|QC)\b/gi, "").trim();
  if (!v || /^(télétravail|remote|hybride|plusieurs|divers)/i.test(v)) v = "Montréal";
  if (/^qu[ée]bec$/i.test(v)) v = "Québec";
  return v;
}
function nomsEntreprise(e) {
  const brut = String(e || "").trim();
  if (!brut) return [];
  const dedans = (brut.match(/\(([^)]+)\)/) || [])[1] || "";
  const dehors = brut.replace(/\([^)]*\)/g, " ");
  const net = (x) => x.replace(/\b(inc|ltée|ltee|limitée|ltd|enr|s\.?e\.?n\.?c)\.?/gi, " ").replace(/[?*]/g, " ").replace(/\s+/g, " ").trim();
  return [...new Set([net(dedans), net(dehors)].filter((x) => x.length > 2))];
}
const cleVille = (o) => "v:" + sansAccents(villeDe(o.lieu)).toLowerCase();
const clesEntreprise = (o) => nomsEntreprise(o.entreprise).map((n) => "e:" + sansAccents(`${n}|${villeDe(o.lieu)}`).toLowerCase());

async function nominatim(q) {
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ca&accept-language=fr&q=${encodeURIComponent(q)}`;
  const r = await obtenir(u, { headers: { "User-Agent": "sylvainbrochu.ca admin (massivemedias@gmail.com)", Accept: "application/json" } });
  const j = await r.json();
  return j && j[0] ? { lat: Number(j[0].lat), lon: Number(j[0].lon), nom: j[0].display_name } : null;
}

async function lireGeo() {
  const l = (await cmd("HGETALL", GEO)) || [];
  const m = {};
  for (let i = 0; i < l.length; i += 2) { try { m[l[i]] = JSON.parse(l[i + 1]); } catch { /* ignoré */ } }
  return m;
}

function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function placer(r, geo) {
  let attente = 0;
  const offres = r.offres.map((o) => {
    const ce = clesEntreprise(o);
    const gvTmp = geo[cleVille(o)];
    // Un résultat d'entreprise à plus de 40 km de sa ville est un homonyme : on l'ignore.
    const proche = (g) => !gvTmp || !gvTmp.lat || distanceKm(g, gvTmp) < 40;
    const trouve = ce.map((k) => geo[k]).find((g) => g && g.lat && proche(g));
    const essaye = ce.length === 0 || ce.every((k) => geo[k]);
    const gv = geo[cleVille(o)];
    if (!essaye || !gv) attente++;
    const g = trouve ? { lat: trouve.lat, lon: trouve.lon, precis: "entreprise" } : (gv && gv.lat ? { lat: gv.lat, lon: gv.lon, precis: "ville" } : null);
    return { ...o, geo: g };
  });
  return { ...r, offres, geoAttente: attente };
}

async function localiser(r, geo, budgetMs = 18000) {
  const debut = Date.now();
  const aFaire = [];
  const vu = new Set();
  // Les villes d'abord (tout le monde a au moins un point), puis les entreprises.
  for (const o of r.offres) { const k = cleVille(o); if (!geo[k] && !vu.has(k)) { vu.add(k); aFaire.push([k, `${villeDe(o.lieu)}, Québec`]); } }
  for (const o of r.offres) {
    const noms = nomsEntreprise(o.entreprise);
    noms.forEach((n, i) => { const k = clesEntreprise(o)[i]; if (!geo[k] && !vu.has(k)) { vu.add(k); aFaire.push([k, `${n}, ${villeDe(o.lieu)}`]); } });
  }
  for (const [k, q] of aFaire) {
    if (Date.now() - debut > budgetMs) break;
    let res = null;
    try { res = await nominatim(q); } catch { break; }
    const v = res || { x: 1 };
    geo[k] = v;
    await cmd("HSET", GEO, k, JSON.stringify(v));
    await new Promise((ok) => setTimeout(ok, 1100)); // règle d'usage de Nominatim : 1 requête par seconde
  }
  return geo;
}

async function offresEnCache(rafraichir) {
  if (!rafraichir) {
    const c = await cmd("GET", "sb:cache:offres");
    if (c) return JSON.parse(c);
  }
  const r = await collecter();
  await cmd("SET", "sb:cache:offres", JSON.stringify(r), "EX", 3 * 3600);
  return r;
}

export default async function handler(req, res) {
  try {
    const u = await exiger(req, res); if (!u) return;
    if (req.method !== "GET") return json(res, 405, { erreur: "Méthode non permise" });
    const q = parametres(req);
    const r = await offresEnCache(q.get("rafraichir") === "1");
    let geo = await lireGeo();
    if (q.get("geo") === "1") geo = await localiser(r, geo);
    return json(res, 200, placer(r, geo));
  } catch (e) { return erreur(res, e); }
}
