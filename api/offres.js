// /api/offres : veille d'offres d'emploi, à partir de sources publiques.
// Carrière : Cirque du Soleil (Lever), Solotech, Humanise/GSM (Teamtailor), Guichet-Emplois.
// Temporaire (bar, service) : Hôtellerie Jobs, Guichet-Emplois.
// Aussi : Grenier aux emplois, Cultive, Jobillico, Talent.com, CQT, Eluta,
// et les alertes courriel (Indeed, LinkedIn, Glassdoor, Jobboom) reçues sur info@.
// GET ?rafraichir=1 pour ignorer le cache (3 h).
import { createHash } from "node:crypto";
import { exiger } from "./_lib/auth.js";
import { cmd } from "./_lib/kv.js";
import { alertesEmploi } from "./_lib/mail.js";
import { erreur, json, parametres } from "./_lib/util.js";

const CARRIERE = /(chargé|charg[ée]e|gestionnaire|directeur|directrice|direction|coordonnat|responsable|producteur|productrice|chef de projet|project manager|production manager|operations manager|producer|logisti|opérations|operations|événement|evenement|event|scénograph|exposition|fabrication|atelier)/i;
const EXCLURE = /(communication|médias?\b|medias?\b|philanthrop|journalist|réseaux sociaux|reseaux sociaux|campagne|chargée? de comptes|rédact|redact|édimest|edimest|contenu|publicit|relations publiques|affaires publiques|levée de fonds|financement|collecte de fonds|enseignant|professeur|direct\S*\s+(de\s+)?cr[ée]ation|direct\S*\s+artistique|technicien|technician|journalier|stratège|stratege|graphiste|designer graphique|seo\b|stagiaire|stage |intern\b|comptab|developpeur|développeur|software|ingénieur logiciel|vente au détail|caissier|marketing|ventes|sales|financ|juridique|legal|paie|payroll|data|analyste|cybers|informatique|\bTI\b|\bIT\b|ressources humaines|talent)/i;
const TEMPO = /(barman|barmaid|bartender|mixolog|serveu|banquet|maître d'hôtel|maitre d'hotel|sommelier|bar\b|salle|réception|evenement|événement)/i;

// Restauration rapide et dépanneurs : pas le genre d'emploi temporaire que Sylvain cherche.
const RAPIDE = /(tim\s*hortons?|mc\s*donald|a\s*&\s*w\b|subway|burger\s*king|starbucks|wendy'?s|\bkfc\b|pizza\s*hut|dairy\s*queen|harvey'?s|second\s*cup|dunkin|popeyes|taco\s*bell|mary\s*brown|domino'?s|pizza\s*pizza|thai\s*express|valentine|belle\s*province|lafleur|chez\s*cora|\bcora\b|benny\s*&|mikes?\s*(resto|restaurant)?\b|normandin|restauration\s*rapide|fast[\s-]*food|casse[\s-]*cro[uû]te|couche[\s-]*tard|d[ée]panneur|caf[ée]\s*d[ée]p[ôo]t|tutti\s*frutti|poulet\s*frit|shawarma|pizzeria)/i;
const pasRapide = (o) => !RAPIDE.test(`${o.entreprise || ""} ${o.titre || ""}`);

const id = (u) => createHash("sha1").update(u).digest("hex").slice(0, 12);
const NOMMEES = { eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", agrave: "à", acirc: "â", auml: "ä", ccedil: "ç", icirc: "î", iuml: "ï", ocirc: "ô", ouml: "ö", ugrave: "ù", ucirc: "û", uuml: "ü", Eacute: "É", Egrave: "È", Ecirc: "Ê", Agrave: "À", Acirc: "Â", Ccedil: "Ç", Icirc: "Î", Ocirc: "Ô", Ucirc: "Û", oelig: "œ", OElig: "Œ", laquo: "«", raquo: "»", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', hellip: "...", ndash: "-", mdash: "-", middot: "·", bull: "•", euro: "€", deg: "°", copy: "©", reg: "®", trade: "™", shy: "" };
const entites = (s) => String(s || "").replace(/&([a-zA-Z]+);/g, (t, n) => (n in NOMMEES ? NOMMEES[n] : t)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
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
  }).filter((o) => CARRIERE.test(o.titre) && !EXCLURE.test(o.titre));
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
  }).filter((o) => /\(QC\)/.test(o.lieu) && pertinent(o));
}

async function hotellerie(q) {
  const x = await (await obtenir(`https://www.hotelleriejobs.com/fr/jobs?search=${encodeURIComponent(q)}`)).text();
  return [...x.matchAll(/<a[^>]+href="(\/fr\/job\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => {
    const parts = m[2].replace(/<[^>]+>/g, "|").split("|").map((s) => texte(s)).filter(Boolean);
    return { titre: parts[1] || parts[0] || "", entreprise: parts[0] || "", contrat: parts[2] || "", lieu: (parts[3] || "").replace(/, Canada$/, ""), url: "https://www.hotelleriejobs.com" + m[1], date: "", source: "Hôtellerie Jobs", profil: "temporaire", resume: "" };
  }).filter((o) => o.titre && REGION.test(o.lieu) && TEMPO.test(o.titre) && pertinent(o));
}

async function jooble(q, profil) {
  const cle = process.env.JOOBLE_KEY; if (!cle) return [];
  const r = await obtenir(`https://jooble.org/api/${cle}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords: q, location: "Montréal, QC" }) });
  const j = await r.json();
  return (j.jobs || []).map((o) => ({ titre: o.title, entreprise: o.company, lieu: o.location, url: o.link, date: o.updated, source: "Jooble (" + (o.source || "") + ")", profil, resume: texte(o.snippet).slice(0, 280) }));
}

// Pour les grands sites généralistes : il faut un mot du milieu de Sylvain dans le titre (sinon : construction, TI, finance...).
const DOMAINE = /(événement|evenement|évènement|event|spectacle|scène|scene|production|tournée|tournee|festival|cultur|exposition|musée|musee|scénograph|scenograph|théâtre|theatre|cirque|audiovisuel|immersi|divertissement|entertainment|fabrication|atelier|décor|decor|accessoir|salle|diffusion|arts?\b|créati|creati|attraction)/i;
// Grand Montréal (Sylvain vit à Montréal) : les offres des sites généralistes hors de cette zone sont écartées.
const REGION = /(montr|laval|longueuil|brossard|boucherville|saint-laurent|st-laurent|verdun|lachine|lasalle|anjou|pointe-claire|dorval|terrebonne|repentigny|blainville|boisbriand|mirabel|j[ée]r[ôo]me|th[ée]r[èe]se|ch[âa]teauguay|la prairie|candiac|saint-hubert|saint-lambert|vaudreuil|kirkland|beaconsfield|westmount|outremont|mont-royal|l[ée]onard|pointe-aux-trembles|rivi[èe]re-des-prairies|rosem[èe]re|mascouche|varennes|sainte-julie|chambly|saint-bruno|saint-eustache|deux-montagnes|pierrefonds|c[ôo]te-saint-luc|hampstead|delson|sainte-catherine|l'[îi]le-perrot|montreal)/i;
const INDUSTRIE = /(journalier|op[ée]rateur|usine|manufactur|machin|soudeur|assembleur|entrep[ôo]t|approvisionnement|ing[ée]nierie|construction|dentaire|dental|alimentaire|agricole|plancher|meuble|plastique|m[ée]tal|m[ée]canique|pharma|chimique|imprimerie|emballage)/i;
const pertinent = (o) => (!o.lieu || REGION.test(o.lieu)) && !INDUSTRIE.test(`${o.titre} ${o.entreprise}`) && !EXCLURE.test(o.titre);
const enChamps = (h) => entites(String(h || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "|")).replace(/\s+/g, " ").replace(/\s*\|\s*/g, "|").replace(/\|+/g, "|");
const jsonTexte = (s) => { try { return JSON.parse(`"${s}"`); } catch { return s; } };

// Grenier aux emplois (culture, communications, création) : l'API publique renvoie toutes les offres en cours.
async function grenier() {
  const j = await (await obtenir("https://www.grenier.qc.ca/api/v1/jobs", { headers: { Accept: "application/json" } })).json();
  const l = [...(j.data?.featured || []), ...(j.data?.standard || [])];
  return l.filter((o) => CARRIERE.test(o.title) && !EXCLURE.test(o.title) && DOMAINE.test(`${o.title} ${o.employer?.name || ""}`) && (!o.city || REGION.test(o.city)))
    .map((o) => ({ titre: texte(o.title), entreprise: texte(o.employer?.name || ""), lieu: o.city || "", contrat: o.job_type?.name || "", url: o.url, date: o.publication_date ? new Date(o.publication_date).toISOString() : "", source: "Grenier aux emplois", profil: "carriere", resume: "" }));
}

// Cultive (emplois en culture au Québec)
async function cultive() {
  const h = await (await obtenir("https://www.cultive.ca/fr/emplois")).text();
  const liens = [...new Set([...h.matchAll(/href="(\/fr\/emplois\/[^"]+)"/g)].map((m) => m[1]))];
  const cartes = enChamps(h).split(/Date de publication : /).slice(1).map((c) => {
    const [date, ...reste] = c.split("|"); const f = reste.slice(0, Math.max(0, reste.indexOf("Détails")));
    return { date, titre: f[0] || "", entreprise: f[f.length - 2] || "", lieu: f[f.length - 1] || "" };
  });
  return cartes.map((c, i) => ({ ...c, url: liens[i] ? "https://www.cultive.ca" + liens[i] : "" }))
    .filter((o) => o.url && CARRIERE.test(o.titre) && !EXCLURE.test(o.titre) && (!o.lieu || REGION.test(o.lieu)))
    .map((o) => { const [d, m, a] = o.date.split("-"); return { titre: o.titre, entreprise: o.entreprise, lieu: o.lieu, url: o.url, date: a ? new Date(`${a}-${m}-${d}`).toISOString() : "", source: "Cultive", profil: "carriere", resume: "" }; });
}

// Jobillico (recherche par mots-clés)
async function jobillico(q, profil) {
  const h = await (await obtenir(`https://www.jobillico.com/recherche-emploi?skwd=${encodeURIComponent(q)}&wloc=${encodeURIComponent("Montréal")}`)).text();
  const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).find((d) => d && d["@type"] === "ItemList");
  return (ld?.itemListElement || []).map((it) => {
    const url = String(it.url || "").split("?")[0];
    const chemin = (() => { try { return new URL(url).pathname; } catch { return ""; } })();
    const i = chemin ? h.indexOf(chemin) : -1;
    const f = i >= 0 ? enChamps(h.slice(h.indexOf(">", i) + 1, i + 4000)).split("|").map((x) => x.trim()).filter(Boolean) : [];
    const lieu = (f.find((x) => / - (QC|ON|NB)$/.test(x)) || "").replace(/ - (QC|ON|NB)$/, "");
    return { titre: texte(it.name), entreprise: f[1] || "", lieu, url, date: "", source: "Jobillico", profil, resume: "" };
  });
}

// Talent.com (agrégateur canadien) : les offres sont dans les données de la page, avec leur position.
async function talent(q, profil) {
  const h = (await (await obtenir(`https://ca.talent.com/fr/jobs?k=${encodeURIComponent(q)}&l=${encodeURIComponent("Montréal")}`)).text()).replace(/\\"/g, '"');
  const vu = new Map();
  for (const m of h.matchAll(/"id":"(\d{12,})","source_title":"((?:[^"\\]|\\.)*)"/g)) {
    if (vu.has(m[1])) continue;
    const seg = h.slice(m.index, m.index + 12000);
    const g = (k) => jsonTexte((seg.match(new RegExp(`"${k}":"((?:[^"\\\\]|\\\\.)*)"`)) || [])[1] || "");
    const n = (k) => Number((seg.match(new RegExp(`"${k}":(-?[0-9.]+)`)) || [])[1]);
    const lat = n("enrich_geo_lat"), lon = n("enrich_geo_lon");
    vu.set(m[1], { titre: texte(jsonTexte(m[2])), entreprise: g("enrich_company_name"), lieu: g("source_location").replace(/, ?ca$/i, ""), url: `https://ca.talent.com/fr/view?id=${m[1]}`, date: g("system_date_found"), source: "Talent.com", profil, resume: "", ...(Number.isFinite(lat) && Number.isFinite(lon) && lat ? { pos: { lat, lon } } : {}) });
  }
  return [...vu.values()];
}

// Babillard du Conseil québécois du théâtre (arts de la scène)
async function cqt() {
  const h = await (await obtenir("https://cqt.ca/babillard")).text();
  return [...h.matchAll(/<a href="(\/babillard\/annonce\/\d+)">([\s\S]*?)<\/a>([\s\S]*?)<\/td>/g)].map((m) => {
    const f = enChamps(m[3]).split("|").map((x) => x.trim()).filter(Boolean);
    const limite = (f.find((x) => /^Date limite/i.test(x)) || "").replace(/^Date limite\s*:\s*/i, "");
    const autres = f.filter((x) => !/^Date limite/i.test(x));
    return { titre: texte(m[2]), entreprise: autres[0] || "", lieu: autres[1] || "", url: "https://cqt.ca" + m[1], date: "", source: "CQT (théâtre)", profil: "carriere", resume: limite ? `Date limite : ${limite}` : "" };
  }).filter((o) => CARRIERE.test(o.titre) && !EXCLURE.test(o.titre) && !/(pr[ée]paration [àa]|formation|webinaire|s[ée]ance|atelier de)/i.test(o.titre) && (!o.lieu || REGION.test(o.lieu)));
}

// « il y a 3 jours » / « 14+ days ago » -> date ISO
function dateRelative(s) {
  const m = String(s || "").match(/(\d+)\+?\s*(hour|heure|day|jour|week|semaine|month|mois)/i);
  if (!m) return /today|aujourd/i.test(String(s)) ? new Date().toISOString() : "";
  const u = m[2].toLowerCase();
  const ms = /hour|heure/.test(u) ? 36e5 : /day|jour/.test(u) ? 864e5 : /week|semaine/.test(u) ? 6048e5 : 2592e6;
  return new Date(Date.now() - Number(m[1]) * ms).toISOString();
}

// Eluta.ca lit directement les sites carrières des employeurs canadiens (Groupe CH, Spectra, musées...).
// Le site limite les requêtes : peu de recherches, gardées 12 h.
async function eluta(q) {
  const h = await (await obtenir(`https://www.eluta.ca/search?q=${encodeURIComponent(q)}&l=${encodeURIComponent("Montréal, QC")}`)).text();
  if (/User Verification|are you a human|reCAPTCHA/i.test(h)) throw new Error("Eluta limite les requêtes, nouvel essai plus tard");
  if (!h.includes("organic-job") && !/no jobs|did not match|aucun/i.test(h)) throw new Error("Eluta : page inattendue");
  return h.split('class="organic-job').slice(1).map((b) => {
    const g = (re) => (b.match(re) || [])[1] || "";
    const u = g(/data-url="([^"]+)"/);
    return { titre: entites(g(/class="lk-job-title"[\s\S]*?title="([^"]*)"/)), entreprise: entites(g(/title="See all jobs at ([^"]*)"/)), lieu: entites(g(/class="location">\s*<span>([^<]*)/)), url: u ? "https://www.eluta.ca/" + u : "", date: dateRelative(g(/indexed it">([^<]*)/)), source: "Eluta", profil: "carriere", resume: texte(g(/class="description">([\s\S]*?)<\/span>\s*<!--/)).slice(0, 280) };
  }).filter((o) => o.url && o.titre);
}

// Garde le résultat d'une source dans Redis ; si la source échoue, on reprend la dernière copie.
async function enReserve(cle, heures, f) {
  let copie = null;
  try { copie = JSON.parse((await cmd("GET", `sb:src:${cle}`)) || "null"); } catch { copie = null; }
  if (copie && Date.now() - copie.t < heures * 36e5) return copie.l;
  try {
    const l = await f();
    await cmd("SET", `sb:src:${cle}`, JSON.stringify({ t: Date.now(), l }), "EX", 7 * 86400);
    return l;
  } catch (e) { if (copie) return copie.l; throw e; }
}

// ---------- Alertes courriel (Indeed, LinkedIn, Glassdoor, Jobboom...) ----------
// Ces sites bloquent la lecture automatique : Sylvain s'abonne à leurs alertes avec info@sylvainbrochu.ca,
// et les offres reçues par courriel sont ajoutées ici.
const SITES_ALERTE = [
  [/indeed\./i, "Indeed", (u) => { const m = u.match(/[?&](?:jk|vjk)=([0-9a-f]{8,})/i); return m ? "in:" + m[1] : /indeed\.[a-z.]+\/(rc\/clk|viewjob|pagead|m\/viewjob|applystart)|cts\.indeed\./i.test(u) ? "in:" + u.split("#")[0] : null; }],
  [/linkedin\./i, "LinkedIn", (u) => { const m = u.match(/jobs\/view\/(?:[^/?"]*-)?(\d{6,})/i); return m ? "li:" + m[1] : null; }],
  [/glassdoor\./i, "Glassdoor", (u) => { const m = u.match(/[?&](?:jobListingId|jl)=(\d+)/i); return m ? "gd:" + m[1] : /glassdoor\.[a-z.]+\/(partner\/jobListing|job-listing)/i.test(u) ? "gd:" + u.split("#")[0] : null; }],
  [/jobboom\./i, "Jobboom", (u) => { const m = u.match(/jobboom\.com\/[a-z]{2}\/(?:emploi|job|offre)[^"?]*?(\d{5,})/i); return m ? "jb:" + m[1] : null; }],
  [/jobillico\./i, "Jobillico", (u) => { const m = u.match(/offre-d-emploi\/[^"?]*?\/(\d{4,})/i); return m ? "jo:" + m[1] : null; }],
  [/talent\.com/i, "Talent.com", (u) => { const m = u.match(/talent\.com\/[^"]*?[?&]id=(\d{8,})/i); return m ? "ta:" + m[1] : null; }],
  [/eluta\./i, "Eluta", (u) => { const m = u.match(/eluta\.ca\/spl\/[^"?#]+/i); return m ? "el:" + m[0] : null; }],
  [/jobbank|guichetemplois/i, "Guichet-Emplois", (u) => { const m = u.match(/jobposting\/(\d+)/i); return m ? "ge:" + m[1] : null; }],
  [/workopolis|monster|ziprecruiter|simplyhired|careerjet/i, "Alerte", (u) => /\/(job|jobs|emploi|offre|clk|view)[/?]/i.test(u) ? "x:" + u.split("#")[0] : null],
];
const BRUIT = /(d[ée]sabonn|unsubscribe|confidentialit|privacy|copyright|©|tous droits|all rights|voir (toutes|tous|plus)|see (all|more)|view (all|more)|g[ée]rer|manage|param[èe]tres|settings|t[ée]l[ée]charge|download the app|application mobile|^postuler$|^apply|candidature simplifi|easy apply|^nouveau$|^new$|promu|promoted|actively|recrute activement|^il y a|ago$|^\d+[.,]?\d*\s*★?$|^\$|\$\s*\d|par (heure|an|année)|\/h$|per (hour|year)|^plus$|^more$|^\W+$)/i;
const LIEU = /(,\s*(QC|Qu[ée]bec|ON|Ontario|Canada)\b|\bmontr[ée]al\b|\blaval\b|longueuil|t[ée]l[ée]travail|remote|hybride|hybrid|sur place|on-site)/i;

function cartesAlerte(html, cle) {
  const jet = String(html || "")
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi, (_, a, b) => `\u0001${a ?? b}\u0002`)
    .replace(/<\/a\s*>/gi, "\u0003")
    .replace(/<\/?(br|p|div|td|tr|li|h\d|table|tbody)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const cartes = new Map(); let courante = null; let lien = undefined; let apres = 0;
  for (const m of jet.matchAll(/\u0001([^\u0002]*)\u0002|\u0003|[^\u0001\u0003]+/g)) {
    if (m[1] !== undefined) {
      const href = entites(m[1]); let k = cle(href);
      if (!k) { try { k = cle(decodeURIComponent(decodeURIComponent(href))); } catch { k = null; } }
      lien = k;
      if (k) { if (!cartes.has(k)) cartes.set(k, { url: href, morceaux: [] }); courante = cartes.get(k); apres = 0; }
      continue;
    }
    if (m[0] === "\u0003") { lien = undefined; continue; }
    if (!courante || (lien === null)) continue; // texte d'un lien qui n'est pas une offre
    if (lien === undefined && ++apres > 6) continue; // texte après la carte : seulement les premières lignes
    for (const l of entites(m[0]).split("\n")) {
      for (const champ of l.split(/\s+[·•|]\s+/)) {
        const t = champ.replace(/\s+/g, " ").trim();
        if (t.length >= 2 && t.length <= 140 && !BRUIT.test(t) && !courante.morceaux.includes(t) && courante.morceaux.length < 8) courante.morceaux.push(t);
      }
    }
  }
  return [...cartes.entries()].map(([k, c]) => {
    const f = c.morceaux;
    const lieu = f.find((x) => LIEU.test(x)) || "";
    const reste = f.filter((x) => x !== lieu);
    return { cle: k, url: c.url, titre: reste[0] || "", entreprise: reste[1] || "", lieu };
  }).filter((c) => c.titre.length > 3);
}

async function alertes() {
  const r = await alertesEmploi((msg) => {
    const site = SITES_ALERTE.find(([re]) => re.test(msg.de));
    if (!site) return [];
    return cartesAlerte(msg.html, site[2]).map((c) => ({ ...c, date: msg.date, source: site[1] === "Alerte" ? "Alerte courriel" : `Alerte ${site[1]}` }));
  });
  const vu = new Set();
  return r.offres.filter((o) => !vu.has(o.cle) && vu.add(o.cle)).map((o) => {
    const profil = CARRIERE.test(o.titre) ? "carriere" : TEMPO.test(o.titre) ? "temporaire" : "";
    return { titre: o.titre, entreprise: o.entreprise, lieu: o.lieu, url: o.url, date: o.date, source: o.source, profil, resume: "" };
  }).filter((o) => o.profil && pertinent(o) && (o.profil === "temporaire" || DOMAINE.test(`${o.titre} ${o.entreprise}`)));
}

async function collecter() {
  const taches = [
    ["Cirque du Soleil", () => lever("cirquedusoleil", "Cirque du Soleil")],
    ["Solotech", solotech],
    ["Humanise / GSM", () => teamtailor("humanisecollective", "Humanise / GSM")],
    ...["chargé de projets événementiel", "directeur de production", "gestionnaire de projets événements", "directeur des opérations", "coordonnateur de production"].map((q) => [`Guichet-Emplois : ${q}`, () => guichet(q, "carriere")]),
    ...["barman", "serveur banquet", "maître d'hôtel"].map((q) => [`Guichet-Emplois : ${q}`, () => guichet(q, "temporaire")]),
    ...["barman", "serveur", "banquet", "maître d'hôtel", "événements"].map((q) => [`Hôtellerie Jobs : ${q}`, () => hotellerie(q)]),
    ["Grenier aux emplois", grenier],
    ["Cultive", cultive],
    ...["chargé de projets événementiel", "directeur de production spectacle", "gestionnaire de projets événements", "directeur des opérations festival"].map((q) => [`Jobillico : ${q}`, async () => (await jobillico(q, "carriere")).filter((o) => DOMAINE.test(`${o.titre} ${o.entreprise}`) && pertinent(o))]),
    ...["barman", "serveur banquet"].map((q) => [`Jobillico : ${q}`, async () => (await jobillico(q, "temporaire")).filter(pertinent)]),
    ...["chargé de projets événements", "directeur de production", "gestionnaire de production spectacle", "coordonnateur de production événement"].map((q) => [`Talent.com : ${q}`, async () => (await talent(q, "carriere")).filter((o) => DOMAINE.test(`${o.titre} ${o.entreprise}`) && pertinent(o))]),
    ...["barman", "serveur banquet"].map((q) => [`Talent.com : ${q}`, async () => (await talent(q, "temporaire")).filter(pertinent)]),
    ["CQT (théâtre)", cqt],
    ["Eluta (sites carrières des employeurs)", () => enReserve("eluta2", 12, async () => {
      const l = [];
      for (const q of ["directeur de production", "chargé de projets événements"]) { l.push(...(await eluta(q))); await new Promise((ok) => setTimeout(ok, 1500)); }
      return l;
    }).then((l) => l.filter((o) => CARRIERE.test(o.titre) && DOMAINE.test(`${o.titre} ${o.entreprise}`) && pertinent(o)))],
    ...(process.env.MAIL_APP_PASSWORD ? [["Alertes courriel (Indeed, LinkedIn, Glassdoor, Jobboom)", alertes]] : []),
    ...(process.env.JOOBLE_KEY ? [["Jooble carrière", () => jooble("directeur de production OR chargé de projets événementiel", "carriere")], ["Jooble temporaire", () => jooble("barman", "temporaire")]] : []),
  ];
  const res = await Promise.allSettled(taches.map(([, f]) => f()));
  const etat = taches.map(([nom], i) => ({ source: nom, ok: res[i].status === "fulfilled", nombre: res[i].status === "fulfilled" ? res[i].value.length : 0, erreur: res[i].status === "rejected" ? String(res[i].reason?.message || res[i].reason).slice(0, 120) : "" }));
  const vu = new Set(); const offres = [];
  res.forEach((r) => { if (r.status === "fulfilled") r.value.forEach((o) => { if (!o.url || vu.has(o.url)) return; vu.add(o.url); offres.push({ id: id(o.url), ...o }); }); });
  offres.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  for (let i = offres.length - 1; i >= 0; i--) if (!pasRapide(offres[i])) offres.splice(i, 1);
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
  const offres = r.offres.filter(pasRapide).map((o) => {
    const ce = clesEntreprise(o);
    const gvTmp = geo[cleVille(o)];
    // Un résultat d'entreprise à plus de 40 km de sa ville est un homonyme : on l'ignore.
    const proche = (g) => !gvTmp || !gvTmp.lat || distanceKm(g, gvTmp) < 40;
    const trouve = ce.map((k) => geo[k]).find((g) => g && g.lat && proche(g));
    const essaye = ce.length === 0 || ce.every((k) => geo[k]);
    const gv = geo[cleVille(o)];
    if (!o.pos && (!essaye || !gv)) attente++;
    const g = o.pos ? { lat: o.pos.lat, lon: o.pos.lon, precis: "entreprise" } : trouve ? { lat: trouve.lat, lon: trouve.lon, precis: "entreprise" } : (gv && gv.lat ? { lat: gv.lat, lon: gv.lon, precis: "ville" } : null);
    return { ...o, geo: g };
  });
  return { ...r, offres, geoAttente: attente };
}

async function localiser(r, geo, budgetMs = 18000) {
  const debut = Date.now();
  const aFaire = [];
  const vu = new Set();
  // Les villes d'abord (tout le monde a au moins un point), puis les entreprises.
  r = { ...r, offres: r.offres.filter(pasRapide) };
  for (const o of r.offres) { if (o.pos) continue; const k = cleVille(o); if (!geo[k] && !vu.has(k)) { vu.add(k); aFaire.push([k, `${villeDe(o.lieu)}, Québec`]); } }
  for (const o of r.offres) {
    if (o.pos) continue; // déjà localisée par le site d'emploi
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
