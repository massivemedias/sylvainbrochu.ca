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

export default async function handler(req, res) {
  try {
    const u = await exiger(req, res); if (!u) return;
    if (req.method !== "GET") return json(res, 405, { erreur: "Méthode non permise" });
    if (parametres(req).get("rafraichir") !== "1") {
      const c = await cmd("GET", "sb:cache:offres");
      if (c) return json(res, 200, JSON.parse(c));
    }
    const r = await collecter();
    await cmd("SET", "sb:cache:offres", JSON.stringify(r), "EX", 3 * 3600);
    return json(res, 200, r);
  } catch (e) { return erreur(res, e); }
}
