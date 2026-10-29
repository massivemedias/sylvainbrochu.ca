// Admin de sylvainbrochu.ca : recherche d'emploi de Sylvain Brochu.
import { genererPDF } from "./cvpdf.js";

// ---------- Outils ----------
const E = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const jour = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(d);
const ajouterJours = (iso, n) => { const d = new Date(iso.slice(0, 10) + "T12:00:00"); d.setDate(d.getDate() + n); return jour(d); };
const ecart = (a, b) => Math.round((new Date(b.slice(0, 10) + "T12:00:00") - new Date(a.slice(0, 10) + "T12:00:00")) / 86400e3);
function dateCourte(iso) { if (!iso) return ""; const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso); return `${d.getDate()} ${MOIS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : ""}`; }
function dateHeure(iso) {
  if (!iso) return ""; const d = new Date(iso); const auj = jour() === jour(d);
  return auj ? d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }) : dateCourte(iso);
}
function ilYa(t) { const s = Math.round((Date.now() - t) / 1000); if (s < 60) return "à l'instant"; if (s < 3600) return `il y a ${Math.round(s / 60)} min`; if (s < 86400) return `il y a ${Math.round(s / 3600)} h`; return dateCourte(new Date(t).toISOString()); }
const uid = () => Math.random().toString(36).slice(2, 10);
const domaine = (courriel) => (String(courriel || "").split("@")[1] || "").toLowerCase();

const STATUTS = [["a_preparer", "À préparer"], ["brouillon", "Brouillon prêt"], ["envoye", "Envoyé"], ["relance", "Relancé"], ["entrevue", "Entrevue"], ["offre", "Offre reçue"], ["refus", "Refus"], ["ferme", "Fermé"]];
const NOM_STATUT = Object.fromEntries(STATUTS);
const ACTIFS = ["envoye", "relance", "entrevue", "offre"];

const etat = {
  u: null, clientId: "", d: null, page: "tableau",
  stats: null, statsJours: 30, statsT: 0, offres: null, mail: null,
  boite: { dossier: "recus", listes: {}, ouvert: null, q: "" },
  cvOnglet: "carriere", filtre: "actifs", rech: "", profilOffres: "tous", rechOffres: "", journal: null,
};

// ---------- API ----------
async function api(url, opts = {}) {
  const init = { credentials: "same-origin", method: opts.method || "GET", headers: {} };
  if (opts.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
  const r = await fetch(url, init);
  if (r.status === 401) { etat.u = null; afficherConnexion(); throw new Error("Session expirée, reconnecte-toi."); }
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.message || j.erreur || r.statusText); e.code = j.erreur; throw e; }
  return j;
}
const minuteurs = {};
function sauver(cle, delai = 0) {
  clearTimeout(minuteurs[cle]);
  const go = async () => { try { await api(`/api/donnees/?cle=${cle}`, { method: "PUT", body: etat.d[cle] }); } catch (e) { toast("Pas enregistré : " + e.message, true); } };
  if (delai) minuteurs[cle] = setTimeout(go, delai); else return go();
}
function toast(msg, erreur = false) {
  const t = document.createElement("div"); t.className = "toast" + (erreur ? " erreur" : ""); t.textContent = msg;
  $("#toasts").appendChild(t); setTimeout(() => t.remove(), erreur ? 6000 : 3200);
}

// ---------- Icônes ----------
const I = {
  tableau: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  candidatures: '<path d="M4 7h16v12H4zM9 7V5h6v2M4 12h16"/>',
  courriels: '<path d="M3 5h18v14H3z"/><path d="m3 6 9 7 9-7"/>',
  offres: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  cv: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  modeles: '<path d="M4 4h16v6H4zM4 14h7v6H4zM15 14h5v6h-5z"/>',
  reglages: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
};
const ico = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ""}</svg>`;
const PAGES = [["tableau", "Tableau de bord"], ["candidatures", "Candidatures"], ["courriels", "Courriels"], ["offres", "Offres d'emploi"], ["cv", "CV"], ["stats", "Statistiques"], ["modeles", "Modèles"], ["reglages", "Réglages"]];

// ---------- Calculs sur les candidatures ----------
const R = () => Number(etat.d?.reglages?.relanceJours) || 7;
function relance(c) {
  if (!["envoye", "relance"].includes(c.statut) || c.reponseLe) return null;
  const base = c.relanceFaiteLe || c.envoyeLe; if (!base) return null;
  const due = ajouterJours(base, R());
  return { due, enRetard: due <= jour(), jours: ecart(jour(), due) };
}
function aFaire() {
  const out = []; const auj = jour();
  (etat.d.candidatures || []).forEach((c) => {
    const r = relance(c);
    if (r && r.enRetard) out.push({ type: "relance", c, tri: r.due, texte: `Relancer ${c.entreprise}`, detail: `Envoyé le ${dateCourte(c.envoyeLe)}, sans réponse` });
    if (c.reponseLe && !c.reponseTraitee && ACTIFS.includes(c.statut)) out.push({ type: "reponse", c, tri: c.reponseLe, texte: `Réponse de ${c.entreprise}`, detail: `Reçue le ${dateCourte(c.reponseLe)}` });
    if (c.statut === "a_preparer" && c.echeance && ecart(auj, c.echeance) <= 21 && c.echeance >= auj) out.push({ type: "echeance", c, tri: c.echeance, texte: `Postuler chez ${c.entreprise}`, detail: `Date limite le ${dateCourte(c.echeance)}` });
    if (c.entrevueLe && c.entrevueLe.slice(0, 10) >= auj) out.push({ type: "entrevue", c, tri: c.entrevueLe, texte: `Entrevue : ${c.entreprise}`, detail: `Le ${dateCourte(c.entrevueLe)}${c.entrevueLe.length > 10 ? " à " + c.entrevueLe.slice(11, 16) : ""}` });
  });
  const brouillons = (etat.d.candidatures || []).filter((c) => c.statut === "brouillon");
  if (brouillons.length) out.push({ type: "brouillon", c: brouillons[0], tri: "9", texte: `${brouillons.length} candidature${brouillons.length > 1 ? "s" : ""} prête${brouillons.length > 1 ? "s" : ""} à envoyer`, detail: brouillons.slice(0, 4).map((c) => c.entreprise.split(" (")[0]).join(", ") + (brouillons.length > 4 ? "..." : "") + " : brouillons dans Gmail" });
  const ordre = { entrevue: 0, reponse: 1, relance: 2, echeance: 3, brouillon: 4 };
  return out.sort((a, b) => ordre[a.type] - ordre[b.type] || String(a.tri).localeCompare(String(b.tri)));
}
function noter(c, texte) { (c.historique = c.historique || []).unshift({ date: jour(), texte }); }
const candParCourriel = (adresse) => { const a = String(adresse || "").toLowerCase(); const d = domaine(a); return (etat.d.candidatures || []).find((c) => c.courriel && (c.courriel.toLowerCase() === a || (d && !/gmail|hotmail|outlook|yahoo|videotron|icloud/.test(d) && domaine(c.courriel) === d))); };

// ---------- Démarrage ----------
async function demarrer() {
  try {
    const s = await api("/api/auth/");
    etat.clientId = s.clientId;
    if (!s.stockage) return afficherConnexion("Le stockage n'est pas encore branché. L'admin sera prête dès que Redis sera ajouté au projet Vercel.");
    if (!s.connecte) return afficherConnexion();
    etat.u = s.utilisateur;
    const r = await api("/api/donnees/?cle=tout");
    etat.d = r.donnees;
    rendreCoque();
    window.addEventListener("hashchange", allerA);
    // Quand on revient sur l'onglet, on recharge les données pour ne jamais travailler sur une copie périmée.
    let dernierRafraichissement = Date.now();
    const rafraichir = async () => {
      if (document.hidden || !$("#modale").hidden || Date.now() - dernierRafraichissement < 15000) return;
      const enCours = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (enCours) return;
      dernierRafraichissement = Date.now();
      try { const n = await api("/api/donnees/?cle=tout"); etat.d = n.donnees; if (["tableau", "candidatures"].includes(etat.page)) rendrePage(); } catch { /* hors ligne */ }
    };
    document.addEventListener("visibilitychange", rafraichir);
    window.addEventListener("focus", rafraichir);
    setInterval(rafraichir, 60000);
    allerA();
    const etatBoite = () => api("/api/courriels/?action=etat").then((m) => (m.pret ? m : new Promise((ok) => setTimeout(ok, 1500)).then(() => api("/api/courriels/?action=etat"))));
    etatBoite().then((m) => {
      etat.mail = m;
      if (m.import && m.import.crees.length) toast(`${m.import.crees.length} brouillon${m.import.crees.length > 1 ? "s" : ""} de candidature recréé${m.import.crees.length > 1 ? "s" : ""} dans ${m.boite}.`);
      if (["courriels", "tableau"].includes(etat.page)) rendrePage();
    }).catch(() => { etat.mail = { pret: false, raison: "Erreur" }; });
  } catch (e) {
    $("#app").innerHTML = `<div class="connexion"><div class="boite"><div class="sb">SB</div><h1>Admin</h1><p class="alerte">${E(e.message)}</p></div></div>`;
  }
}

function afficherConnexion(message = "") {
  const pasConfig = !etat.clientId || etat.clientId.startsWith("__");
  $("#app").innerHTML = `<div class="connexion"><div class="boite">
    <div class="sb">SB</div>
    <h1>Admin<br>Sylvain Brochu</h1>
    <p>Recherche d'emploi : candidatures, courriels de info@sylvainbrochu.ca, offres, CV et statistiques du site.</p>
    ${message ? `<p class="alerte">${E(message)}</p>` : ""}
    ${pasConfig ? `<p class="alerte">La connexion Google n'est pas encore configurée.</p>` : `<div id="g-btn"></div>`}
    <p class="note">Accès réservé à Sylvain et à Mika.</p>
    <p class="alerte" id="refus" hidden></p>
  </div></div>`;
  if (pasConfig) return;
  const go = () => {
    if (!window.google?.accounts?.id) return setTimeout(go, 200);
    google.accounts.id.initialize({ client_id: etat.clientId, callback: connecter, ux_mode: "popup", auto_select: false });
    google.accounts.id.renderButton($("#g-btn"), { theme: "filled_black", size: "large", text: "signin_with", shape: "rectangular", locale: "fr-CA", width: 300 });
  };
  go();
}

async function connecter(rep) {
  try {
    const r = await fetch("/api/auth/", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: rep.credential }) });
    const j = await r.json();
    if (r.status === 403) { const el = $("#refus"); el.hidden = false; el.textContent = `L'adresse ${j.email} n'a pas accès à cette admin.`; return; }
    if (!r.ok) throw new Error(j.message || j.erreur || "Connexion impossible");
    location.reload();
  } catch (e) { const el = $("#refus"); if (el) { el.hidden = false; el.textContent = e.message; } }
}

async function deconnecter() {
  await fetch("/api/auth/", { method: "DELETE", credentials: "same-origin" });
  try { google.accounts.id.disableAutoSelect(); } catch { /* */ }
  location.reload();
}

// ---------- Coque ----------
function rendreCoque() {
  const u = etat.u;
  $("#app").innerHTML = `<div class="coque">
    <aside class="cote">
      <a class="marque" href="#tableau"><span class="sb">SB</span><span><b>Admin</b><small>Recherche d'emploi</small></span></a>
      <nav class="onglets" aria-label="Sections">${PAGES.map(([id, nom]) => `<a href="#${id}" data-p="${id}">${ico(id)}<span>${nom}</span><i class="compte" data-c="${id}" hidden></i></a>`).join("")}</nav>
      <div class="qui">${u.photo ? `<img src="${E(u.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${E((u.nom || u.email)[0])}</span>`}<span title="${E(u.email)}">${E(u.nom || u.email)}</span><button type="button" id="deco">Sortir</button></div>
    </aside>
    <main class="principal" id="page"></main>
  </div>`;
  $("#deco").onclick = deconnecter;
}
function majCompteurs() {
  const n = aFaire().filter((x) => ["relance", "reponse", "echeance", "entrevue"].includes(x.type)).length;
  const el = $('[data-c="tableau"]'); if (el) { el.hidden = !n; el.textContent = n; }
  const nl = (etat.boite.listes.recus || []).filter((m) => !m.lu).length;
  const em = $('[data-c="courriels"]'); if (em) { em.hidden = !nl; em.textContent = nl; }
}
function allerA() {
  const p = (location.hash || "#tableau").slice(1).split("/")[0];
  etat.page = PAGES.some(([id]) => id === p) ? p : "tableau";
  $$(".onglets a").forEach((a) => a.setAttribute("aria-current", a.dataset.p === etat.page ? "page" : "false"));
  rendrePage();
  window.scrollTo(0, 0);
}
function rendrePage() {
  const f = { tableau: pTableau, candidatures: pCandidatures, courriels: pCourriels, offres: pOffres, cv: pCV, stats: pStats, modeles: pModeles, reglages: pReglages }[etat.page];
  f();
  majCompteurs();
}
const entete = (titre, sous, actions = "") => `<div class="entete"><div><h1>${titre}</h1>${sous ? `<p>${sous}</p>` : ""}</div><div class="actions">${actions}</div></div>`;

// ---------- Données distantes ----------
async function chargerStats(jours = etat.statsJours, force = false) {
  if (!force && etat.stats && etat.stats.jours === jours && Date.now() - etat.statsT < 60e3) return etat.stats;
  etat.stats = await api(`/api/stats/?jours=${jours}`); etat.statsT = Date.now(); etat.statsJours = jours;
  return etat.stats;
}
async function chargerBoite(dossier, force = false) {
  if (!force && etat.boite.listes[dossier] && !etat.boite.q) return etat.boite.listes[dossier];
  const r = await api(`/api/courriels/?action=liste&dossier=${dossier}&q=${encodeURIComponent(etat.boite.q)}`);
  etat.boite.listes[dossier] = r.messages; majCompteurs();
  return r.messages;
}
async function chargerOffres(force = false) {
  if (!force && etat.offres) return etat.offres;
  etat.offres = await api(`/api/offres/${force ? "?rafraichir=1" : ""}`);
  return etat.offres;
}

// ---------- Graphique ----------
function graphique(serie) {
  const w = 700, h = 200, g = 28, n = serie.length || 1;
  const max = Math.max(4, ...serie.map((x) => x.vues));
  const bw = (w - g) / n;
  const y = (v) => h - 22 - (v / max) * (h - 40);
  const barres = serie.map((x, i) => `<rect x="${g + i * bw + bw * .15}" y="${y(x.vues)}" width="${bw * .7}" height="${h - 22 - y(x.vues)}" rx="2" fill="#c8a26b"><title>${dateCourte(x.date)} : ${x.vues} vues, ${x.visiteurs} visiteurs</title></rect>`).join("");
  const pts = serie.map((x, i) => `${g + i * bw + bw / 2},${y(x.visiteurs)}`).join(" ");
  const etiq = serie.map((x, i) => (i % Math.ceil(n / 7) === 0 ? `<text x="${g + i * bw + bw / 2}" y="${h - 6}" font-size="11" text-anchor="middle" fill="#6b635b">${dateCourte(x.date)}</text>` : "")).join("");
  const lignes = [0, .5, 1].map((t) => `<line x1="${g}" x2="${w}" y1="${y(max * t)}" y2="${y(max * t)}" stroke="rgba(23,21,26,.08)"/><text x="0" y="${y(max * t) + 4}" font-size="11" fill="#9a9187">${Math.round(max * t)}</text>`).join("");
  return `<svg class="graph" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Pages vues et visiteurs par jour">${lignes}${barres}<polyline points="${pts}" fill="none" stroke="#17151a" stroke-width="2"/>${etiq}</svg>
  <p class="aide"><span style="display:inline-block;width:10px;height:10px;background:#c8a26b;border-radius:2px"></span> Pages vues &nbsp; <span style="display:inline-block;width:14px;height:2px;background:#17151a;vertical-align:3px"></span> Visiteurs</p>`;
}
const barres = (liste, vide = "Aucune donnée pour cette période.") => {
  if (!liste || !liste.length) return `<p class="vide">${vide}</p>`;
  const max = liste[0][1] || 1;
  return `<div class="barres">${liste.slice(0, 10).map(([k, v]) => `<div><span title="${E(k)}">${E(k)}</span><b>${v}</b><i><b style="width:${(v / max) * 100}%"></b></i></div>`).join("")}</div>`;
};

// ======================================================================
// TABLEAU DE BORD
// ======================================================================
function pTableau() {
  const c = etat.d.candidatures || [];
  const envoyees = c.filter((x) => x.envoyeLe).length;
  const reponses = c.filter((x) => x.reponseLe).length;
  const relances = c.filter((x) => relance(x)?.enRetard).length;
  const taches = aFaire();
  $("#page").innerHTML = entete(`Bonjour ${E((etat.u.nom || "").split(" ")[0])}`, `Ce qui compte aujourd'hui, ${new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" })}.`,
    `<a class="btn" href="/" target="_blank" rel="noopener">Voir le site</a><button class="btn laiton" data-act="nouveau-courriel">Nouveau courriel</button>`) + `
  <div class="kpis">
    <div class="kpi direct"><b><span class="point"></span><span id="k-live">-</span></b><span>En ligne sur le site</span></div>
    <div class="kpi"><b id="k-vis">-</b><span>Visiteurs, 30 jours</span></div>
    <div class="kpi"><b id="k-cv">-</b><span>CV téléchargés, 30 jours</span></div>
    <div class="kpi"><b>${envoyees}</b><span>Candidatures envoyées</span></div>
    <div class="kpi"><b>${reponses}</b><span>Réponses reçues</span></div>
    <div class="kpi ${relances ? "alerte" : ""}"><b>${relances}</b><span>Relances à faire</span></div>
  </div>
  <div class="grille g2">
    <section class="carte"><header><h2>À faire</h2><a class="btn petit" href="#candidatures">Candidatures</a></header>
      ${taches.length ? `<ul class="liste">${taches.slice(0, 9).map((t) => `<li><div class="t"><b>${E(t.texte)}</b><small>${E(t.detail)}</small></div><div class="actions">${boutonTache(t)}</div></li>`).join("")}</ul>` : `<p class="vide">Rien d'urgent. Les relances apparaissent ici ${R()} jours après un envoi sans réponse.</p>`}
    </section>
    <section class="carte"><header><h2>Derniers courriels reçus</h2><a class="btn petit" href="#courriels">Boîte info@</a></header><div id="d-mails"><p class="vide">Chargement...</p></div></section>
    <section class="carte"><header><h2>Visites du site</h2><a class="btn petit" href="#stats">Détails</a></header><div id="d-graph"><p class="vide">Chargement...</p></div></section>
    <section class="carte"><header><h2>Nouvelles offres</h2><a class="btn petit" href="#offres">Toutes les offres</a></header><div id="d-offres"><p class="vide">Chargement...</p></div></section>
    <section class="carte" style="grid-column:1/-1"><header><h2>Notes</h2><span class="aide">Enregistrées automatiquement, visibles par Sylvain et Mika.</span></header>
      <textarea class="notes-libres" id="notes" placeholder="Contacts à appeler, idées, suivis...">${E(typeof etat.d.notes === "string" ? etat.d.notes : "")}</textarea></section>
  </div>`;
  $("#notes").oninput = (e) => { etat.d.notes = e.target.value; sauver("notes", 900); };
  chargerStats(30).then((s) => {
    if (etat.page !== "tableau") return;
    $("#k-live").textContent = s.enLigne.length; $("#k-vis").textContent = s.totaux.visiteurs; $("#k-cv").textContent = s.totaux.cv;
    $("#d-graph").innerHTML = graphique(s.serie.slice(-14));
  }).catch((e) => { const el = $("#d-graph"); if (el) el.innerHTML = `<p class="vide">${E(e.message)}</p>`; });
  const dm = $("#d-mails");
  if (etat.mail && !etat.mail.pret) dm.innerHTML = blocConfigCourriel(true);
  else chargerBoite("recus").then((l) => {
    if (etat.page !== "tableau") return;
    $("#d-mails").innerHTML = l.length ? `<ul class="liste">${l.slice(0, 6).map((m) => `<li><div class="t"><b>${m.lu ? "" : "● "}${E(m.de[0]?.nom || m.de[0]?.courriel || "")}</b><small>${E(m.sujet)}</small></div><div class="actions"><span class="aide">${dateHeure(m.date)}</span><a class="btn petit" href="#courriels" data-ouvrir="recus:${m.uid}">Lire</a></div></li>`).join("")}</ul>` : `<p class="vide">Aucun courriel reçu pour l'instant.</p>`;
  }).catch((e) => { const el = $("#d-mails"); if (el) el.innerHTML = e.code === "COURRIEL_ABSENT" ? blocConfigCourriel(true) : `<p class="vide">${E(e.message)}</p>`; });
  chargerOffres().then((o) => {
    if (etat.page !== "tableau") return;
    const masq = new Set(etat.d["offres-masquees"] || []);
    const l = o.offres.filter((x) => !masq.has(x.id)).slice(0, 6);
    $("#d-offres").innerHTML = l.length ? `<ul class="liste">${l.map((x) => `<li><div class="t"><b>${E(x.titre)}</b><small>${E(x.entreprise)}${x.lieu ? " | " + E(x.lieu) : ""} | ${x.profil === "temporaire" ? "Temporaire" : "Carrière"}</small></div><a class="btn petit" href="${E(x.url)}" target="_blank" rel="noopener">Voir</a></li>`).join("")}</ul>` : `<p class="vide">Aucune offre pour l'instant.</p>`;
  }).catch((e) => { const el = $("#d-offres"); if (el) el.innerHTML = `<p class="vide">${E(e.message)}</p>`; });
}
function boutonTache(t) {
  if (t.type === "relance") return `<button class="btn petit laiton" data-act="relancer" data-id="${t.c.id}">Préparer la relance</button>`;
  if (t.type === "brouillon") return `<a class="btn petit" href="#courriels" data-dossier="brouillons">Brouillons</a>`;
  if (t.type === "echeance") return `<button class="btn petit" data-act="preparer" data-id="${t.c.id}">Préparer</button>`;
  if (t.type === "reponse") return `<button class="btn petit" data-act="fiche" data-id="${t.c.id}">Ouvrir</button>`;
  return `<button class="btn petit" data-act="fiche" data-id="${t.c.id}">Ouvrir</button>`;
}

// ======================================================================
// CANDIDATURES
// ======================================================================
function pCandidatures() {
  const toutes = etat.d.candidatures || [];
  const compte = (f) => toutes.filter(f).length;
  const FILTRES = [["actifs", "En cours", (c) => !["refus", "ferme"].includes(c.statut)], ["relances", "Relances à faire", (c) => relance(c)?.enRetard], ...STATUTS.map(([k, n]) => [k, n, (c) => c.statut === k]), ["temporaire", "Temporaire", (c) => c.type === "temporaire"], ["tout", "Tout", () => true]];
  const f = FILTRES.find((x) => x[0] === etat.filtre) || FILTRES[0];
  const q = etat.rech.toLowerCase();
  const liste = toutes.filter(f[2]).filter((c) => !q || `${c.entreprise} ${c.poste} ${c.ville} ${c.courriel}`.toLowerCase().includes(q))
    .sort((a, b) => (relance(b)?.enRetard ? 1 : 0) - (relance(a)?.enRetard ? 1 : 0) || (a.priorite || 3) - (b.priorite || 3) || String(b.envoyeLe || "").localeCompare(String(a.envoyeLe || "")));
  $("#page").innerHTML = entete("Candidatures", `Suivi des envois depuis info@sylvainbrochu.ca. Une relance est proposée ${R()} jours après un envoi sans réponse.`,
    `<button class="btn" data-act="synchro">Synchroniser avec Gmail</button><button class="btn laiton" data-act="nouvelle">Nouvelle candidature</button>`) + `
  <div class="filtres">${FILTRES.map(([k, n, fn]) => `<button type="button" data-filtre="${k}" aria-pressed="${k === etat.filtre}">${n} <b>${compte(fn)}</b></button>`).join("")}</div>
  <div class="barre-outils"><input class="recherche" type="search" id="rech" placeholder="Chercher une entreprise, un poste..." value="${E(etat.rech)}"><span class="aide">${liste.length} candidature${liste.length > 1 ? "s" : ""}</span></div>
  <div class="tableau-wrap"><table class="tab"><thead><tr><th>Entreprise et poste</th><th>Statut</th><th>CV</th><th>Envoyé</th><th>Relance</th><th>Réponse</th><th></th></tr></thead><tbody>
  ${liste.map((c) => { const r = relance(c); return `<tr>
    <td class="ent"><b>${E(c.entreprise)}</b><small>${E(c.poste)}${c.ville ? " | " + E(c.ville) : ""}${c.echeance ? ` | <span class="${ecart(jour(), c.echeance) <= 7 ? "ko-txt" : ""}">limite ${dateCourte(c.echeance)}</span>` : ""}</small></td>
    <td><select data-statut="${c.id}" aria-label="Statut">${STATUTS.map(([k, n]) => `<option value="${k}" ${k === c.statut ? "selected" : ""}>${n}</option>`).join("")}</select></td>
    <td><span class="pastille">${c.cv === "barman" ? "Barman" : "Carrière"}</span></td>
    <td>${c.envoyeLe ? dateCourte(c.envoyeLe) : '<span class="aide">-</span>'}</td>
    <td>${r ? (r.enRetard ? `<span class="pastille p-urgent">À faire</span>` : `<span class="aide">${dateCourte(r.due)}</span>`) : '<span class="aide">-</span>'}</td>
    <td>${c.reponseLe ? `<span class="pastille p-reponse">${dateCourte(c.reponseLe)}</span>` : '<span class="aide">-</span>'}</td>
    <td><div class="actions" style="flex-wrap:nowrap">
      ${r && r.enRetard ? `<button class="btn petit laiton" data-act="relancer" data-id="${c.id}">Relancer</button>` : ""}
      ${["a_preparer"].includes(c.statut) && (c.courriel || c.formulaire) ? `<button class="btn petit" data-act="preparer" data-id="${c.id}">${c.courriel ? "Préparer" : "Postuler"}</button>` : ""}
      <button class="btn petit" data-act="fiche" data-id="${c.id}">Ouvrir</button></div></td></tr>`; }).join("") || `<tr><td colspan="7" class="vide" style="text-align:center;padding:30px">Aucune candidature dans ce filtre.</td></tr>`}
  </tbody></table></div>`;
  $("#rech").oninput = (e) => { etat.rech = e.target.value; const pos = e.target.selectionStart; pCandidatures(); const r = $("#rech"); r.focus(); r.setSelectionRange(pos, pos); };
}
function changerStatut(c, s) {
  if (c.statut === s) return;
  noter(c, `Statut : ${NOM_STATUT[c.statut] || c.statut} vers ${NOM_STATUT[s]}`);
  c.statut = s;
  if (s === "envoye" && !c.envoyeLe) c.envoyeLe = jour();
  if (s === "relance") c.relanceFaiteLe = jour();
  sauver("candidatures");
}

function ficheCandidature(c, nouvelle = false) {
  const v = (k) => E(c[k] || "");
  ouvrirModale(nouvelle ? "Nouvelle candidature" : E(c.entreprise), `
    <div class="grille-form">
      <label class="champ"><span>Entreprise</span><input name="entreprise" value="${v("entreprise")}" required></label>
      <label class="champ"><span>Poste</span><input name="poste" value="${v("poste")}"></label>
      <label class="champ"><span>Ville</span><input name="ville" value="${v("ville")}"></label>
      <label class="champ"><span>Type</span><select name="type">${[["offre", "Offre publiée"], ["spontanee", "Candidature spontanée"], ["temporaire", "Emploi temporaire"]].map(([k, n]) => `<option value="${k}" ${c.type === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="champ"><span>Statut</span><select name="statut">${STATUTS.map(([k, n]) => `<option value="${k}" ${c.statut === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="champ"><span>CV à joindre</span><select name="cv"><option value="carriere" ${c.cv !== "barman" ? "selected" : ""}>CV carrière</option><option value="barman" ${c.cv === "barman" ? "selected" : ""}>CV barman</option></select></label>
      <label class="champ"><span>Courriel du recruteur</span><input name="courriel" type="email" value="${v("courriel")}"></label>
      <label class="champ"><span>Nom du contact</span><input name="contact" value="${v("contact")}" placeholder="Pour personnaliser le « Bonjour »"></label>
      <label class="champ"><span>Priorité</span><select name="priorite">${[1, 2, 3].map((p) => `<option value="${p}" ${Number(c.priorite) === p ? "selected" : ""}>${p}</option>`).join("")}</select></label>
      <label class="champ"><span>Date limite</span><input name="echeance" type="date" value="${v("echeance")}"></label>
      <label class="champ"><span>Envoyée le</span><input name="envoyeLe" type="date" value="${E((c.envoyeLe || "").slice(0, 10))}"></label>
      <label class="champ"><span>Réponse reçue le</span><input name="reponseLe" type="date" value="${E((c.reponseLe || "").slice(0, 10))}"></label>
      <label class="champ"><span>Entrevue</span><input name="entrevueLe" type="datetime-local" value="${E((c.entrevueLe || "").slice(0, 16))}"></label>
      <label class="champ"><span>Salaire</span><input name="salaire" value="${v("salaire")}"></label>
      <label class="champ large"><span>Lien de l'offre</span><input name="lien" type="url" value="${v("lien")}"></label>
      <label class="champ large"><span>Formulaire en ligne (si pas de courriel)</span><input name="formulaire" type="url" value="${v("formulaire")}"></label>
      <label class="champ large"><span>Objet du courriel</span><input name="objet" value="${v("objet")}"></label>
      <label class="champ large"><span>Texte de candidature</span><textarea name="texte" rows="8">${v("texte")}</textarea></label>
      <label class="champ large"><span>Notes</span><textarea name="note" rows="3">${v("note")}</textarea></label>
    </div>
    ${c.historique?.length ? `<div><span class="etiquette">Historique</span><ul class="historique">${c.historique.slice(0, 12).map((h) => `<li><time>${dateCourte(h.date)}</time><span>${E(h.texte)}</span></li>`).join("")}</ul></div>` : ""}`,
  `<div class="actions">${!nouvelle ? `<button class="btn danger" data-m="supprimer">Supprimer</button>` : ""}${c.lien ? `<a class="btn" href="${E(c.lien)}" target="_blank" rel="noopener">Voir l'offre</a>` : ""}</div>
   <div class="actions">${!nouvelle && c.courriel ? `<button class="btn" data-m="courriel">Préparer le courriel</button>` : ""}<button class="btn plein" data-m="enregistrer">Enregistrer</button></div>`,
  (racine) => {
    const lire = () => { $$("[name]", racine).forEach((el) => { c[el.name] = el.name === "priorite" ? Number(el.value) : el.value.trim(); }); };
    $('[data-m="enregistrer"]', racine).onclick = () => {
      const ancien = (etat.d.candidatures.find((x) => x.id === c.id) || {}).statut;
      lire(); if (!c.entreprise) return toast("Indique au moins l'entreprise.", true);
      if (nouvelle) { c.id = c.id || uid(); noter(c, "Fiche créée"); etat.d.candidatures.unshift(c); }
      else if (ancien && ancien !== c.statut) noter(c, `Statut : ${NOM_STATUT[ancien]} vers ${NOM_STATUT[c.statut]}`);
      if (c.statut === "envoye" && !c.envoyeLe) c.envoyeLe = jour();
      sauver("candidatures"); fermerModale(); rendrePage(); toast("Candidature enregistrée.");
    };
    const sup = $('[data-m="supprimer"]', racine);
    if (sup) sup.onclick = () => {
      if (sup.dataset.ok !== "1") { sup.dataset.ok = "1"; sup.textContent = "Confirmer la suppression"; return; }
      etat.d.candidatures = etat.d.candidatures.filter((x) => x.id !== c.id); sauver("candidatures"); fermerModale(); rendrePage(); toast("Candidature supprimée.");
    };
    const co = $('[data-m="courriel"]', racine);
    if (co) co.onclick = () => { lire(); sauver("candidatures"); fermerModale(); preparerCandidature(c); };
  });
}

const remplir = (t, c = {}) => String(t || "")
  .replaceAll("{entreprise}", c.entreprise || "votre entreprise").replaceAll("{poste}", c.poste || "votre poste")
  .replaceAll("{contact}", c.contact ? " " + c.contact : "").replaceAll("{envoyeLe}", c.envoyeLe ? dateCourte(c.envoyeLe) : "récemment")
  .replaceAll("{signature}", etat.d.reglages.signature || "");

function preparerCandidature(c) {
  if (!c.courriel && c.formulaire) { window.open(c.formulaire, "_blank", "noopener"); return toast("Formulaire ouvert. Change le statut quand c'est envoyé."); }
  const mod = (etat.d.modeles || []).find((m) => m.id === (c.type === "temporaire" ? "temporaire" : c.type === "spontanee" ? "spontanee" : "offre"));
  const sig = etat.d.reglages.signature || "";
  const texte = c.texte ? (sig && !c.texte.includes(sig.split("\n")[0] + "\n") ? `${c.texte.trimEnd()}\n\n${sig}` : c.texte) : remplir(mod?.corps, c);
  ouvrirComposeur({ a: c.courriel, sujet: c.objet || remplir(mod?.objet, c), texte, piece: c.cv || "carriere", candidatureId: c.id });
}
function preparerRelance(c) {
  const mod = (etat.d.modeles || []).find((m) => m.id === "relance");
  const d = c.dernierEnvoi || {};
  ouvrirComposeur({ a: c.courriel, sujet: d.sujet ? (/^re\s*:/i.test(d.sujet) ? d.sujet : "Re: " + d.sujet) : remplir(mod?.objet, c), texte: remplir(mod?.corps, c), piece: "", enReponseA: d.idMessage || "", candidatureId: c.id, relance: true });
}

async function synchroniser() {
  const cands = (etat.d.candidatures || []).filter((c) => c.courriel);
  if (!cands.length) return toast("Aucune candidature avec une adresse courriel.");
  toast("Synchronisation avec Gmail...");
  try {
    const { resultats } = await api("/api/courriels/?action=synchroniser", { method: "POST", body: { adresses: cands.map((c) => c.courriel) } });
    let n = 0;
    cands.forEach((c) => {
      const r = resultats[c.courriel.toLowerCase()]; if (!r) return;
      const avant = JSON.stringify([c.statut, c.envoyeLe, c.reponseLe, c.relanceFaiteLe]);
      if (r.envois.length) {
        const premier = r.envois[0], dernier = r.envois[r.envois.length - 1];
        if (!c.envoyeLe) c.envoyeLe = premier.date.slice(0, 10);
        c.dernierEnvoi = { idMessage: dernier.idMessage, sujet: dernier.sujet, date: dernier.date };
        if (["a_preparer", "brouillon"].includes(c.statut)) { noter(c, `Envoi détecté dans Gmail (${dateCourte(premier.date)})`); c.statut = "envoye"; }
        if (r.envois.length > 1 && c.statut === "envoye") { c.statut = "relance"; c.relanceFaiteLe = dernier.date.slice(0, 10); noter(c, `Relance détectée (${dateCourte(dernier.date)})`); }
        const rep = r.reponses.filter((x) => x.date > premier.date);
        if (rep.length) { const der = rep[rep.length - 1].date.slice(0, 10); if (c.reponseLe !== der) { c.reponseLe = der; c.reponseTraitee = false; noter(c, `Réponse reçue (${dateCourte(der)})`); } }
      } else if (r.brouillons && c.statut === "a_preparer") { c.statut = "brouillon"; noter(c, "Brouillon détecté dans Gmail"); }
      if (avant !== JSON.stringify([c.statut, c.envoyeLe, c.reponseLe, c.relanceFaiteLe])) n++;
    });
    await sauver("candidatures"); rendrePage();
    toast(n ? `${n} candidature${n > 1 ? "s" : ""} mise${n > 1 ? "s" : ""} à jour.` : "Tout est déjà à jour.");
  } catch (e) { toast(e.code === "COURRIEL_ABSENT" ? "La connexion Gmail n'est pas encore configurée (voir Réglages)." : e.message, true); }
}

// ======================================================================
// COMPOSEUR
// ======================================================================
function ouvrirComposeur(o = {}) {
  const reg = etat.d.reglages;
  const mods = etat.d.modeles || [];
  const c = o.candidatureId ? etat.d.candidatures.find((x) => x.id === o.candidatureId) : null;
  ouvrirModale(o.enReponseA && !o.relance ? "Répondre" : o.relance ? "Relance" : "Nouveau courriel", `
    <p class="aide">Expéditeur : <b>${E(reg.expediteurNom)} &lt;${E(reg.expediteur)}&gt;</b>${c ? ` | Candidature : <b>${E(c.entreprise)}</b>` : ""}</p>
    <div class="grille-form">
      <label class="champ large"><span>À</span><input name="a" value="${E(o.a || "")}" placeholder="adresse@entreprise.com"></label>
      <label class="champ"><span>Cc</span><input name="cc" value="${E(o.cc || "")}"></label>
      <label class="champ"><span>Cci</span><input name="cci" value="${E(o.cci ?? reg.cci ?? "")}"></label>
      <label class="champ large"><span>Objet</span><input name="sujet" value="${E(o.sujet || "")}"></label>
      <label class="champ"><span>Modèle</span><select name="modele"><option value="">Choisir un modèle...</option>${mods.map((m) => `<option value="${m.id}">${E(m.nom)}</option>`).join("")}</select></label>
      <label class="champ"><span>CV en pièce jointe</span><select name="piece"><option value="">Aucun</option><option value="carriere" ${o.piece === "carriere" ? "selected" : ""}>CV carrière (Sylvain-Brochu-CV.pdf)</option><option value="barman" ${o.piece === "barman" ? "selected" : ""}>CV barman (Sylvain-Brochu-CV-Bar.pdf)</option></select></label>
      <label class="champ large"><span>Message</span><textarea name="texte" rows="14">${E(o.texte || "")}</textarea></label>
      <label class="champ large"><span>Autres pièces jointes</span><input type="file" name="fichiers" multiple></label>
    </div>`,
  `<span class="aide">Le brouillon apparaît aussi dans Gmail, dans Brouillons.</span>
   <div class="actions"><button class="btn" data-m="envoyer">Envoyer maintenant</button><button class="btn plein" data-m="brouillon">Enregistrer dans les brouillons</button></div>`,
  (racine) => {
    $('[name="modele"]', racine).onchange = (e) => {
      const m = mods.find((x) => x.id === e.target.value); if (!m) return;
      if (m.objet) $('[name="sujet"]', racine).value = remplir(m.objet, c || {});
      $('[name="texte"]', racine).value = remplir(m.corps, c || {});
      if (m.cv) $('[name="piece"]', racine).value = m.cv;
    };
    const lireFichiers = async () => {
      const f = $('[name="fichiers"]', racine).files; const out = [];
      for (const x of f) {
        if (x.size > 8e6) throw new Error(`${x.name} dépasse 8 Mo`);
        const b = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(x); });
        out.push({ nom: x.name, type: x.type, contenu: b });
      }
      return out;
    };
    const message = async () => ({
      a: $('[name="a"]', racine).value, cc: $('[name="cc"]', racine).value, cci: $('[name="cci"]', racine).value,
      sujet: $('[name="sujet"]', racine).value, texte: $('[name="texte"]', racine).value, piece: $('[name="piece"]', racine).value,
      enReponseA: o.enReponseA || "", references: o.references || [], piecesJointes: await lireFichiers(),
    });
    const apres = (envoye) => {
      if (!c) return;
      if (envoye) {
        if (o.relance) { c.statut = "relance"; c.relanceFaiteLe = jour(); noter(c, "Relance envoyée depuis l'admin"); }
        else { if (!c.envoyeLe) c.envoyeLe = jour(); if (["a_preparer", "brouillon"].includes(c.statut)) c.statut = "envoye"; noter(c, "Courriel envoyé depuis l'admin"); }
      } else { if (c.statut === "a_preparer") c.statut = "brouillon"; noter(c, o.relance ? "Brouillon de relance préparé" : "Brouillon préparé"); }
      sauver("candidatures");
    };
    $('[data-m="brouillon"]', racine).onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = "Enregistrement...";
      try { await api("/api/courriels/?action=brouillon", { method: "POST", body: await message() }); apres(false); fermerModale(); toast("Brouillon enregistré dans Gmail."); delete etat.boite.listes.brouillons; rendrePage(); }
      catch (err) { b.disabled = false; b.textContent = "Enregistrer dans les brouillons"; toast(err.code === "COURRIEL_ABSENT" ? "Connexion Gmail pas encore configurée (voir Réglages)." : err.message, true); }
    };
    $('[data-m="envoyer"]', racine).onclick = async (e) => {
      const b = e.currentTarget; const m = await message().catch((err) => { toast(err.message, true); return null; }); if (!m) return;
      if (!m.a.trim()) return toast("Indique un destinataire.", true);
      if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.classList.add("laiton"); b.textContent = `Confirmer l'envoi à ${m.a.split(/[,;]/)[0].trim()}`; return; }
      b.disabled = true; b.textContent = "Envoi...";
      try { await api("/api/courriels/?action=envoyer", { method: "POST", body: m }); apres(true); fermerModale(); toast("Courriel envoyé."); delete etat.boite.listes.envoyes; rendrePage(); }
      catch (err) { b.disabled = false; b.textContent = "Envoyer maintenant"; delete b.dataset.ok; toast(err.message, true); }
    };
  });
}

// ======================================================================
// COURRIELS
// ======================================================================
function blocConfigCourriel(court = false) {
  return `<div class="config"><h3>Boîte info@ pas encore branchée</h3>
  ${court ? `<p class="aide">Mika doit ajouter le mot de passe d'application Gmail dans Vercel. Détails dans Réglages.</p>` : `<ol>
    <li>Dans le compte Google <b>${E(etat.mail?.boite || "massivemedias@gmail.com")}</b>, ouvrir <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">Mots de passe des applications</a> et en créer un nommé « Admin Sylvain ».</li>
    <li>Dans Vercel, projet <b>sylvainbrochu.ca</b> : Settings, Environment Variables, ajouter <code>MAIL_APP_PASSWORD</code> avec ce mot de passe (Production).</li>
    <li>Redéployer le projet. La boîte s'affiche ici.</li></ol>
  <p class="aide">${E(etat.mail?.raison || "")}</p>`}</div>`;
}
function pCourriels() {
  const b = etat.boite;
  if (etat.mail && !etat.mail.pret) { $("#page").innerHTML = entete("Courriels", "Boîte de info@sylvainbrochu.ca.") + blocConfigCourriel(); return; }
  $("#page").innerHTML = entete("Courriels", "Les courriels envoyés à info@sylvainbrochu.ca, les envois et les brouillons. Les réponses partent de info@.",
    `${b.dossier === "brouillons" ? `<button class="btn" data-act="recreer-brouillons" title="Crée dans Gmail les brouillons des candidatures « Brouillon prêt » qui n'en ont pas">Recréer les brouillons manquants</button>` : ""}<button class="btn" data-act="rafraichir-boite">Actualiser</button><button class="btn laiton" data-act="nouveau-courriel">Nouveau courriel</button>`) + `
  <div class="boite">
    <div class="colonne"><div class="tetecol">
      <div class="dossiers">${[["recus", "Reçus"], ["envoyes", "Envoyés"], ["brouillons", "Brouillons"]].map(([k, n]) => `<button type="button" data-dossier="${k}" aria-pressed="${k === b.dossier}">${n}</button>`).join("")}</div>
      <input class="recherche" style="width:100%" type="search" id="rech-mail" placeholder="Chercher dans ce dossier" value="${E(b.q)}"></div>
      <ul class="messages" id="msgs"><li class="vide" style="padding:14px">Chargement...</li></ul></div>
    <div class="colonne lecteur" id="lecteur"><p class="vide">Choisis un courriel à gauche.</p></div>
  </div>`;
  $("#rech-mail").onkeydown = (e) => { if (e.key === "Enter") { b.q = e.target.value.trim(); chargerListe(true); } };
  chargerListe();
  if (b.ouvert) ouvrirCourriel(b.ouvert.dossier, b.ouvert.uid);
}
async function chargerListe(force = false) {
  const b = etat.boite; const el = $("#msgs"); if (!el) return;
  try {
    const l = await chargerBoite(b.dossier, force);
    if (etat.page !== "courriels") return;
    el.innerHTML = l.length ? l.map((m) => {
      const qui = b.dossier === "recus" ? m.de[0] : m.a[0];
      return `<li class="${m.lu ? "" : "non-lu"}"><button type="button" data-ouvrir="${b.dossier}:${m.uid}" aria-current="${b.ouvert && b.ouvert.uid === m.uid ? "true" : "false"}">
        <span class="de">${b.dossier !== "recus" ? "À : " : ""}${E(qui?.nom || qui?.courriel || "")}</span><span class="date">${dateHeure(m.date)}</span><span class="sujet">${E(m.sujet)}</span></button></li>`;
    }).join("") : `<li class="vide" style="padding:14px">Aucun courriel.</li>`;
  } catch (e) {
    if (e.code === "COURRIEL_ABSENT") { etat.mail = { pret: false, raison: e.message }; return pCourriels(); }
    el.innerHTML = `<li class="vide" style="padding:14px">${E(e.message)}</li>`;
  }
}
async function ouvrirCourriel(dossier, uidMsg) {
  etat.boite.ouvert = { dossier, uid: Number(uidMsg) };
  $$("#msgs [data-ouvrir]").forEach((x) => x.setAttribute("aria-current", x.dataset.ouvrir === `${dossier}:${uidMsg}` ? "true" : "false"));
  const lec = $("#lecteur"); if (!lec) return;
  lec.innerHTML = `<p class="vide">Ouverture...</p>`;
  try {
    const { message: m } = await api(`/api/courriels/?action=lire&dossier=${dossier}&uid=${uidMsg}`);
    const l = etat.boite.listes[dossier]; const it = l && l.find((x) => x.uid === m.uid); if (it && !it.lu) { it.lu = true; majCompteurs(); $(`#msgs [data-ouvrir="${dossier}:${m.uid}"]`)?.parentElement.classList.remove("non-lu"); }
    const exp = m.de[0] || {};
    const c = dossier === "recus" ? candParCourriel(exp.courriel) : candParCourriel(m.a[0]?.courriel);
    const fmt = (a) => a.map((x) => x.nom ? `${E(x.nom)} &lt;${E(x.courriel)}&gt;` : E(x.courriel)).join(", ");
    lec.innerHTML = `<h2>${E(m.sujet)}</h2>
      <div class="meta"><span><b>De :</b> ${fmt(m.de)}</span><span><b>À :</b> ${fmt(m.a)}</span>${m.cc.length ? `<span><b>Cc :</b> ${fmt(m.cc)}</span>` : ""}${m.cci.length ? `<span><b>Cci :</b> ${fmt(m.cci)}</span>` : ""}<span>${new Date(m.date).toLocaleString("fr-CA", { dateStyle: "long", timeStyle: "short" })}</span></div>
      <div class="actions">
        ${dossier === "brouillons" ? `<button class="btn laiton" data-act="envoyer-brouillon" data-uid="${m.uid}">Envoyer ce brouillon</button><button class="btn danger" data-act="supprimer-brouillon" data-uid="${m.uid}">Supprimer</button>` : `<button class="btn laiton" data-act="repondre">Répondre</button>`}
        ${c ? `<button class="btn" data-act="fiche" data-id="${c.id}">Candidature : ${E(c.entreprise)}</button>` : dossier === "recus" ? `<button class="btn" data-act="creer-depuis-courriel">Créer une candidature</button>` : ""}
        ${c && dossier === "recus" && !c.reponseLe ? `<button class="btn" data-act="marquer-reponse" data-id="${c.id}">Marquer comme réponse</button>` : ""}
      </div>
      ${m.pieces.length ? `<div class="pieces">${m.pieces.map((p) => `<a class="btn petit" href="/api/courriels/?action=piece&dossier=${dossier}&uid=${m.uid}&index=${p.index}">${E(p.nom)} (${Math.max(1, Math.round(p.taille / 1024))} Ko)</a>`).join("")}</div>` : ""}
      ${m.html ? `<iframe sandbox="allow-popups allow-popups-to-escape-sandbox" title="Contenu du courriel" id="corps-mail"></iframe>` : `<pre>${E(m.texte)}</pre>`}`;
    if (m.html) {
      const f = $("#corps-mail");
      f.srcdoc = `<!doctype html><meta charset="utf-8"><base target="_blank"><style>body{font:14px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#222;margin:14px;word-wrap:break-word}img{max-width:100%;height:auto}</style>${m.html}`;
      f.onload = () => { try { f.style.height = Math.min(1600, f.contentDocument.body.scrollHeight + 40) + "px"; } catch { /* */ } };
    }
    lec._message = m; lec._cand = c;
  } catch (e) { lec.innerHTML = `<p class="vide">${E(e.message)}</p>`; }
}
function repondre() {
  const m = $("#lecteur")._message; if (!m) return;
  const c = $("#lecteur")._cand;
  const a = (m.de[0] || {}).courriel;
  const cite = m.texte ? "\n\n\n" + `Le ${new Date(m.date).toLocaleString("fr-CA", { dateStyle: "long", timeStyle: "short" })}, ${m.de[0]?.nom || a} a écrit :\n` + m.texte.split("\n").map((l) => "> " + l).join("\n") : "";
  ouvrirComposeur({ a, sujet: /^re\s*:/i.test(m.sujet) ? m.sujet : "Re: " + m.sujet, texte: (c?.contact ? `Bonjour ${c.contact},` : "Bonjour,") + "\n\n\n\n" + (etat.d.reglages.signature || "") + cite, enReponseA: m.idMessage, references: [...(m.references || []), m.idMessage].filter(Boolean), candidatureId: c?.id, cci: "" });
}

// ======================================================================
// OFFRES
// ======================================================================
const RECHERCHES = {
  carriere: ["directeur de production", "chargé de projets événementiel", "gestionnaire de projets production", "directeur des opérations", "directeur technique", "chargé de projets expositions"],
  temporaire: ["barman", "serveur banquet", "maître d'hôtel", "superviseur événements"],
};
const SITES = [
  ["Indeed", (q) => `https://ca.indeed.com/jobs?q=${encodeURIComponent(q)}&l=${encodeURIComponent("Montréal, QC")}&sort=date`],
  ["LinkedIn", (q) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}&location=${encodeURIComponent("Montréal, Québec, Canada")}&sortBy=DD`],
  ["Guichet-Emplois", (q) => `https://www.guichetemplois.gc.ca/jobsearch/rechercheemplois?searchstring=${encodeURIComponent(q)}&locationstring=${encodeURIComponent("Montréal, QC")}&sort=D`],
  ["Hôtellerie Jobs", (q) => `https://www.hotelleriejobs.com/fr/jobs?search=${encodeURIComponent(q)}`],
];
function pOffres() {
  const masq = new Set(etat.d["offres-masquees"] || []);
  $("#page").innerHTML = entete("Offres d'emploi", "Offres trouvées automatiquement (Cirque du Soleil, Solotech, GSM, Guichet-Emplois, Hôtellerie Jobs), recherches prêtes sur Indeed et LinkedIn, et suivi de ses profils sur les plateformes.",
    `<button class="btn" data-act="ajouter-offre">Ajouter une offre</button><button class="btn" data-act="rafraichir-offres">Actualiser</button>`) + `
  <div class="filtres">${[["tous", "Toutes"], ["carriere", "Carrière"], ["temporaire", "Temporaire (bar, service)"], ["sauvees", "Mes offres ajoutées"]].map(([k, n]) => `<button type="button" data-profil="${k}" aria-pressed="${k === etat.profilOffres}">${n}</button>`).join("")}</div>
  <div class="barre-outils"><input class="recherche" type="search" id="rech-off" placeholder="Filtrer par mot" value="${E(etat.rechOffres)}"><span class="aide" id="etat-off"></span></div>
  <section class="carte carte-offres"><header><h2>Carte des offres</h2><span class="aide" id="geo-etat"></span></header>
    <div id="carte-off" class="carte-geo" role="region" aria-label="Carte des offres d'emploi"></div>
    <p class="aide legende"><span class="pt pt-c"></span> Carrière <span class="pt pt-t"></span> Temporaire <span class="pt pt-v"></span> Pâle : position de la ville (adresse pas encore trouvée)</p></section>
  <div class="offres" id="liste-off"><p class="vide">Recherche des offres...</p></div>
  <div class="grille g2" style="margin-top:22px">
    <section class="carte"><header><h2>Recherches rapides</h2></header>
      <div class="liens-rapides">${["carriere", "temporaire"].map((p) => `<div class="groupe"><h4>${p === "carriere" ? "Carrière" : "Temporaire"}</h4>${RECHERCHES[p].map((q) => `<div style="margin-bottom:6px"><b style="font-size:.84rem">${E(q)}</b><br>${SITES.filter(([n]) => p === "temporaire" || n !== "Hôtellerie Jobs").map(([n, f]) => `<a href="${E(f(q))}" target="_blank" rel="noopener" style="display:inline;margin-right:8px">${n}</a>`).join("")}</div>`).join("")}</div>`).join("")}</div>
      <p class="aide" style="margin-top:10px">Indeed et LinkedIn n'offrent pas d'accès automatique à leurs offres : ces liens ouvrent les recherches triées par date.</p>
    </section>
    <section class="carte"><header><h2>Ses profils sur les plateformes</h2></header>
      <p class="aide">Créer un compte et téléverser le CV demande que Sylvain se connecte lui-même. Coche quand c'est fait.</p>
      <ul class="liste">${(etat.d.plateformes || []).map((p, i) => `<li><div class="t"><b><a href="${E(p.compte)}" target="_blank" rel="noopener">${E(p.nom)}</a></b><small>CV conseillé : ${p.profil === "barman" ? "barman" : "carrière"}</small></div>
        <div class="actions"><label class="aide"><input type="checkbox" data-plat="${i}" data-k="profilCree" ${p.profilCree ? "checked" : ""}> Profil créé</label>
        <select class="choix" data-plat="${i}" data-k="cvTeleverse"><option value="">CV non téléversé</option><option value="carriere" ${p.cvTeleverse === "carriere" ? "selected" : ""}>CV carrière en ligne</option><option value="barman" ${p.cvTeleverse === "barman" ? "selected" : ""}>CV barman en ligne</option></select></div></li>`).join("")}</ul>
    </section>
  </div>`;
  $("#rech-off").oninput = (e) => { etat.rechOffres = e.target.value; listerOffres(); };
  $$("[data-plat]").forEach((el) => { el.onchange = () => { const p = etat.d.plateformes[el.dataset.plat]; p[el.dataset.k] = el.type === "checkbox" ? el.checked : el.value; sauver("plateformes"); }; });
  listerOffres(masq);
}
async function listerOffres(masq = new Set(etat.d["offres-masquees"] || []), force = false) {
  const el = $("#liste-off"); if (!el) return;
  let o;
  try { o = await chargerOffres(force); } catch (e) { el.innerHTML = `<p class="vide">${E(e.message)}</p>`; return; }
  if (etat.page !== "offres") return;
  const ok = o.etat.filter((x) => x.ok).length;
  $("#etat-off").textContent = `${ok}/${o.etat.length} sources lues, mise à jour ${ilYa(new Date(o.maj).getTime())}`;
  const sauvees = (etat.d["offres-sauvees"] || []).map((x) => ({ ...x, sauvee: true }));
  let l = etat.profilOffres === "sauvees" ? sauvees : [...sauvees, ...o.offres.filter((x) => !masq.has(x.id))];
  if (["carriere", "temporaire"].includes(etat.profilOffres)) l = l.filter((x) => x.profil === etat.profilOffres);
  const q = etat.rechOffres.toLowerCase();
  if (q) l = l.filter((x) => `${x.titre} ${x.entreprise} ${x.lieu} ${x.resume}`.toLowerCase().includes(q));
  const dejaLiees = new Set((etat.d.candidatures || []).map((c) => c.lien).filter(Boolean));
  etat.carteCadree = false; majCarte(l);
  if (o.geoAttente > 0) localiserOffres();
  el.innerHTML = l.length ? l.map((x) => `<article class="offre"><div><h3>${E(x.titre)}</h3><div class="m"><span><b>${E(x.entreprise || "")}</b></span>${x.lieu ? `<span>${E(x.lieu)}</span>` : ""}${x.contrat ? `<span>${E(x.contrat)}</span>` : ""}${x.salaire ? `<span>${E(x.salaire)}</span>` : ""}<span>${E(x.source || "Ajoutée")}</span>${x.date ? `<span>${dateCourte(x.date)}</span>` : ""}<span class="pastille ${x.profil === "temporaire" ? "p-brouillon" : "p-envoye"}">${x.profil === "temporaire" ? "Temporaire" : "Carrière"}</span></div></div>
    <div class="actions"><a class="btn petit" href="${E(x.url)}" target="_blank" rel="noopener">Voir l'offre</a>${dejaLiees.has(x.url) ? `<span class="pastille p-reponse">Dans les candidatures</span>` : `<button class="btn petit laiton" data-act="offre-vers-cand" data-oid="${x.id}">Ajouter aux candidatures</button>`}${x.sauvee ? `<button class="btn petit danger" data-act="retirer-offre" data-oid="${x.id}">Retirer</button>` : `<button class="btn petit lien" data-act="masquer-offre" data-oid="${x.id}">Masquer</button>`}</div>
    ${x.resume ? `<p>${E(x.resume)}</p>` : ""}</article>`).join("") : `<p class="vide">Aucune offre dans ce filtre.</p>`;
  el._offres = l;
}
// ---------- Carte des offres (MapLibre + fond OpenFreeMap « Liberty », style proche de Google Maps) ----------
let carteLibPret = null;
function chargerCarteLib() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (carteLibPret) return carteLibPret;
  carteLibPret = new Promise((ok, ko) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"; document.head.appendChild(css);
    const js = document.createElement("script"); js.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"; js.onload = () => ok(window.maplibregl); js.onerror = ko; document.head.appendChild(js);
  });
  return carteLibPret;
}
const epingle = (couleur, approx) => `<svg width="${approx ? 22 : 28}" height="${approx ? 30 : 38}" viewBox="0 0 28 38" aria-hidden="true"><path d="M14 1C7 1 1.5 6.4 1.5 13.3 1.5 22.6 14 37 14 37s12.5-14.4 12.5-23.7C26.5 6.4 21 1 14 1z" fill="${couleur}" fill-opacity="${approx ? 0.55 : 1}" stroke="#fff" stroke-width="2"/><circle cx="14" cy="13.5" r="${approx ? 3.6 : 4.6}" fill="#fff"/></svg>`;
async function majCarte(liste) {
  const boite = $("#carte-off"); if (!boite) return;
  let ml; try { ml = await chargerCarteLib(); } catch { boite.innerHTML = `<p class="vide">Carte indisponible.</p>`; return; }
  if (!boite.isConnected) return;
  if (!etat.carte || etat.carte.getContainer() !== boite) {
    etat.carte = new ml.Map({ container: boite, style: "https://tiles.openfreemap.org/styles/liberty", center: [-73.65, 45.55], zoom: 7.2, attributionControl: { compact: true } });
    etat.carte.addControl(new ml.NavigationControl({ showCompass: false }), "top-left");
    etat.carte.scrollZoom.disable();
    etat.marqueurs = [];
    etat.carteCadree = false;
  }
  (etat.marqueurs || []).forEach((m) => m.remove());
  etat.marqueurs = [];
  const places = liste.filter((x) => x.geo && x.geo.lat);
  const compte = {};
  const bornes = new ml.LngLatBounds();
  places.forEach((x) => {
    const k = `${x.geo.lat.toFixed(3)},${x.geo.lon.toFixed(3)}`; const n = (compte[k] = (compte[k] || 0) + 1) - 1;
    const ang = n * 2.4, ray = n ? 0.004 * Math.sqrt(n) : 0; // décale les offres au même endroit
    const pos = [x.geo.lon + ray * Math.cos(ang), x.geo.lat + ray * Math.sin(ang)];
    const temp = x.profil === "temporaire", approx = x.geo.precis !== "entreprise";
    const el = document.createElement("button");
    el.type = "button"; el.className = "epingle"; el.title = `${x.titre} | ${x.entreprise || ""}`;
    el.innerHTML = epingle(temp ? "#e0a33a" : "#1a7f5a", approx);
    const pop = new ml.Popup({ offset: 30, closeButton: true, maxWidth: "280px" }).setHTML(`<b>${E(x.titre)}</b><br>${E(x.entreprise || "")}<br><span style="color:#666">${E(x.lieu || "")}${approx ? " (position de la ville)" : ""}</span><br><a href="${E(x.url)}" target="_blank" rel="noopener">Voir l'offre</a>`);
    etat.marqueurs.push(new ml.Marker({ element: el, anchor: "bottom" }).setLngLat(pos).setPopup(pop).addTo(etat.carte));
    bornes.extend(pos);
  });
  if (places.length && !etat.carteCadree) { etat.carte.fitBounds(bornes, { padding: 50, maxZoom: 11, duration: 0 }); etat.carteCadree = true; }
  setTimeout(() => etat.carte && etat.carte.resize(), 50);
  const ge = $("#geo-etat");
  if (ge) ge.textContent = `${places.length}/${liste.length} offres placées${etat.offres && etat.offres.geoAttente ? `, localisation en cours (${etat.offres.geoAttente} restantes)` : ""}`;
}
let localisationEnCours = false;
async function localiserOffres() {
  if (localisationEnCours) return; localisationEnCours = true;
  try {
    for (let i = 0; i < 12; i++) {
      const r = await api("/api/offres/?geo=1");
      etat.offres = r;
      if (etat.page !== "offres") break;
      const l = (($("#liste-off") || {})._offres || []).map((x) => r.offres.find((y) => y.id === x.id) || x);
      if ($("#liste-off")) $("#liste-off")._offres = l;
      etat.carteCadree = false;
      await majCarte(l);
      if (!r.geoAttente) break;
    }
  } catch { /* on réessaiera au prochain affichage */ } finally { localisationEnCours = false; }
}
function offreParId(id) { return (($("#liste-off") || {})._offres || []).find((x) => x.id === id) || (etat.offres?.offres || []).find((x) => x.id === id) || (etat.d["offres-sauvees"] || []).find((x) => x.id === id); }

// ======================================================================
// CV
// ======================================================================
function pCV() {
  const v = etat.cvOnglet; const cle = `cv-${v}`; const cv = etat.d[cle];
  $("#page").innerHTML = entete("CV", v === "carriere" ? "Le CV carrière est celui du site : « Publier sur le site » remplace le PDF téléchargé par les visiteurs." : "Le CV barman sert aux emplois temporaires. Il n'est jamais affiché sur le site, seulement joint aux courriels.",
    `<a class="btn" href="/api/cv/?v=${v}" target="_blank" rel="noopener">PDF actuel</a><button class="btn" data-act="cv-pdf">Télécharger le PDF</button><button class="btn plein" data-act="cv-publier">${v === "carriere" ? "Publier sur le site" : "Utiliser comme pièce jointe"}</button>`) + `
  <div class="filtres">${[["carriere", "CV carrière (public)"], ["barman", "CV barman (privé)"]].map(([k, n]) => `<button type="button" data-cv="${k}" aria-pressed="${k === v}">${n}</button>`).join("")}</div>
  <div class="cv-grille">
    <div class="pile" id="ed-cv">
      <section class="carte"><h2>En-tête</h2><div class="grille-form">
        ${[["nom", "Nom"], ["titre", "Titre"], ["courriel", "Courriel"], ["telephone", "Téléphone"], ["linkedin", "LinkedIn"], ["site", "Site web"]].map(([k, n]) => `<label class="champ"><span>${n}</span><input data-k="${k}" value="${E(cv[k] || "")}"></label>`).join("")}
        <label class="champ large"><span>Ligne lieu et disponibilité</span><input data-k="lieu" value="${E(cv.lieu || "")}"></label>
        <label class="champ"><span>Mise en page des postes</span><select data-k="disposition"><option value="deux_lignes" ${cv.disposition !== "une_ligne" ? "selected" : ""}>Lieu et dates sous le poste</option><option value="une_ligne" ${cv.disposition === "une_ligne" ? "selected" : ""}>Lieu et dates à droite</option></select></label>
        <label class="champ"><span>Densité</span><select data-k="compact"><option value="" ${!cv.compact ? "selected" : ""}>Aérée</option><option value="1" ${cv.compact ? "selected" : ""}>Compacte (tient sur moins de pages)</option></select></label>
      </div></section>
      <section class="carte"><h2>Profil</h2><textarea class="notes-libres" data-k="profil" style="min-height:110px">${E(cv.profil || "")}</textarea></section>
      <section class="carte"><header><h2>Compétences</h2><button class="btn petit" data-cvact="ajout-comp">Ajouter</button></header>
        <label class="champ" style="margin-bottom:10px"><span>Titre de la section</span><input data-k="titreCompetences" value="${E(cv.titreCompetences || "Compétences clés")}"></label>
        <div class="pile">${(cv.competences || []).map((x, i) => `<div class="bloc-ed"><div class="grille-form" style="grid-template-columns:160px minmax(0,1fr)"><label class="champ"><span>Libellé</span><input data-comp="${i}" data-ck="label" value="${E(x.label)}"></label><label class="champ"><span>Détail</span><input data-comp="${i}" data-ck="texte" value="${E(x.texte)}"></label></div>${outilsBloc("comp", i)}</div>`).join("")}</div></section>
      <section class="carte"><header><h2>Expériences</h2><button class="btn petit" data-cvact="ajout-exp">Ajouter un poste</button></header>
        <label class="champ" style="margin-bottom:10px"><span>Titre de la section</span><input data-k="titreExperiences" value="${E(cv.titreExperiences || "Expériences professionnelles")}"></label>
        <div class="pile">${(cv.experiences || []).map((x, i) => `<div class="bloc-ed"><div class="grille-form">
          <label class="champ"><span>Poste</span><input data-exp="${i}" data-ck="poste" value="${E(x.poste)}"></label>
          <label class="champ"><span>Employeur</span><input data-exp="${i}" data-ck="employeur" value="${E(x.employeur)}"></label>
          <label class="champ large"><span>Lieu et dates</span><input data-exp="${i}" data-ck="lieu" value="${E(x.lieu)}"></label>
          <label class="champ large"><span>Réalisations (une par ligne)</span><textarea data-exp="${i}" data-ck="puces" rows="${Math.max(3, (x.puces || []).length + 1)}">${E((x.puces || []).join("\n"))}</textarea></label></div>${outilsBloc("exp", i)}</div>`).join("")}</div></section>
      <section class="carte"><header><h2>Autres sections</h2><button class="btn petit" data-cvact="ajout-sec">Ajouter une section</button></header>
        <div class="pile">${(cv.sections || []).map((x, i) => `<div class="bloc-ed"><div class="grille-form"><label class="champ large"><span>Titre</span><input data-sec="${i}" data-ck="titre" value="${E(x.titre)}"></label>
          <label class="champ large"><span>Lignes (une par ligne)</span><textarea data-sec="${i}" data-ck="puces" rows="${Math.max(2, (x.puces || []).length + 1)}">${E((x.puces || []).join("\n"))}</textarea></label></div>${outilsBloc("sec", i)}</div>`).join("")}</div></section>
    </div>
    <div class="apercu"><div class="feuille" id="apercu"></div><p class="aide" style="color:#f2eee7;margin:10px 0 0" id="pages-cv"></p></div>
  </div>`;
  apercuCV();
  const ed = $("#ed-cv");
  ed.addEventListener("input", (e) => {
    const t = e.target; const cv = etat.d[cle];
    if (t.dataset.k) cv[t.dataset.k] = t.dataset.k === "compact" ? Boolean(t.value) : t.value;
    const liste = (n, k) => { const arr = cv[n]; const o = arr[Number(t.dataset[k])]; o[t.dataset.ck] = t.dataset.ck === "puces" ? t.value.split("\n").map((s) => s.trim()).filter(Boolean) : t.value; };
    if (t.dataset.comp !== undefined) liste("competences", "comp");
    if (t.dataset.exp !== undefined) liste("experiences", "exp");
    if (t.dataset.sec !== undefined) liste("sections", "sec");
    apercuCV(); sauver(cle, 1200);
  });
  ed.addEventListener("change", (e) => { if (e.target.tagName === "SELECT") e.target.dispatchEvent(new Event("input", { bubbles: true })); });
}
const outilsBloc = (t, i) => `<div class="actions" style="justify-content:flex-end"><button class="btn petit" data-cvact="haut" data-t="${t}" data-i="${i}" title="Monter">Monter</button><button class="btn petit" data-cvact="bas" data-t="${t}" data-i="${i}" title="Descendre">Descendre</button><button class="btn petit danger" data-cvact="retirer" data-t="${t}" data-i="${i}">Retirer</button></div>`;
function apercuCV() {
  const cv = etat.d[`cv-${etat.cvOnglet}`]; const el = $("#apercu"); if (!el) return;
  const p = (s) => E(String(s || "").replace(/[\u2013\u2014]/g, "-"));
  el.innerHTML = `<h1>${p(cv.nom)}</h1><p class="tt">${p(cv.titre)}</p>
    <p class="ct">📧 ${p(cv.courriel)} | 📞 ${p(cv.telephone)}</p><p class="ct">🔗 LinkedIn: <a>${p(cv.linkedin)}</a></p><p class="ct">🔗 Portfolio &amp; site web: <a>${p(cv.site)}</a></p><p class="ct">📍 ${p(cv.lieu)}</p>
    ${cv.profil ? `<h2>Profil</h2><p class="ct">${p(cv.profil)}</p>` : ""}
    ${(cv.competences || []).length ? `<h2>${p(cv.titreCompetences || "Compétences clés")}</h2><ul>${cv.competences.map((x) => `<li><b>${p(x.label)} :</b> ${p(x.texte)}</li>`).join("")}</ul>` : ""}
    ${(cv.experiences || []).length ? `<h2>${p(cv.titreExperiences || "Expériences professionnelles")}</h2>${cv.experiences.map((x) => cv.disposition === "une_ligne"
      ? `<div class="ligne"><p class="po">${p(x.poste)}${x.employeur ? " - " + p(x.employeur) : ""}</p><p class="po li">${p(x.lieu)}</p></div><ul>${(x.puces || []).map((y) => `<li>${p(y)}</li>`).join("")}</ul>`
      : `<p class="po">${p(x.poste)}${x.employeur ? " - " + p(x.employeur) : ""}</p><p class="li">${p(x.lieu)}</p><ul>${(x.puces || []).map((y) => `<li>${p(y)}</li>`).join("")}</ul>`).join("")}` : ""}
    ${(cv.sections || []).map((s) => `<h2>${p(s.titre)}</h2><ul>${(s.puces || []).map((y) => `<li>${p(y)}</li>`).join("")}</ul>`).join("")}`;
}
async function actionCV(a, el) {
  const cle = `cv-${etat.cvOnglet}`; const cv = etat.d[cle];
  const tab = { comp: "competences", exp: "experiences", sec: "sections" }[el.dataset.t];
  if (a === "ajout-comp") (cv.competences = cv.competences || []).push({ label: "", texte: "" });
  if (a === "ajout-exp") (cv.experiences = cv.experiences || []).unshift({ poste: "", employeur: "", lieu: "", puces: [] });
  if (a === "ajout-sec") (cv.sections = cv.sections || []).push({ titre: "", puces: [] });
  if (["haut", "bas", "retirer"].includes(a)) {
    const arr = cv[tab]; const i = Number(el.dataset.i);
    if (a === "retirer") arr.splice(i, 1);
    else { const j = a === "haut" ? i - 1 : i + 1; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; }
  }
  sauver(cle); pCV();
}
async function pdfCV(publier) {
  const v = etat.cvOnglet; const cv = etat.d[`cv-${v}`];
  toast("Création du PDF...");
  try {
    await sauver(`cv-${v}`);
    const r = await genererPDF(cv);
    $("#pages-cv") && ($("#pages-cv").textContent = `Le PDF fait ${r.pages} page${r.pages > 1 ? "s" : ""}.`);
    if (!publier) { r.doc.download(v === "barman" ? "Sylvain-Brochu-CV-Bar.pdf" : "Sylvain-Brochu-CV.pdf"); return; }
    await api(`/api/cv/?v=${v}`, { method: "POST", body: { pdf: r.base64 } });
    toast(v === "carriere" ? `CV publié sur le site (${r.pages} pages). Il est aussi joint aux nouveaux courriels.` : `CV barman enregistré (${r.pages} page${r.pages > 1 ? "s" : ""}). Il sera joint aux courriels « barman ».`);
  } catch (e) { toast("PDF impossible : " + e.message, true); }
}

// ======================================================================
// STATISTIQUES
// ======================================================================
let minuteurLive = null;
function pStats() {
  $("#page").innerHTML = entete("Statistiques", "Visites de sylvainbrochu.ca, mesurées par le site lui-même (sans témoin). Les robots et l'admin ne sont pas comptés.",
    `<div class="periode">${[7, 30, 90].map((j) => `<button class="btn ${etat.statsJours === j ? "plein" : ""}" data-jours="${j}">${j} jours</button>`).join("")}</div>`) + `<div id="st"><p class="vide">Chargement...</p></div>`;
  dessinerStats();
  clearInterval(minuteurLive);
  minuteurLive = setInterval(() => { if (etat.page !== "stats") return clearInterval(minuteurLive); chargerStats(etat.statsJours, true).then(dessinerStats).catch(() => {}); }, 30000);
}
async function dessinerStats() {
  const el = $("#st"); if (!el) return;
  let s; try { s = await chargerStats(etat.statsJours); } catch (e) { el.innerHTML = `<p class="vide">${E(e.message)}</p>`; return; }
  if (etat.page !== "stats") return;
  const ev = { vue: "Page vue", cv: "CV téléchargé", contact: "Formulaire envoyé" };
  el.innerHTML = `<div class="kpis">
    <div class="kpi direct"><b><span class="point"></span>${s.enLigne.length}</b><span>En ligne maintenant</span></div>
    <div class="kpi"><b>${s.totaux.visiteurs}</b><span>Visiteurs</span></div>
    <div class="kpi"><b>${s.totaux.vues}</b><span>Pages vues</span></div>
    <div class="kpi"><b>${s.totaux.cv}</b><span>CV téléchargés</span></div>
    <div class="kpi"><b>${s.totaux.contact}</b><span>Messages par le formulaire</span></div></div>
  <div class="grille g2">
    <section class="carte" style="grid-column:1/-1"><h2>Par jour</h2>${graphique(s.serie)}</section>
    <section class="carte"><h2>En ligne maintenant</h2>${s.enLigne.length ? `<ul class="liste">${s.enLigne.map((x) => `<li><div class="t"><b>${E(x.p)}</b><small>${E(x.lieu)} | ${E(x.dev)}</small></div><span class="aide">${ilYa(x.t)}</span></li>`).join("")}</ul>` : `<p class="vide">Personne sur le site en ce moment.</p>`}</section>
    <section class="carte"><h2>D'où viennent les visiteurs</h2>${barres(s.sources)}</section>
    <section class="carte"><h2>Pages les plus vues</h2>${barres(s.pages)}</section>
    <section class="carte"><h2>Villes</h2>${barres(s.lieux)}</section>
    <section class="carte"><h2>Appareils</h2>${barres(s.appareils)}</section>
    <section class="carte"><h2>Visibilité sur Google</h2>
      <p class="aide">Pour savoir sur quelles recherches le site apparaît dans Google, la Search Console est l'outil officiel.</p>
      <div class="actions" style="margin-top:8px"><a class="btn" href="https://search.google.com/search-console?resource_id=sc-domain%3Asylvainbrochu.ca" target="_blank" rel="noopener">Search Console</a><a class="btn" href="https://www.google.com/search?q=site%3Asylvainbrochu.ca" target="_blank" rel="noopener">Pages indexées</a><a class="btn" href="https://www.google.com/search?q=%22Sylvain+Brochu%22+production" target="_blank" rel="noopener">Recherche « Sylvain Brochu »</a></div></section>
    <section class="carte" style="grid-column:1/-1"><h2>Dernières visites</h2>${s.recents.length ? `<div class="tableau-wrap" style="box-shadow:none"><table class="tab"><thead><tr><th>Quand</th><th>Quoi</th><th>Page</th><th>Source</th><th>Lieu</th><th>Appareil</th></tr></thead><tbody>${s.recents.slice(0, 40).map((x) => `<tr><td>${ilYa(x.t)}</td><td>${ev[x.e] || x.e}</td><td>${E(x.p)}</td><td>${E(x.src || "")}</td><td>${E(x.lieu)}</td><td>${E(x.dev)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="vide">Aucune visite enregistrée pour l'instant. Le compteur démarre avec la mise en ligne de l'admin.</p>`}</section>
  </div>`;
}

// ======================================================================
// MODÈLES
// ======================================================================
function pModeles() {
  const mods = etat.d.modeles || [];
  $("#page").innerHTML = entete("Modèles de courriels", "Textes prêts pour les candidatures, relances et remerciements. Variables : {entreprise}, {poste}, {contact}, {envoyeLe}, {signature}.",
    `<button class="btn laiton" data-act="ajout-modele">Nouveau modèle</button>`) + `<div class="pile" id="mods">${mods.map((m, i) => `<section class="carte"><div class="grille-form">
      <label class="champ"><span>Nom</span><input data-mod="${i}" data-mk="nom" value="${E(m.nom)}"></label>
      <label class="champ"><span>CV joint par défaut</span><select data-mod="${i}" data-mk="cv"><option value="" ${!m.cv ? "selected" : ""}>Aucun</option><option value="carriere" ${m.cv === "carriere" ? "selected" : ""}>Carrière</option><option value="barman" ${m.cv === "barman" ? "selected" : ""}>Barman</option></select></label>
      <label class="champ large"><span>Objet</span><input data-mod="${i}" data-mk="objet" value="${E(m.objet)}"></label>
      <label class="champ large"><span>Message</span><textarea data-mod="${i}" data-mk="corps" rows="9">${E(m.corps)}</textarea></label></div>
      <div class="actions" style="justify-content:flex-end;margin-top:10px"><button class="btn petit danger" data-act="retirer-modele" data-i="${i}">Supprimer</button></div></section>`).join("")}</div>`;
  $("#mods").addEventListener("input", (e) => { const t = e.target; if (t.dataset.mod === undefined) return; etat.d.modeles[Number(t.dataset.mod)][t.dataset.mk] = t.value; sauver("modeles", 900); });
  $("#mods").addEventListener("change", (e) => { if (e.target.tagName === "SELECT") e.target.dispatchEvent(new Event("input", { bubbles: true })); });
}

// ======================================================================
// RÉGLAGES
// ======================================================================
function pReglages() {
  const r = etat.d.reglages;
  $("#page").innerHTML = entete("Réglages", "Accès, relances, expéditeur et état des connexions.") + `
  <div class="grille g2">
    <section class="carte"><h2>Accès à l'admin</h2><label class="champ"><span>Adresses Google autorisées (une par ligne)</span><textarea id="r-acces" rows="5">${E((r.acces || []).join("\n"))}</textarea></label>
      <p class="aide">Chaque adresse doit être un compte Google. Pour info@sylvainbrochu.ca, il faut créer un compte Google avec cette adresse (accounts.google.com, « Utiliser mon adresse e-mail actuelle »).</p></section>
    <section class="carte"><h2>Courriels</h2><div class="grille-form">
      <label class="champ"><span>Nom de l'expéditeur</span><input id="r-nom" value="${E(r.expediteurNom)}"></label>
      <label class="champ"><span>Relance après (jours)</span><input id="r-rel" type="number" min="2" max="30" value="${E(r.relanceJours)}"></label>
      <label class="champ large"><span>Copie cachée par défaut (Cci)</span><input id="r-cci" value="${E(r.cci)}"></label>
      <label class="champ large"><span>Signature</span><textarea id="r-sig" rows="4">${E(r.signature)}</textarea></label></div></section>
    <section class="carte"><h2>Connexions</h2><ul class="liste">
      <li><div class="t"><b>Stockage (Redis)</b><small>Candidatures, CV, statistiques</small></div><span class="ok-txt">Branché</span></li>
      <li><div class="t"><b>Boîte Gmail ${E(etat.mail?.boite || "")}</b><small>Lecture et envoi pour info@sylvainbrochu.ca</small></div>${etat.mail ? (etat.mail.pret ? `<span class="ok-txt">Branchée</span>` : `<span class="ko-txt">À configurer</span>`) : `<span class="aide">Vérification...</span>`}</li></ul>
      ${etat.mail && !etat.mail.pret ? blocConfigCourriel() : ""}</section>
    <section class="carte"><header><h2>Journal</h2><button class="btn petit" data-act="exporter">Exporter les données</button></header><div id="journal"><p class="vide">Chargement...</p></div></section>
  </div>
  <div class="actions" style="margin-top:16px"><button class="btn plein" data-act="sauver-reglages">Enregistrer les réglages</button></div>`;
  api("/api/donnees/?cle=journal").then((j) => { const el = $("#journal"); if (el) el.innerHTML = (j.valeur || []).length ? `<ul class="historique">${j.valeur.slice(0, 40).map((x) => `<li><time>${dateCourte(x.date)}</time><span>${E(x.quoi)} <span class="aide">(${E(x.qui)})</span></span></li>`).join("")}</ul>` : `<p class="vide">Rien pour l'instant.</p>`; }).catch(() => {});
}

// ======================================================================
// MODALE
// ======================================================================
function ouvrirModale(titre, contenu, pied, brancher) {
  const m = $("#modale");
  m.innerHTML = `<div class="fenetre" role="dialog" aria-modal="true" aria-label="${E(titre.replace(/<[^>]+>/g, ""))}"><header><h2>${titre}</h2><button class="fermer" type="button" aria-label="Fermer">&times;</button></header><div class="contenu">${contenu}</div><footer>${pied}</footer></div>`;
  m.hidden = false; document.body.style.overflow = "hidden";
  $(".fermer", m).onclick = fermerModale;
  m.onclick = (e) => { if (e.target === m) fermerModale(); };
  brancher && brancher(m);
  const premier = $("input, textarea, select", m); if (premier) premier.focus();
}
function fermerModale() { const m = $("#modale"); m.hidden = true; m.innerHTML = ""; document.body.style.overflow = ""; }
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modale").hidden) fermerModale(); });

// ======================================================================
// ACTIONS (délégation)
// ======================================================================
document.addEventListener("change", (e) => {
  const s = e.target.closest("[data-statut]");
  if (s) { const c = etat.d.candidatures.find((x) => x.id === s.dataset.statut); if (c) { changerStatut(c, s.value); rendrePage(); } }
});
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act],[data-filtre],[data-dossier],[data-ouvrir],[data-profil],[data-cv],[data-cvact],[data-jours]");
  if (!t || !etat.d) return;
  if (t.dataset.filtre) { etat.filtre = t.dataset.filtre; return pCandidatures(); }
  if (t.dataset.dossier && etat.page === "courriels" && t.tagName === "BUTTON") { etat.boite.dossier = t.dataset.dossier; etat.boite.ouvert = null; etat.boite.q = ""; return pCourriels(); }
  if (t.dataset.dossier && t.tagName === "A") { etat.boite.dossier = t.dataset.dossier; etat.boite.ouvert = null; return; }
  if (t.dataset.ouvrir) {
    const [d, u] = t.dataset.ouvrir.split(":");
    if (etat.page !== "courriels") { etat.boite.dossier = d; etat.boite.ouvert = { dossier: d, uid: Number(u) }; return; }
    return ouvrirCourriel(d, u);
  }
  if (t.dataset.profil) { etat.profilOffres = t.dataset.profil; $$("[data-profil]").forEach((b) => b.setAttribute("aria-pressed", b === t)); return listerOffres(); }
  if (t.dataset.cv) { etat.cvOnglet = t.dataset.cv; return pCV(); }
  if (t.dataset.cvact) return actionCV(t.dataset.cvact, t);
  if (t.dataset.jours) { etat.statsJours = Number(t.dataset.jours); return pStats(); }
  const a = t.dataset.act; const cand = t.dataset.id ? etat.d.candidatures.find((x) => x.id === t.dataset.id) : null;
  switch (a) {
    case "nouveau-courriel": return ouvrirComposeur({ piece: "" });
    case "nouvelle": return ficheCandidature({ id: uid(), statut: "a_preparer", type: "offre", cv: "carriere", priorite: 2, historique: [] }, true);
    case "fiche": return cand && ficheCandidature(cand);
    case "preparer": return cand && preparerCandidature(cand);
    case "relancer": return cand && preparerRelance(cand);
    case "synchro": return synchroniser();
    case "marquer-reponse": if (cand) { cand.reponseLe = jour(); cand.reponseTraitee = false; noter(cand, "Réponse reçue"); sauver("candidatures"); toast("Réponse notée."); } return;
    case "rafraichir-boite": etat.boite.listes = {}; return pCourriels();
    case "recreer-brouillons": {
      t.disabled = true; t.textContent = "Création...";
      try {
        const r = await api("/api/courriels/?action=recreerBrouillons", { method: "POST", body: {} });
        toast(r.crees.length ? `${r.crees.length} brouillon${r.crees.length > 1 ? "s" : ""} créé${r.crees.length > 1 ? "s" : ""}.` : "Tous les brouillons existent déjà.");
        etat.boite.listes = {}; return pCourriels();
      } catch (err) { t.disabled = false; t.textContent = "Recréer les brouillons manquants"; return toast(err.code === "COURRIEL_ABSENT" ? "Connexion Gmail pas encore configurée (voir Réglages)." : err.message, true); }
    }
    case "repondre": return repondre();
    case "envoyer-brouillon": {
      if (t.dataset.ok !== "1") { t.dataset.ok = "1"; t.textContent = "Confirmer l'envoi"; return; }
      t.disabled = true; t.textContent = "Envoi...";
      try {
        const r = await api("/api/courriels/?action=envoyerBrouillon", { method: "POST", body: { uid: Number(t.dataset.uid) } });
        (r.a || []).forEach((ad) => { const c = candParCourriel(ad); if (c) { if (!c.envoyeLe) c.envoyeLe = jour(); if (["a_preparer", "brouillon"].includes(c.statut)) c.statut = "envoye"; noter(c, "Brouillon envoyé depuis l'admin"); } });
        sauver("candidatures"); toast("Courriel envoyé."); etat.boite.listes = {}; etat.boite.ouvert = null; return pCourriels();
      } catch (err) { t.disabled = false; t.textContent = "Envoyer ce brouillon"; delete t.dataset.ok; return toast(err.message, true); }
    }
    case "supprimer-brouillon": {
      if (t.dataset.ok !== "1") { t.dataset.ok = "1"; t.textContent = "Confirmer la suppression"; return; }
      try { await api("/api/courriels/?action=supprimerBrouillon", { method: "POST", body: { uid: Number(t.dataset.uid) } }); toast("Brouillon supprimé."); etat.boite.listes = {}; etat.boite.ouvert = null; return pCourriels(); } catch (err) { return toast(err.message, true); }
    }
    case "creer-depuis-courriel": {
      const m = $("#lecteur")._message; const ex = m.de[0] || {};
      return ficheCandidature({ id: uid(), entreprise: domaine(ex.courriel).split(".")[0] || ex.nom, contact: ex.nom || "", courriel: ex.courriel, statut: "envoye", type: "offre", cv: "carriere", priorite: 2, objet: m.sujet, historique: [] }, true);
    }
    case "rafraichir-offres": { const el = $("#liste-off"); if (el) el.innerHTML = `<p class="vide">Recherche des offres...</p>`; etat.offres = null; return listerOffres(undefined, true); }
    case "masquer-offre": (etat.d["offres-masquees"] = etat.d["offres-masquees"] || []).push(t.dataset.oid); sauver("offres-masquees"); return listerOffres();
    case "retirer-offre": etat.d["offres-sauvees"] = (etat.d["offres-sauvees"] || []).filter((x) => x.id !== t.dataset.oid); sauver("offres-sauvees"); return listerOffres();
    case "offre-vers-cand": {
      const o = offreParId(t.dataset.oid); if (!o) return;
      const c = { id: uid(), entreprise: o.entreprise || "", poste: o.titre, ville: o.lieu || "", type: o.profil === "temporaire" ? "temporaire" : "offre", cv: o.profil === "temporaire" ? "barman" : "carriere", lien: o.url, statut: "a_preparer", priorite: 2, salaire: o.salaire || "", historique: [] };
      noter(c, `Ajoutée depuis les offres (${o.source || "ajout manuel"})`); etat.d.candidatures.unshift(c); sauver("candidatures"); toast("Ajoutée aux candidatures. Complète le courriel du recruteur dans la fiche.");
      return listerOffres();
    }
    case "ajouter-offre": return ouvrirModale("Ajouter une offre", `<div class="grille-form">
        <label class="champ large"><span>Lien de l'offre</span><input name="url" type="url" required></label><label class="champ"><span>Titre du poste</span><input name="titre"></label>
        <label class="champ"><span>Entreprise</span><input name="entreprise"></label><label class="champ"><span>Lieu</span><input name="lieu" value="Montréal"></label>
        <label class="champ"><span>Type</span><select name="profil"><option value="carriere">Carrière</option><option value="temporaire">Temporaire</option></select></label></div>`,
      `<span></span><button class="btn plein" data-m="ok">Ajouter</button>`, (m) => {
        $('[data-m="ok"]', m).onclick = () => { const o = { id: uid(), source: "Ajout manuel", date: new Date().toISOString() }; $$("[name]", m).forEach((x) => { o[x.name] = x.value.trim(); }); if (!o.url) return toast("Le lien est requis.", true); (etat.d["offres-sauvees"] = etat.d["offres-sauvees"] || []).unshift(o); sauver("offres-sauvees"); fermerModale(); etat.profilOffres = "sauvees"; pOffres(); };
      });
    case "cv-pdf": return pdfCV(false);
    case "cv-publier": return pdfCV(true);
    case "ajout-modele": etat.d.modeles.unshift({ id: uid(), nom: "Nouveau modèle", objet: "", corps: "Bonjour{contact},\n\n\n\n{signature}", cv: "" }); sauver("modeles"); return pModeles();
    case "retirer-modele": {
      if (t.dataset.ok !== "1") { t.dataset.ok = "1"; t.textContent = "Confirmer"; return; }
      etat.d.modeles.splice(Number(t.dataset.i), 1); sauver("modeles"); return pModeles();
    }
    case "sauver-reglages": {
      const r = etat.d.reglages;
      r.acces = $("#r-acces").value.split(/\n|,/).map((x) => x.trim().toLowerCase()).filter(Boolean);
      r.expediteurNom = $("#r-nom").value.trim() || "Sylvain Brochu"; r.relanceJours = Number($("#r-rel").value) || 7;
      r.cci = $("#r-cci").value.trim(); r.signature = $("#r-sig").value;
      await sauver("reglages"); toast("Réglages enregistrés."); return;
    }
    case "exporter": {
      const b = new Blob([JSON.stringify(etat.d, null, 2)], { type: "application/json" });
      const a2 = document.createElement("a"); a2.href = URL.createObjectURL(b); a2.download = `admin-sylvain-${jour()}.json`; a2.click(); return;
    }
  }
});

demarrer();
