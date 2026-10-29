// Sources supplémentaires de la veille d'offres (employeurs du milieu, babillards, Québec emploi, LinkedIn), utilisées par api/offres.js.
// Module ESM sans dépendance (Node 22, fetch natif). Chaque fonction renvoie un tableau d'offres :
// { titre, entreprise, lieu, url, date (ISO ou ""), source, profil: "carriere" | "temporaire", resume, salaire }
// Les filtres de pertinence restent dans api/offres.js ; ici on filtre seulement la localisation
// des employeurs ou babillards qui publient hors Québec.

const UA = "Mozilla/5.0 (compatible; sylvainbrochu.ca veille)";

async function obtenir(url, opts = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "*/*", ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r;
  } finally { clearTimeout(t); }
}
const html = async (url, opts) => (await obtenir(url, opts)).text();
const json = async (url, opts) => (await obtenir(url, { ...opts, headers: { Accept: "application/json", ...(opts?.headers || {}) } })).json();
const postJson = (url, body) => json(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const NOMMEES = { eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", agrave: "à", acirc: "â", ccedil: "ç", icirc: "î", iuml: "ï", ocirc: "ô", ugrave: "ù", ucirc: "û", uuml: "ü", Eacute: "É", Egrave: "È", Ecirc: "Ê", Agrave: "À", Ccedil: "Ç", oelig: "œ", laquo: "«", raquo: "»", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', hellip: "...", ndash: "-", mdash: "-", middot: "·", nbsp: " ", amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", shy: "" };
const entites = (s) => String(s || "")
  .replace(/&([a-zA-Z]+);/g, (t, n) => (n in NOMMEES ? NOMMEES[n] : t))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
const texte = (s) => entites(String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
  .replace(/<[^>]+>/g, " ").replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
const court = (s, n = 280) => texte(s).slice(0, n);
const iso = (d) => { const t = d ? new Date(d) : null; return t && !Number.isNaN(t.getTime()) ? t.toISOString() : ""; };
const MOIS = { janvier: 0, fevrier: 1, février: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, aout: 7, août: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11, décembre: 11 };
// « 22 octobre 2026 » -> ISO
function dateFr(s) {
  const m = String(s || "").toLowerCase().match(/(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})/);
  if (!m || !(m[2] in MOIS)) return "";
  return new Date(Date.UTC(Number(m[3]), MOIS[m[2]], Number(m[1]), 12)).toISOString();
}
// Page reçue mais sans la section attendue (refonte, page d'erreur) : on lève une erreur plutôt que de renvoyer 0 offre en silence.
const exige = (h, re, nom) => { if (!re.test(h)) throw new Error(`${nom} : page inattendue (section des offres introuvable)`); return h; };
const abs = (base, u) => { try { return new URL(entites(u), base).href; } catch { return ""; } };

// Emplois de service (bar, banquet, accueil) : profil « temporaire ». Le reste : « carriere ».
const TEMPO = /(barman|barmaid|bartender|mixolog|serveu|busser|d[ée]barrass|banquet|ma[iî]tre d'h[ôo]tel|sommelier|h[ôo]te(sse)?\b|h[ôo]te\(sse\)|accueil|vestiaire|consigne|vendeu[rs]e? de foule|placier|plac[iè]re|caissier|bar\b|cuisine|plongeu)/i;
const profilDe = (titre) => (TEMPO.test(titre) ? "temporaire" : "carriere");
const QUEBEC = /(montr|laval|longueuil|qu[ée]bec|\bQC\b|saint-jean-sur-richelieu|brossard|boucherville|terrebonne|repentigny|blainville|mirabel|ch[âa]teauguay|vaudreuil|saint-laurent|verdun|lachine|anjou|pointe-claire|dorval)/i;
const offre = (o) => ({ titre: "", entreprise: "", lieu: "", url: "", date: "", source: "", profil: "carriere", resume: "", salaire: "", ...o, titre: texte(o.titre), entreprise: texte(o.entreprise), lieu: texte(o.lieu) });

// ---------------------------------------------------------------------------
// Employeurs (pages carrières / ATS)
// ---------------------------------------------------------------------------

// Moment Factory : Digital Recruiters (jobs.momentfactory.com), API publique du site carrières.
export async function momentFactory() {
  const j = await postJson("https://api.digitalrecruiters.com/public/v1/careers-site/job-ads?domainName=jobs.momentfactory.com&limit=100&page=1&locale=fr_CA", { filters: {} });
  return (j.items || []).map((x) => offre({
    titre: x.title, entreprise: "Moment Factory", lieu: x.location || "Montréal",
    url: `https://jobs.momentfactory.com/fr_CA/annonce/${x.url}`, source: "Moment Factory", profil: profilDe(x.title), resume: x.contract || "",
  }));
}

// SAT (Société des arts technologiques) : page Carrières (Nuxt, rendue côté serveur).
export async function sat() {
  const h = exige(await html("https://sat.qc.ca/fr/carrieres/"), /Offres d.emploi|\/fr\/emploi\//i, "SAT");
  const vu = new Map();
  for (const m of h.matchAll(/<a\b[^>]*href="(\/fr\/emploi\/[^"#]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const titre = texte(m[2]).replace(/\s*Postuler\s*$/i, "");
    if (titre && !vu.has(m[1])) vu.set(m[1], offre({ titre, entreprise: "Société des arts technologiques (SAT)", lieu: "Montréal", url: abs("https://sat.qc.ca", m[1]), source: "SAT", profil: profilDe(titre) }));
  }
  return [...vu.values()];
}

// Place des Arts : Workland (atlas.workland.com/careers/place-des-arts). Compte Workland 322451.
export async function placeDesArts() {
  const l = await postJson("https://jobs-prod.workland.com/api/v1/job/published-external", { account_ids: [322451], load_with: ["locations", "groups"] });
  return (Array.isArray(l) ? l : l.data || []).map((x) => {
    const tr = x.translations?.fr || x.translations?.en || {};
    const titre = tr.title || x.title || "";
    return offre({
      titre, entreprise: "Place des Arts", lieu: x.locations?.[0]?.city || "Montréal",
      url: `https://atlas.workland.com/work/${x.id}/${x.url}`, date: iso(String(x.published_externally_at || x.created_at || "").replace(" ", "T") + "Z"),
      source: "Place des Arts (Workland)", profil: profilDe(titre), resume: court(tr.summary || tr.description || ""),
    });
  });
}

// Groupe Juste pour rire : page Carrière (cartes avec fiches PDF).
export async function justePourRire() {
  const h = exige(await html("https://www.hahaha.com/fr/public/carriere-1093/"), /cms-card-wrapper/, "Juste pour rire");
  const vu = new Map();
  for (const carte of h.split("cms-card-wrapper ban_css-cms-card-wrapper").slice(1)) {
    const pdf = (carte.match(/href="(https:\/\/justepourrire\.com\/jobs\/[^"?]+\.pdf)/) || [])[1];
    const titre = texte((carte.match(/class="cms-card-title[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1]);
    if (pdf && titre && !vu.has(pdf)) vu.set(pdf, offre({ titre, entreprise: "Groupe Juste pour rire", lieu: "Montréal", url: pdf, source: "Juste pour rire", profil: profilDe(titre) }));
  }
  return [...vu.values()];
}

// ADP Workforce Now : API publique du centre de carrière (identifiant cid propre à chaque employeur).
export async function adp(cid, entreprise, source) {
  const j = await json(`https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions?cid=${cid}&ccId=19000101_000001&lang=fr_CA&locale=fr_CA&$top=100`);
  return (j.jobRequisitions || []).map((r) => {
    const p = r.payGradeRange; const min = p?.minimumRate?.amountValue; const max = p?.maximumRate?.amountValue;
    return offre({
      titre: r.requisitionTitle, entreprise,
      lieu: (r.requisitionLocations?.[0]?.nameCode?.shortName || r.requisitionLocations?.[0]?.address?.cityName || "Montréal").trim().replace(/, CA$/, ""),
      url: `https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=${cid}&ccId=19000101_000001&lang=fr_CA&jobId=${r.itemID}`,
      date: iso(r.postDate), source, profil: profilDe(r.requisitionTitle || ""),
      salaire: max ? `${min ? min + " - " : "jusqu'à "}${max} ${p.maximumRate.currencyCode || ""}`.trim() : "",
    });
  });
}
// Société du Vieux-Port de Montréal (comprend le Centre des sciences).
export const vieuxPort = () => adp("8d16626f-48ae-43f6-b57e-79339726ccf4", "Société du Vieux-Port de Montréal / Centre des sciences", "Vieux-Port (ADP)");
// PixMob (effets lumineux pour spectacles et événements).
export const pixmob = () => adp("21428ad8-683f-4975-9163-2fe758b52992", "PixMob", "PixMob (ADP)");

// Encore (technologie événementielle, ex-PSAV) : site carrières Radancy, page « Montréal ».
export async function encore() {
  const h = await html("https://jobs.encoreglobal.com/fr/location/montreal-quebec-canada-jobs/6228/6251999-6115047-6077243/4");
  if (!/search-results/.test(h)) throw new Error("Encore : page inattendue");
  const vu = new Map();
  for (const m of h.matchAll(/<a href="(\/[a-z]{2}\/(?:job|emploi)\/[^"]+)" data-job-id="(\d+)">([\s\S]*?)<\/a>/g)) {
    const b = m[3]; const titre = texte((b.match(/<h2>([\s\S]*?)<\/h2>/) || [])[1]);
    const d = (b.match(/job-date-posted">(\d{1,2})\/(\d{1,2})\/(\d{4})</) || []);
    if (titre && !vu.has(m[2])) vu.set(m[2], offre({ titre, entreprise: "Encore (technologie événementielle)", lieu: texte((b.match(/job-location">([\s\S]*?)<\/span>/) || [])[1]).replace(/^[^:]*:\s*/, "") || "Montréal",
      url: abs("https://jobs.encoreglobal.com", m[1]), date: d[3] ? iso(`${d[3]}-${d[1].padStart(2, "0")}-${d[2].padStart(2, "0")}T12:00:00Z`) : "", source: "Encore", profil: profilDe(titre) }));
  }
  return [...vu.values()];
}

// Pointe-à-Callière : page Emplois et stages (titres + fiches PDF).
export async function pointeACalliere() {
  const h = exige(await html("https://pacmusee.qc.ca/fr/emplois-et-stages/"), /Postes offerts|emplois-et-stages/i, "Pointe-à-Callière");
  const vu = new Map();
  for (const m of h.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>\s*<ul[^>]*>[\s\S]*?href="([^"]+\.pdf)[^"]*"/g)) {
    const titre = texte(m[1]); const url = abs("https://pacmusee.qc.ca", m[2]);
    if (titre && !vu.has(url)) vu.set(url, offre({ titre, entreprise: "Pointe-à-Callière", lieu: "Montréal", url, source: "Pointe-à-Callière", profil: profilDe(titre) }));
  }
  return [...vu.values()];
}

// Musée des beaux-arts de Montréal : page Carrières.
export async function mbam() {
  const h = exige(await html("https://www.mbam.qc.ca/fr/carrieres/"), /postes-disponibles/, "MBAM");
  const vu = new Map();
  for (const m of h.matchAll(/<a\b[^>]*href="(\/fr\/carrieres\/[a-z0-9-]+\/)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const titre = texte(m[2]).replace(/\s*En savoir plus\s*$/i, "");
    if (titre && !vu.has(m[1])) vu.set(m[1], offre({ titre, entreprise: "Musée des beaux-arts de Montréal", lieu: "Montréal", url: abs("https://www.mbam.qc.ca", m[1]), source: "MBAM", profil: profilDe(titre) }));
  }
  return [...vu.values()];
}

// Centre Phi : page Carrières.
export async function centrePhi() {
  const h = exige(await html("https://phi.ca/fr/carrieres/"), /Offres d.emploi/i, "Centre Phi");
  const vu = new Map();
  for (const m of h.matchAll(/<a\b[^>]*href="(https:\/\/phi\.ca\/fr\/carrieres\/[^"#]+\/)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const titre = texte(m[2]);
    // Champs de la carte (service, type de poste, adresse, date) juste avant le lien.
    const avant = h.slice(Math.max(0, h.lastIndexOf("<li", m.index)), m.index);
    const champs = [...avant.matchAll(/>([^<>]{2,120})</g)].map((x) => texte(x[1])).filter(Boolean);
    const adresse = champs.find((c) => /\d+ ?(rue|boul|av)/i.test(c)) || "";
    if (titre && !vu.has(m[1])) vu.set(m[1], offre({ titre, entreprise: champs[0] && !/temps|contrat/i.test(champs[0]) ? `Centre Phi - ${champs[0]}` : "Centre Phi",
      lieu: adresse ? `Montréal (${adresse})` : "Montréal", url: m[1], source: "Centre Phi", profil: profilDe(titre), resume: champs.filter((c) => /temps|contrat|stage|pigiste/i.test(c)).join(", ") }));
  }
  return [...vu.values()];
}

// Grand Prix du Canada (Octane) : page Carrières (cartes + fiche PDF).
export async function grandPrix() {
  const h = exige(await html("https://gpcanada.ca/carrieres/"), /positions__|Nos postes/i, "Grand Prix du Canada");
  return h.split('class="positions__position ').slice(1).map((c) => {
    const titre = texte((c.match(/positions__position-title">([\s\S]*?)<\/h4>/) || [])[1]);
    const url = (c.match(/positions__position-pdf[^"]*" href="([^"]+)"/) || c.match(/href="([^"]+\.pdf)"/) || [])[1] || "";
    return offre({ titre, entreprise: "Grand Prix du Canada (Groupe de course Octane)", lieu: "Montréal", url, source: "Grand Prix du Canada", profil: profilDe(titre),
      resume: [texte((c.match(/positions__position-type[^"]*">([\s\S]*?)<\/div>/) || [])[1]), court((c.match(/positions__position-description">([\s\S]*?)<\/p>/) || [])[1], 240)].filter(Boolean).join(" - ") });
  }).filter((o) => o.titre && o.url);
}

// Float4 : page Carrières (Next.js rendu serveur ; l'accueil du site renvoie parfois 500).
export async function float4() {
  const h = exige(await html("https://www.float4.com/fr/carrieres/"), /Opportunit/i, "Float4");
  return [...h.matchAll(/<li id="([a-z0-9-]+)"[^>]*>([\s\S]*?)(?=<li id="|<\/ul><\/div><\/div>)/g)].map((m) => {
    const b = m[2];
    const titre = texte((b.match(/<p class="text-xl[^"]*">([\s\S]*?)<\/p>/) || [])[1]);
    return offre({ titre, entreprise: "Float4", lieu: texte((b.match(/<ul class="text-gray[^"]*"><li>([\s\S]*?)<\/li>/) || [])[1]) || "Montréal",
      url: `https://www.float4.com/fr/carrieres/#${m[1]}`, date: dateFr(texte((b.match(/<p class="text-xs text-gray[^"]*">([\s\S]*?)<\/p>/) || [])[1])),
      source: "Float4", profil: profilDe(titre), resume: court((b.match(/<div class="lg:col-span-2 text-sm">([\s\S]*?)<\/div>/) || [])[1], 240) });
  }).filter((o) => o.titre);
}

// Folks RH / Glow in the cloud (jobs.glowinthecloud.com) : babillards publics de plusieurs employeurs.
export async function glow(compte, entreprise, { profil = "", ville = "Montréal" } = {}) {
  const h = exige(await html(`https://jobs.glowinthecloud.com/${compte}?l=fr`), /jobSearch-result|jobs-listing|job-title/, `Folks ${compte}`);
  return h.split('<span class="job-title').slice(1).map((b) => {
    const m = b.match(/<a href="([^"]+)" title="([^"]*)"/);
    if (!m) return null;
    const champ = (t) => texte((b.match(new RegExp(`title="${t}"><i[^>]*><\\/i>([\\s\\S]*?)<\\/li>`)) || [])[1]);
    const titre = entites(m[2]); const adresse = champ("Adresse");
    return offre({ titre, entreprise, lieu: adresse ? (QUEBEC.test(adresse) ? adresse : `${ville} (${adresse})`) : ville, url: abs("https://jobs.glowinthecloud.com", m[1]),
      date: dateFr((b.match(/Publi[ée] le <span>([^<]*)<\/span>/) || [])[1]), source: `${entreprise} (Folks)`,
      profil: profil || profilDe(titre), resume: champ("Types d'emploi"), salaire: champ("Salaire").replace(/\s*text_\S*$/, "") });
  }).filter(Boolean);
}
export const palaisDesCongres = () => glow("palais-des-congres-de-montreal", "Palais des congrès de Montréal");
export const multicoloreCarriere = () => glow("multicolorecarriere", "Multicolore (Piknic Électronik, Igloofest)", { profil: "carriere" });
export const multicoloreEvenement = () => glow("multicolore-evenement", "Multicolore (Piknic Électronik, Igloofest)", { profil: "temporaire" });
export const stageline = () => glow("stageline", "Stageline (scènes mobiles)", { ville: "Varennes" });
export const osm = () => glow("orchestre-symphonique-de-montreal", "Orchestre symphonique de Montréal");

// SmartRecruiters (API publique des offres) avec filtre de région.
async function smartrecruiters(compte, params = "") {
  const out = []; let offset = 0;
  for (let page = 0; page < 5; page++) {
    const j = await json(`https://api.smartrecruiters.com/v1/companies/${compte}/postings?limit=100&offset=${offset}${params}`);
    out.push(...(j.content || []));
    offset += 100; if (!j.content?.length || offset >= (j.totalFound || 0)) break;
  }
  return out;
}
const lieuSR = (p) => [p.location?.city, p.location?.region].filter(Boolean).join(", ");

// MUTEK : SmartRecruiters (compte « mutek »).
export async function mutek() {
  return (await smartrecruiters("mutek")).filter((p) => !p.location?.country || /ca/i.test(p.location.country)).map((p) => offre({
    titre: p.name, entreprise: "MUTEK", lieu: lieuSR(p) || "Montréal", url: `https://jobs.smartrecruiters.com/mutek/${p.id}`,
    date: iso(p.releasedDate), source: "MUTEK (SmartRecruiters)", profil: profilDe(p.name), resume: p.typeOfEmployment?.label || "",
  }));
}

// Accor (Fairmont Le Reine Elizabeth, Sofitel, Novotel...) : SmartRecruiters « AccorHotel », Québec puis filtre grand Montréal.
// Banquets, bar, service : surtout pour le volet temporaire.
export async function accor() {
  return (await smartrecruiters("AccorHotel", "&country=ca&region=Quebec")).filter((p) => /montr|laval|longueuil|dorval/i.test(p.location?.city || "")).map((p) => {
    const marque = p.customField?.find?.((f) => /brand|marque/i.test(f.fieldLabel || ""))?.valueLabel;
    return offre({
      titre: String(p.name || "").replace(/\s*\(H\/F\/D\)\s*$/i, ""), entreprise: `Accor${marque && !/accor/i.test(marque) ? " - " + marque : ""}`,
      lieu: lieuSR(p), url: `https://jobs.smartrecruiters.com/AccorHotel/${p.id}`, date: iso(p.releasedDate),
      source: "Accor (SmartRecruiters)", profil: profilDe(p.name || ""), resume: p.typeOfEmployment?.label || "",
    });
  });
}

// Cirque Éloize : API WordPress publique, type de contenu « poste » (hors candidature spontanée).
export async function cirqueEloize() {
  const l = await json("https://cirque-eloize.com/wp-json/wp/v2/poste?per_page=50&_fields=id,date,link,title");
  return l.filter((p) => !/spontan/i.test(p.title?.rendered || "")).map((p) => offre({
    titre: p.title?.rendered, entreprise: "Cirque Éloize", lieu: "Montréal", url: p.link, date: iso(p.date), source: "Cirque Éloize", profil: profilDe(texte(p.title?.rendered)),
  }));
}

// Les 7 Doigts : section « Faites partie de l'équipe » de la page Les 7 Doigts (hors candidature spontanée et casting).
export async function septDoigts() {
  const h = await html("https://7doigts.com/les7doigts");
  const i = h.indexOf('id="jobs"'); if (i < 0) throw new Error("7 Doigts : section emplois introuvable");
  const bloc = h.slice(i, h.indexOf('id="section-5"', i) > 0 ? h.indexOf('id="section-5"', i) : i + 20000);
  return [...bloc.matchAll(/data-nid="(\d+)"[\s\S]*?field-name-title-field[\s\S]*?<div class="field-item even ">([\s\S]*?)<\/div>([\s\S]*?)(?=data-nid="|$)/g)]
    .map((m) => ({ nid: m[1], titre: texte(m[2]), corps: m[3] }))
    .filter((x) => x.titre && !/spontan|casting/i.test(x.titre))
    .map((x) => offre({ titre: x.titre, entreprise: "Les 7 Doigts", lieu: "Montréal", url: abs("https://7doigts.com", (x.corps.match(/href="([^"]+)"/) || [])[1] || `/les7doigts#jobs-${x.nid}`),
      source: "Les 7 Doigts", profil: profilDe(x.titre), resume: court(x.corps, 200) }));
}

// ---------------------------------------------------------------------------
// Babillards du milieu et sites généralistes
// ---------------------------------------------------------------------------

// Société des musées du Québec : Emplois et stages (toutes pages ; Québec et Ottawa).
export async function museesQuebec() {
  const base = "https://www.musees.qc.ca/developpement-professionnel/emplois-stages/";
  const p1 = exige(await html(base), /job-tile|offres?/i, "SMQ");
  const pages = Math.min(6, Math.max(1, ...[...p1.matchAll(/emplois-stages\/(\d+)\//g)].map((m) => Number(m[1]))));
  const reste = await Promise.all(Array.from({ length: pages - 1 }, (_, k) => html(`${base}${k + 2}/`).catch(() => "")));
  const vu = new Map();
  for (const h of [p1, ...reste]) {
    for (const m of h.matchAll(/<a href="([^"]+)"[^>]*class="job-tile[^"]*"[^>]*>([\s\S]*?)<\/a><\/li>/g)) {
      const b = m[2];
      const titre = texte((b.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1]);
      const type = texte((b.match(/uppercase">([\s\S]*?)<\/span>/) || [])[1]);
      const limite = texte((b.match(/Date limite:\s*([^<]*)</) || [])[1]);
      const url = abs(base, m[1]);
      if (!titre || vu.has(url) || /stage/i.test(type)) continue;
      vu.set(url, offre({ titre, entreprise: (b.match(/<p class="body-2 -semibold">([\s\S]*?)<\/p>/) || [])[1], lieu: (b.match(/<p class="body-2">([\s\S]*?)<\/p>/) || [])[1],
        url, source: "Société des musées du Québec", profil: profilDe(titre), resume: limite ? `Date limite : ${limite}` : "" }));
    }
  }
  return [...vu.values()];
}

// CITT/ICTS CareerHub (production de spectacles, tout le Canada) : tableau HTML, filtré au Québec.
export async function citt() {
  const h = exige(await html("https://www.citt.org/cgi/page.cgi/job_board.html"), /dataTable_1/, "CITT");
  return [...h.matchAll(/<tr>\s*<td>\s*<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/td>([\s\S]*?)<\/tr>/g)].map((m) => {
    const td = [...m[3].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((x) => texte(x[1]));
    const [entreprise, contrat, categorie, lieu, limite] = td;
    return offre({ titre: m[2], entreprise, lieu, url: m[1], source: "CITT/ICTS", profil: profilDe(texte(m[2])),
      resume: [contrat, categorie, limite ? `Date limite : ${limite}` : ""].filter(Boolean).join(" - ") });
  }).filter((o) => QUEBEC.test(o.lieu) && !/professional development|apprentice/i.test(o.resume));
}

// CharityVillage (OBNL) : offres de la région de Montréal, données __NEXT_DATA__ de la page. Offres de bénévolat écartées.
export async function charityVillage() {
  const lire = async (p) => {
    const h = await html(`https://www.charityvillage.com/jobs/montreal${p > 1 ? `?page=${p}` : ""}`);
    const m = h.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    return m ? JSON.parse(m[1]).props?.pageProps?.data?.jobs : null;
  };
  const p1 = await lire(1); if (!p1) throw new Error("CharityVillage : données absentes");
  const n = Math.min(6, Math.ceil((p1.result_count || 0) / Math.max(1, p1.pages?.length || 10)));
  const autres = await Promise.all(Array.from({ length: Math.max(0, n - 1) }, (_, k) => lire(k + 2).catch(() => null)));
  const l = [p1, ...autres].flatMap((j) => j?.pages || []);
  const vu = new Set();
  return l.filter((x) => x && !vu.has(x.id) && vu.add(x.id))
    .filter((x) => !/volunteer|volontariat|b[ée]n[ée]vol/i.test(x.title || ""))
    .map((x) => {
      const s = x.salaryRangeFree || {};
      const adr = x.address || [];
      return offre({ titre: x.title, entreprise: x.organization, lieu: (adr.find((a) => /montr|laval|longueuil/i.test(a)) || adr[0] || "").replace(/, Canada$/, ""),
        url: x.absoluteUrl || `https://www.charityvillage.com${x.urlNoPrefix || x.url?.path || ""}`, date: iso(x.published), source: "CharityVillage",
        profil: profilDe(x.title || ""), salaire: s.minSalary || s.maxSalary ? `${s.minSalary || ""}${s.maxSalary ? " - " + s.maxSalary : ""} ${s.currencyCode || ""} ${s.salaryUnit || ""}`.trim() : "" });
    });
}

// Québec emploi (plateforme du gouvernement du Québec) : recherche publique, régions Montréal (06), Laval (13), Montérégie (16).
export async function quebecEmploi(q, profil = "carriere") {
  const corps = { sort: { type: "AUTO" }, langue: "fr", page: 1, filter: { inputSearch: q, address: "", localisation: { longitude: "", latitude: "", distance: 20 }, adminRegion: ["06", "13", "16"], offerType: [], commitment: [], jobDuration: [], levelEducation: [], studyDiscipline: [], mrc: [], bsq: [], scian: [], postedSince: "", excludeAgencies: false, isUkrainian: false, isExperimente: false, isSubsidized: false, isTrainingProgram: false } };
  const j = await postJson("https://www.quebecemploi.gouv.qc.ca/search/postingFilteredAI", corps);
  // La recherche est « sémantique » et renvoie aussi des postes sans rapport (ex. « barman » -> gardiennage) :
  // on garde les titres qui contiennent la racine d'au moins un mot de la requête (deux pour le volet carrière).
  const plat = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const racines = plat(q).split(/[^a-z]+/).filter((m) => m.length >= 4).map((m) => (m.length <= 7 ? m.replace(/s$/, "") : m.slice(0, 6)));
  const requis = profil === "temporaire" ? 1 : Math.min(2, racines.length);
  return (j.items || []).filter((x) => racines.filter((r) => plat(x.titre).includes(r)).length >= requis).map((x) => offre({
    titre: x.titre, entreprise: x.employeur, lieu: x.nom_ville || "", url: `https://www.quebecemploi.gouv.qc.ca/plateforme-emploi/poste/${x.ide_affch}`,
    source: "Québec emploi", profil, resume: x.expiration_date ? `Date limite : ${x.expiration_date}` : "",
  }));
}

// LinkedIn : point d'accès public « jobs-guest » (non officiel ; peut répondre 429 si trop sollicité). Montréal = geoId 101330853, 30 derniers jours.
export async function linkedin(q, profil = "carriere") {
  const h = await html(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(q)}&location=${encodeURIComponent("Montreal, Quebec, Canada")}&geoId=101330853&f_TPR=r2592000&start=0`);
  return h.split("<li>").slice(1).map((b) => {
    const g = (re) => (b.match(re) || [])[1] || "";
    const url = entites(g(/class="base-card__full-link[^"]*"[^>]*href="([^"?]+)/) || g(/href="(https:\/\/[a-z]+\.linkedin\.com\/jobs\/view\/[^"?]+)/));
    return offre({ titre: g(/base-search-card__title">([\s\S]*?)<\/h3>/), entreprise: g(/base-search-card__subtitle">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/) || g(/base-search-card__subtitle">([\s\S]*?)<\/h4>/),
      lieu: g(/job-search-card__location">([\s\S]*?)<\/span>/), url, date: iso(g(/datetime="([^"]+)"/)), source: "LinkedIn", profil,
      salaire: texte(g(/job-search-card__salary-info">([\s\S]*?)<\/span>/)) });
  }).filter((o) => o.titre && o.url);
}

// ---------------------------------------------------------------------------

const CARRIERE_Q = ["directeur de production", "chargé de projets événementiel", "gestionnaire de projets événements", "coordonnateur de production"];
const TEMPO_Q = ["barman", "serveur", "banquet", "maître d'hôtel"];

export const SOURCES = [
  ["Moment Factory (Digital Recruiters)", momentFactory],
  ["SAT", sat],
  ["Place des Arts (Workland)", placeDesArts],
  ["Juste pour rire", justePourRire],
  ["Vieux-Port / Centre des sciences (ADP)", vieuxPort],
  ["PixMob (ADP)", pixmob],
  ["Encore Montréal (Radancy)", encore],
  ["Pointe-à-Callière", pointeACalliere],
  ["MBAM", mbam],
  ["Centre Phi", centrePhi],
  ["Grand Prix du Canada", grandPrix],
  ["Float4", float4],
  ["Palais des congrès (Folks)", palaisDesCongres],
  ["Multicolore carrière (Folks)", multicoloreCarriere],
  ["Multicolore événements (Folks)", multicoloreEvenement],
  ["Stageline (Folks)", stageline],
  ["OSM (Folks)", osm],
  ["MUTEK (SmartRecruiters)", mutek],
  ["Accor Montréal (SmartRecruiters)", accor],
  ["Cirque Éloize (WordPress)", cirqueEloize],
  ["Les 7 Doigts", septDoigts],
  ["Société des musées du Québec", museesQuebec],
  ["CITT/ICTS (Québec)", citt],
  ["CharityVillage (Montréal)", charityVillage],
  ...CARRIERE_Q.map((q) => [`Québec emploi : ${q}`, () => quebecEmploi(q, "carriere")]),
  ...TEMPO_Q.map((q) => [`Québec emploi : ${q}`, () => quebecEmploi(q, "temporaire")]),
  ...["directeur de production", "chargé de projets événements", "gestionnaire de production"].map((q) => [`LinkedIn : ${q}`, () => linkedin(q, "carriere")]),
  ...["barman", "banquet"].map((q) => [`LinkedIn : ${q}`, () => linkedin(q, "temporaire")]),
];
