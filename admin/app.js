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

const STATUTS = [["a_preparer", "À envoyer"], ["brouillon", "Courriel prêt"], ["envoye", "Envoyée"], ["relance", "Relancée"], ["entrevue", "Entrevue"], ["offre", "Offre reçue"], ["refus", "Refus"], ["ferme", "Fermée"]];
const NOM_STATUT = Object.fromEntries(STATUTS);
const ACTIFS = ["envoye", "relance", "entrevue", "offre"];

const etat = {
  u: null, clientId: "", d: null, page: "tableau",
  stats: null, statsJours: 30, statsT: 0, offres: null, mail: null,
  boite: { dossier: "recus", listes: {}, ouvert: null, q: "" },
  cvOnglet: "carriere", filtre: "actifs", rech: "", profilOffres: "tous", rechOffres: "", journal: null,
  offresMaj: "", // "" | "en-cours" | "erreur" : mise à jour des offres en arrière-plan
};

// Offres déjà vues dans ce navigateur : celles qui n'y sont pas sont marquées « Nouvelle » pendant toute la visite.
const VUES = (() => { try { const v = JSON.parse(localStorage.getItem("sb-offres-vues") || "null"); return v && Array.isArray(v.ids) ? { ids: new Set(v.ids), premiere: false } : { ids: new Set(), premiere: true }; } catch { return { ids: new Set(), premiere: true }; } })();
function estNouvelle(o) {
  if (o.sauvee) return false;
  if (VUES.premiere) return o.date ? Date.now() - Date.parse(o.date) < 3 * 86400e3 : false;
  return !VUES.ids.has(o.id);
}
function noterVues(offres) {
  try {
    const avant = JSON.parse(localStorage.getItem("sb-offres-vues") || "null");
    const ids = new Set(avant && Array.isArray(avant.ids) ? avant.ids : []);
    offres.forEach((o) => ids.add(o.id));
    localStorage.setItem("sb-offres-vues", JSON.stringify({ ids: [...ids].slice(-3000), t: Date.now() }));
  } catch { /* stockage indisponible : pas de marque « Nouvelle » */ }
}

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
// Pages principales, puis outils (plus discrets dans le menu).
const PAGES = [["tableau", "Aujourd'hui"], ["offres", "Offres pour moi"], ["candidatures", "Mes candidatures"], ["courriels", "Mes courriels"], ["cv", "Mon CV"], ["stats", "Visites de mon site"], ["modeles", "Mes modèles de courriels"], ["reglages", "Réglages"]];
const OUTILS = ["stats", "modeles", "reglages"];

// ---------- Calculs sur les candidatures ----------
const R = () => Number(etat.d?.reglages?.relanceJours) || 7;
function relance(c) {
  if (!["envoye", "relance"].includes(c.statut) || c.reponseLe) return null;
  const base = c.relanceFaiteLe || c.envoyeLe; if (!base) return null;
  const due = ajouterJours(base, R());
  return { due, enRetard: due <= jour(), jours: ecart(jour(), due) };
}
const nomCourt = (c) => String(c.entreprise || "").split(" (")[0];
const methode = (c) => (c.courriel ? "courriel" : c.formulaire || c.lien ? "site" : "");
// Ce que j'ai à faire pour chaque candidature, avec un seul bouton.
function aFaire() {
  const out = []; const auj = jour();
  (etat.d.candidatures || []).forEach((c) => {
    const r = relance(c); const ent = nomCourt(c);
    if (c.entrevueLe && c.entrevueLe.slice(0, 10) >= auj) out.push({ type: "entrevue", c, tri: c.entrevueLe, texte: `Mon entrevue chez ${ent}`, detail: `Le ${dateCourte(c.entrevueLe)}${c.entrevueLe.length > 10 ? " à " + c.entrevueLe.slice(11, 16) : ""}. Je relis l'offre et ma lettre avant.`, bouton: "Ouvrir" });
    if (c.reponseLe && !c.reponseTraitee && ACTIFS.includes(c.statut)) out.push({ type: "reponse", c, tri: c.reponseLe, texte: `${ent} m'a répondu`, detail: `Le ${dateCourte(c.reponseLe)}. Je lis la réponse dans mes courriels.`, bouton: "Lire la réponse" });
    if (r && r.enRetard) out.push({ type: "relance", c, tri: r.due, texte: `Relancer ${ent}`, detail: `J'ai postulé le ${dateCourte(c.envoyeLe)}, pas de réponse. Mon courriel de relance est prêt.`, bouton: "Préparer ma relance" });
    if (c.statut === "a_preparer") {
      const m = methode(c);
      out.push({ type: "postuler", c, tri: (c.echeance && c.echeance >= auj ? c.echeance : "9999") + (c.priorite || 3), texte: `Postuler chez ${ent}`, detail: `${c.poste ? posteCourt(c.poste) + ". " : ""}${m === "courriel" ? "Par courriel." : m === "site" ? "Sur le site de l'employeur." : ""}${c.echeance && c.echeance >= auj ? ` Date limite : ${dateCourte(c.echeance)}` : ""}`, bouton: "Je postule" });
    }
    if (c.statut === "brouillon") out.push({ type: "brouillon", c, tri: "9" + (c.priorite || 3), texte: `Envoyer ma candidature chez ${ent}`, detail: "Mon courriel est déjà prêt, mon CV est joint. Je le relis et je l'envoie.", bouton: "Relire et envoyer" });
  });
  const ordre = { entrevue: 0, reponse: 1, relance: 2, postuler: 3, brouillon: 4 };
  return out.sort((a, b) => ordre[a.type] - ordre[b.type] || String(a.tri).localeCompare(String(b.tri)));
}
const posteCourt = (p) => { const s = String(p || "").replace(/\s+/g, " ").trim(); return s.length > 70 ? s.slice(0, 68).replace(/\s+\S*$/, "") + "..." : s; };
function noter(c, texte) { (c.historique = c.historique || []).unshift({ date: jour(), texte }); }
const candParCourriel = (adresse) => { const a = String(adresse || "").toLowerCase(); const d = domaine(a); return (etat.d.candidatures || []).find((c) => c.courriel && (c.courriel.toLowerCase() === a || (d && !/gmail|hotmail|outlook|yahoo|videotron|icloud/.test(d) && domaine(c.courriel) === d))); };

// ---------- Démarrage ----------
// Courriels factices lus par erreur sur certaines pages d'offres (ex. serviceomp@test957.com) : on les retire.
function nettoyer() {
  const FAUX = /@(test\d*\.|example\.|exemple\.|domain\.)/i; let n = 0;
  (etat.d.candidatures || []).forEach((c) => { if (c.courriel && FAUX.test(c.courriel) && !c.envoyeLe) { c.courriel = ""; if (!c.formulaire && c.lien) c.formulaire = c.lien; n++; } });
  if (n) sauver("candidatures");
}
async function demarrer() {
  try {
    const s = await api("/api/auth/");
    etat.clientId = s.clientId;
    if (!s.stockage) return afficherConnexion("Le stockage n'est pas encore branché. L'admin sera prête dès que Redis sera ajouté au projet Vercel.");
    if (!s.connecte) return afficherConnexion();
    etat.u = s.utilisateur;
    const r = await api("/api/donnees/?cle=tout");
    etat.d = r.donnees;
    nettoyer();
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
    <h1>Ma recherche<br>d'emploi</h1>
    <p>Mes offres, mes candidatures, mes courriels de info@sylvainbrochu.ca et mon CV, au même endroit.</p>
    ${message ? `<p class="alerte">${E(message)}</p>` : ""}
    ${pasConfig ? `<p class="alerte">La connexion Google n'est pas encore configurée.</p>` : `<div id="g-btn"></div>`}
    <p class="note">Espace privé de Sylvain Brochu.</p>
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
      <a class="marque" href="#tableau"><span class="sb">SB</span><span><b>Mon espace</b><small>Ma recherche d'emploi</small></span></a>
      <nav class="onglets" aria-label="Sections">${PAGES.map(([id, nom]) => `${id === OUTILS[0] ? '<span class="groupe-nav">Outils</span>' : ""}<a href="#${id}" data-p="${id}" class="${OUTILS.includes(id) ? "outil" : ""}">${ico(id)}<span>${nom}</span><i class="compte" data-c="${id}" hidden></i></a>`).join("")}</nav>
      <div class="qui">${u.photo ? `<img src="${E(u.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${E((u.nom || u.email)[0])}</span>`}<span title="${E(u.email)}">${E(u.nom || u.email)}</span><button type="button" id="deco">Sortir</button></div>
    </aside>
    <main class="principal" id="page"></main>
  </div>`;
  $("#deco").onclick = deconnecter;
}
function majCompteurs() {
  const n = aFaire().length;
  const el = $('[data-c="tableau"]'); if (el) { el.hidden = !n; el.textContent = n; }
  const nl = (etat.boite.listes.recus || []).filter((m) => !m.lu).length;
  const em = $('[data-c="courriels"]'); if (em) { em.hidden = !nl; em.textContent = nl; }
  const no = etat.offres ? etat.offres.offres.filter((o) => estNouvelle(o) && !(etat.d["offres-masquees"] || []).includes(o.id)).length : 0;
  const eo = $('[data-c="offres"]'); if (eo) { eo.hidden = !no; eo.textContent = no; eo.title = `${no} nouvelle${no > 1 ? "s" : ""} offre${no > 1 ? "s" : ""}`; }
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
// Les offres gardées s'affichent tout de suite ; si elles ont plus d'une heure, une mise à jour part en arrière-plan.
async function chargerOffres(force = false) {
  if (!force && etat.offres) return etat.offres;
  if (force) { await mettreAJourOffres(true); return etat.offres; }
  etat.offres = await api("/api/offres/");
  if (Date.now() - Date.parse(etat.offres.maj) > 3600e3) mettreAJourOffres();
  return etat.offres;
}
let majOffresEnCours = null;
function mettreAJourOffres(attendre = false) {
  if (!majOffresEnCours) {
    etat.offresMaj = "en-cours"; afficherEtatOffres();
    majOffresEnCours = api("/api/offres/?rafraichir=1").then((r) => {
      const avant = new Set((etat.offres?.offres || []).map((o) => o.id));
      const neuves = r.offres.filter((o) => !avant.has(o.id)).length;
      etat.offres = r; etat.offresMaj = "";
      if (avant.size && neuves) toast(`${neuves} nouvelle${neuves > 1 ? "s" : ""} offre${neuves > 1 ? "s" : ""} pour moi.`);
      if (etat.page === "offres") listerOffres(); else if (etat.page === "tableau") offresAccueil();
      majCompteurs();
    }).catch(() => { etat.offresMaj = "erreur"; afficherEtatOffres(); }).finally(() => { majOffresEnCours = null; });
  }
  return attendre ? majOffresEnCours : null;
}
function afficherEtatOffres() {
  const el = $("#etat-off"); if (!el || !etat.offres && etat.offresMaj !== "en-cours") return;
  const o = etat.offres;
  el.innerHTML = etat.offresMaj === "en-cours" ? `<span class="tourne"></span> Je cherche les nouvelles offres...`
    : etat.offresMaj === "erreur" ? `Mise à jour impossible pour l'instant. Offres du ${o ? dateHeure(o.maj) : ""}.`
    : o ? `Mises à jour ${ilYa(Date.parse(o.maj))}, sur ${o.etat.filter((x) => x.ok).length} recherches.` : "";
}

// ---------- Graphique ----------
// Graphique par jour : dessiné à la largeur réelle de son cadre (texte jamais étiré), redessiné si le cadre change.
const SERIES = new Map(); let obsGraph = null;
function graphique(serie) {
  const id = "g" + uid(); SERIES.set(id, serie || []);
  requestAnimationFrame(() => tracerGraphique(id));
  return `<div class="graph-boite" id="${id}"></div>
  <p class="aide legende-graph"><span class="lg-barre"></span> Pages vues <span class="lg-ligne"></span> Visiteurs</p>`;
}
function tracerGraphique(id) {
  const el = document.getElementById(id); if (!el) { SERIES.delete(id); return; }
  const cs = getComputedStyle(el);
  el._w = el.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0); el.innerHTML = svgGraphique(SERIES.get(id), el._w || 700);
  if (!obsGraph && "ResizeObserver" in window) obsGraph = new ResizeObserver((l) => l.forEach((e) => {
    const s2 = SERIES.get(e.target.id); const w = e.contentRect.width;
    if (!e.target.isConnected) { obsGraph.unobserve(e.target); SERIES.delete(e.target.id); return; }
    if (s2 && Math.abs((e.target._w || 0) - w) > 4) { e.target._w = w; e.target.innerHTML = svgGraphique(s2, w); }
  }));
  if (obsGraph) obsGraph.observe(el);
}
function svgGraphique(serie, largeur) {
  const w = Math.max(280, Math.round(largeur)), h = 210, g = 38, droite = 8, bas = 28, haut = 12, n = serie.length || 1;
  const brut = Math.max(4, ...serie.map((x) => Math.max(x.vues || 0, x.visiteurs || 0)));
  const p10 = 10 ** Math.floor(Math.log10(brut));
  const max = [1, 2, 2.5, 5, 10].map((k) => k * p10).find((v) => v >= brut);
  const bw = (w - g - droite) / n;
  const y = (v) => h - bas - (v / max) * (h - bas - haut);
  const cx = (i) => g + i * bw + bw / 2;
  const larg = Math.max(2, Math.min(26, bw * 0.68));
  const grille = [0, 0.5, 1].map((t) => `<line x1="${g}" x2="${w - droite}" y1="${y(max * t)}" y2="${y(max * t)}" stroke="rgba(23,21,26,${t ? 0.07 : 0.18})"/><text x="${g - 8}" y="${y(max * t) + 4}" font-size="11" text-anchor="end" fill="#9a9187">${Math.round(max * t)}</text>`).join("");
  const barres = serie.map((x, i) => (x.vues ? `<rect x="${cx(i) - larg / 2}" y="${y(x.vues)}" width="${larg}" height="${Math.max(1, h - bas - y(x.vues))}" rx="2" fill="#c8a26b"><title>${dateCourte(x.date)} : ${x.vues} pages vues, ${x.visiteurs} visiteurs</title></rect>` : "")).join("");
  const ligne = `<polyline points="${serie.map((x, i) => `${cx(i)},${y(x.visiteurs || 0)}`).join(" ")}" fill="none" stroke="#17151a" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
  const points = serie.map((x, i) => (x.visiteurs ? `<circle cx="${cx(i)}" cy="${y(x.visiteurs)}" r="2.6" fill="#17151a"><title>${dateCourte(x.date)} : ${x.visiteurs} visiteurs</title></circle>` : "")).join("");
  const nbEtiq = Math.max(2, Math.floor((w - g) / 84));
  const pas = Math.max(1, Math.ceil(n / nbEtiq));
  const etiq = serie.map((x, i) => {
    if ((n - 1 - i) % pas !== 0) return ""; // on part de la fin pour que le dernier jour soit toujours affiché
    const demi = 24; // demi-largeur approximative d'une date
    const [xx, ancre] = cx(i) + demi > w - droite ? [w - droite, "end"] : cx(i) - demi < g ? [g, "start"] : [cx(i), "middle"];
    return `<text x="${xx}" y="${h - 8}" font-size="11" text-anchor="${ancre}" fill="#6b635b">${dateCourte(x.date)}</text>`;
  }).join("");
  return `<svg class="graph" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Pages vues et visiteurs par jour">${grille}${barres}${ligne}${points}${etiq}</svg>`;
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
  const entrevues = c.filter((x) => x.entrevueLe || ["entrevue", "offre"].includes(x.statut)).length;
  const taches = aFaire();
  const prenom = (etat.u.nom || "").split(" ")[0];
  const t0 = taches[0];
  const notes = typeof etat.d.notes === "string" ? etat.d.notes : "";
  const date = new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
  $("#page").innerHTML = entete(`Bonjour ${E(prenom)}`, `${date[0].toUpperCase() + date.slice(1)}. ${taches.length ? `J'ai ${taches.length} chose${taches.length > 1 ? "s" : ""} à faire.` : "Rien d'urgent aujourd'hui."}`,
    `<a class="btn" href="/" target="_blank" rel="noopener">Voir mon site</a>`) + `
  <section class="prochaine">
    <span class="etiquette">Ma prochaine étape</span>
    ${t0 ? `<h2>${E(t0.texte)}</h2><p>${E(t0.detail)}</p><div class="actions">${boutonTache(t0, true)}</div>`
      : `<h2>Choisir une offre qui me plaît</h2><p>Des offres sont cherchées pour moi chaque jour. Sur celle qui m'intéresse, je clique « Je postule » : ma lettre et mon CV sont prêts.</p><div class="actions"><a class="btn laiton grand" href="#offres">Voir les offres pour moi</a></div>`}
  </section>
  <div id="d-mails"></div>
  ${commentPostuler()}
  <div class="grille g2">
    <section class="carte"><header><h2>Ensuite</h2><a class="btn petit" href="#candidatures">Mes candidatures</a></header>
      ${taches.length > 1 ? `<ul class="liste taches">${taches.slice(1, 6).map((t) => `<li><div class="t"><b>${E(t.texte)}</b><small>${E(t.detail)}</small></div><div class="actions">${boutonTache(t)}</div></li>`).join("")}</ul>${taches.length > 6 ? `<p class="aide plus">Et ${taches.length - 6} autre${taches.length - 6 > 1 ? "s" : ""} dans <a href="#candidatures">Mes candidatures</a>.</p>` : ""}` : `<p class="vide">Rien d'autre pour l'instant.</p>`}
    </section>
    <section class="carte"><header><h2>Nouvelles offres pour moi</h2><a class="btn petit" href="#offres">Toutes les offres</a></header><div id="d-offres"><p class="vide">Je cherche les offres...</p></div></section>
  </div>
  <div class="chiffres">
    <div><b>${envoyees}</b><span>candidature${envoyees > 1 ? "s" : ""} envoyée${envoyees > 1 ? "s" : ""}</span></div>
    <div><b>${reponses}</b><span>réponse${reponses > 1 ? "s" : ""} reçue${reponses > 1 ? "s" : ""}</span></div>
    <div><b>${entrevues}</b><span>entrevue${entrevues > 1 ? "s" : ""}</span></div>
    <div><b id="k-vis">-</b><span>visiteurs sur mon site, 30 jours</span></div>
    <div><b id="k-cv">-</b><span>CV téléchargés, 30 jours</span></div>
  </div>
  <details class="carte notes-carte" ${notes.trim() ? "open" : ""}><summary><h2>Mes notes</h2><span class="aide">Enregistrées automatiquement</span></summary>
    <textarea class="notes-libres" id="notes" placeholder="Contacts à appeler, idées, suivis...">${E(notes)}</textarea></details>`;
  $("#notes").oninput = (e) => { etat.d.notes = e.target.value; sauver("notes", 900); };
  const me = $(".mode-emploi"); if (me) me.ontoggle = () => { try { localStorage.setItem("sb-mode-emploi", me.open ? "ouvert" : "ferme"); } catch { /* stockage indisponible */ } };
  chargerStats(30).then((s) => {
    if (etat.page !== "tableau") return;
    $("#k-vis").textContent = s.totaux.visiteurs; $("#k-cv").textContent = s.totaux.cv;
  }).catch(() => {});
  if (etat.mail?.pret) chargerBoite("recus").then(courrielsAccueil).catch(() => {});
  chargerOffres().then(offresAccueil).catch((e) => { const el = $("#d-offres"); if (el) el.innerHTML = `<p class="vide">${E(e.message)}</p>`; });
}
function courrielsAccueil(l) {
  const el = $("#d-mails"); if (!el || etat.page !== "tableau") return;
  const nl = (l || []).filter((m) => !m.lu);
  el.innerHTML = nl.length ? `<div class="bandeau-info"><span><b>J'ai ${nl.length} nouveau${nl.length > 1 ? "x" : ""} courriel${nl.length > 1 ? "s" : ""}</b> sur info@sylvainbrochu.ca${nl[0] ? ` : ${E(nl[0].de[0]?.nom || nl[0].de[0]?.courriel || "")}, « ${E(nl[0].sujet)} »` : ""}${nl.length > 1 ? "..." : ""}</span><a class="btn petit plein" href="#courriels">Lire mes courriels</a></div>` : "";
}
function offresAccueil() {
  const el = $("#d-offres"); if (!el || etat.page !== "tableau" || !etat.offres) return;
  const masq = new Set(etat.d["offres-masquees"] || []);
  const liees = new Set((etat.d.candidatures || []).map((c) => c.lien).filter(Boolean));
  const dispo = etat.offres.offres.filter((x) => !masq.has(x.id) && !liees.has(x.url));
  const neuves = dispo.filter(estNouvelle).sort((a, b) => (a.profil === "carriere" ? 0 : 1) - (b.profil === "carriere" ? 0 : 1));
  const l = (neuves.length ? neuves : dispo).slice(0, 5);
  el.innerHTML = (neuves.length ? `<p class="aide">${neuves.length} nouvelle${neuves.length > 1 ? "s" : ""} depuis ma dernière visite.</p>` : `<p class="aide">Pas de nouvelle offre depuis ma dernière visite. Les plus récentes :</p>`)
    + (l.length ? `<ul class="liste">${l.map((x) => `<li><div class="t"><b>${E(x.titre)}</b><small>${E(x.entreprise || "")}${x.lieu ? " | " + E(x.lieu) : ""} | ${x.profil === "temporaire" ? "Bar et service" : "Carrière"}</small></div><div class="actions"><button class="btn petit laiton" data-act="offre-vers-cand" data-oid="${x.id}">Je postule</button></div></li>`).join("")}</ul>` : `<p class="vide">Aucune offre pour l'instant.</p>`);
}
function commentPostuler() {
  let ferme = false; try { ferme = localStorage.getItem("sb-mode-emploi") === "ferme"; } catch { /* stockage indisponible */ }
  return `<details class="carte mode-emploi" ${ferme ? "" : "open"}>
    <summary><h2>Comment je postule</h2><span class="aide">3 étapes, tout est préparé pour moi</span></summary>
    <ol class="trois">
      <li><b>Je choisis une offre</b><span>Dans <a href="#offres">Offres pour moi</a>, je clique « Je postule » sur celle qui m'intéresse.</span></li>
      <li><b>Je suis le guide</b><span><b class="m-courriel">Par courriel</b> : mon courriel est prêt, mon CV est joint, je le relis et je l'envoie.<br><b class="m-site">Sur le site de l'employeur</b> : je copie ma lettre, je télécharge mon CV, j'ouvre le formulaire et je les colle.</span></li>
      <li><b>C'est envoyé</b><span>Pour un site, je clique « J'ai postulé ». Sans réponse après ${R()} jours, je vois ici « Relancer » avec le courriel déjà écrit.</span></li>
    </ol></details>`;
}
function boutonTache(t, grand = false) {
  const g = grand ? " grand" : " petit";
  if (t.type === "relance") return `<button class="btn laiton${g}" data-act="relancer" data-id="${t.c.id}">${t.bouton}</button>`;
  if (t.type === "reponse") return `<button class="btn laiton${g}" data-act="lire-reponse" data-id="${t.c.id}">${t.bouton}</button>`;
  if (t.type === "brouillon") return `<button class="btn laiton${g}" data-act="voir-brouillon" data-id="${t.c.id}">${t.bouton}</button>`;
  if (t.type === "postuler") return `<button class="btn laiton${g}" data-act="fiche" data-id="${t.c.id}">${t.bouton}</button>`;
  return `<button class="btn${g}" data-act="fiche" data-id="${t.c.id}">${t.bouton || "Ouvrir"}</button>`;
}

// ======================================================================
// CANDIDATURES
// ======================================================================
function pCandidatures() {
  const toutes = etat.d.candidatures || [];
  const parC = new Map(); aFaire().forEach((t) => { if (!parC.has(t.c.id)) parC.set(t.c.id, t); });
  const compte = (f) => toutes.filter(f).length;
  const FILTRES = [
    ["actifs", "En cours", (c) => !["refus", "ferme"].includes(c.statut)],
    ["a_faire", "À faire maintenant", (c) => parC.has(c.id)],
    ["a_envoyer", "À envoyer", (c) => ["a_preparer", "brouillon"].includes(c.statut)],
    ["envoyees", "Envoyées", (c) => ["envoye", "relance"].includes(c.statut)],
    ["entrevues", "Entrevues et offres", (c) => ["entrevue", "offre"].includes(c.statut)],
    ["terminees", "Terminées", (c) => ["refus", "ferme"].includes(c.statut)],
    ["tout", "Tout", () => true]];
  const f = FILTRES.find((x) => x[0] === etat.filtre) || FILTRES[0];
  const q = etat.rech.toLowerCase();
  const ordre = { entrevue: 0, reponse: 1, relance: 2, postuler: 3, brouillon: 4 };
  const liste = toutes.filter(f[2]).filter((c) => !q || `${c.entreprise} ${c.poste} ${c.ville} ${c.courriel}`.toLowerCase().includes(q))
    .sort((a, b) => (parC.has(a.id) ? ordre[parC.get(a.id).type] : 9) - (parC.has(b.id) ? ordre[parC.get(b.id).type] : 9) || (a.priorite || 3) - (b.priorite || 3) || String(b.envoyeLe || "").localeCompare(String(a.envoyeLe || "")));
  const suite = (c) => {
    const t = parC.get(c.id);
    if (t) return `<div class="suite"><span>${E(t.type === "postuler" ? (methode(c) === "courriel" ? "Postuler par courriel" : methode(c) === "site" ? "Postuler sur le site" : "Postuler") : t.type === "brouillon" ? "Mon courriel est prêt à envoyer" : t.type === "relance" ? "Relancer, pas de réponse" : t.type === "reponse" ? "Lire la réponse" : "Entrevue " + dateCourte(c.entrevueLe))}</span>${boutonTache(t)}</div>`;
    const r = relance(c);
    if (r) return `<span class="aide">J'attends une réponse. Relance le ${dateCourte(r.due)}.</span>`;
    if (c.statut === "offre") return `<span class="aide">Offre reçue.</span>`;
    if (["refus", "ferme"].includes(c.statut)) return `<span class="aide">Terminée.</span>`;
    return `<span class="aide">-</span>`;
  };
  $("#page").innerHTML = entete("Mes candidatures", "Toutes mes candidatures et la prochaine étape pour chacune.",
    `<button class="btn" data-act="synchro" title="Retrouve dans Gmail mes envois, mes relances et les réponses reçues">Vérifier mes envois et réponses</button><button class="btn laiton" data-act="nouvelle">Ajouter une candidature</button>`) + `
  <div class="filtres">${FILTRES.map(([k, n, fn]) => `<button type="button" data-filtre="${k}" aria-pressed="${k === f[0]}">${n} <b>${compte(fn)}</b></button>`).join("")}</div>
  <div class="barre-outils"><input class="recherche" type="search" id="rech" placeholder="Chercher une entreprise, un poste..." value="${E(etat.rech)}"><span class="aide">${liste.length} candidature${liste.length > 1 ? "s" : ""}</span></div>
  <div class="tableau-wrap"><table class="tab tab-cand"><thead><tr><th>Entreprise et poste</th><th>Où j'en suis</th><th>Envoyée le</th><th>Prochaine étape</th><th></th></tr></thead><tbody>
  ${liste.map((c) => `<tr>
    <td class="ent"><b>${E(c.entreprise)}</b><small>${E(posteCourt(c.poste))}${c.ville ? " | " + E(c.ville) : ""}${c.echeance && c.echeance >= jour() ? ` | <span class="${ecart(jour(), c.echeance) <= 7 ? "ko-txt" : ""}">limite ${dateCourte(c.echeance)}</span>` : ""}</small></td>
    <td><select data-statut="${c.id}" aria-label="Où j'en suis">${STATUTS.map(([k, n]) => `<option value="${k}" ${k === c.statut ? "selected" : ""}>${n}</option>`).join("")}</select></td>
    <td>${c.envoyeLe ? dateCourte(c.envoyeLe) : '<span class="aide">-</span>'}</td>
    <td>${suite(c)}</td>
    <td><div class="actions" style="flex-wrap:nowrap;justify-content:flex-end"><button class="btn petit" data-act="fiche" data-id="${c.id}">Ouvrir</button><button class="btn petit lien danger" data-act="supprimer-cand" data-id="${c.id}" title="Supprimer cette candidature" aria-label="Supprimer la candidature ${E(c.entreprise)}">Supprimer</button></div></td></tr>`).join("") || `<tr><td colspan="5" class="vide" style="text-align:center;padding:30px">Aucune candidature ici.${f[0] === "actifs" ? ` <a href="#offres">Voir les offres pour moi</a>` : ""}</td></tr>`}
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

const detailsEssayes = new Set(); // une lecture automatique par fiche et par session
const cvDe = (c) => (c.cv === "barman" ? { v: "barman", nom: "barman", fichier: "Sylvain-Brochu-CV-Bar.pdf" } : { v: "carriere", nom: "carrière", fichier: "Sylvain-Brochu-CV.pdf" });
// Le guide en haut de la fiche : comment je postule à cette offre, étape par étape, avec les boutons au bon endroit.
function guidePostuler(c) {
  const cv = cvDe(c);
  const boutonCV = `<a class="btn petit" href="/api/cv/?v=${cv.v}" download="${cv.fichier}">Télécharger mon CV</a>`;
  if (["envoye", "relance", "entrevue", "offre", "refus", "ferme"].includes(c.statut)) {
    const r = relance(c);
    const quoi = c.statut === "entrevue" ? `J'ai une entrevue${c.entrevueLe ? ` le ${dateCourte(c.entrevueLe)}${c.entrevueLe.length > 10 ? " à " + c.entrevueLe.slice(11, 16) : ""}` : ""}.` : c.statut === "offre" ? "J'ai reçu une offre." : ["refus", "ferme"].includes(c.statut) ? "Cette candidature est terminée." : c.reponseLe ? `${E(nomCourt(c))} m'a répondu le ${dateCourte(c.reponseLe)}.` : r ? `Si personne ne répond, je relance le ${dateCourte(r.due)}.` : "";
    return `<div class="guide fait"><b>${c.envoyeLe ? `J'ai postulé le ${dateCourte(c.envoyeLe)}.` : "Candidature envoyée."}</b> ${quoi}
      ${["envoye", "relance"].includes(c.statut) ? `<div class="actions">${c.courriel ? `<button type="button" class="btn petit${r && r.enRetard ? " laiton" : ""}" data-m="relancer">Relancer maintenant</button>` : ""}${!c.reponseLe ? `<button type="button" class="btn petit" data-m="reponse">J'ai eu une réponse</button>` : ""}<button type="button" class="btn petit" data-m="entrevue">J'ai une entrevue</button></div>` : ""}</div>`;
  }
  if (c.statut === "brouillon" && c.courriel) return `<div class="guide g-courriel"><span class="mode">Je postule par courriel</span>
    <p><b>Mon courriel est déjà prêt</b>, adressé à ${E(c.courriel)}, avec mon CV ${cv.nom} joint.</p>
    <ol class="pas"><li><span>J'ouvre mon courriel et je le relis.</span><button type="button" class="btn laiton" data-m="brouillon-voir">Ouvrir mon courriel</button></li>
    <li><span>Je clique « Envoyer ce brouillon ». C'est noté tout seul.</span></li></ol></div>`;
  if (c.courriel) return `<div class="guide g-courriel"><span class="mode">Je postule par courriel</span>
    <p>À <b>${E(c.courriel)}</b>, depuis info@sylvainbrochu.ca.</p>
    <ol class="pas"><li><span>Je relis ma lettre, plus bas.</span></li>
    <li><span>Mon courriel se prépare avec ma lettre et mon CV ${cv.nom} joint. Je vérifie, puis j'envoie.</span><button type="button" class="btn laiton" data-m="courriel">Préparer mon courriel</button></li></ol>
    <p class="aide">Déjà envoyé d'une autre façon ? <button type="button" class="btn lien" data-m="envoyee">J'ai postulé</button></p></div>`;
  if (c.formulaire || c.lien) return `<div class="guide g-site"><span class="mode">Je postule sur le site de l'employeur</span>
    <ol class="pas">
      <li><span>Je copie ma lettre.</span><button type="button" class="btn" data-m="copier">Copier ma lettre</button></li>
      <li><span>Je télécharge mon CV ${cv.nom}.</span>${boutonCV}</li>
      <li><span>J'ouvre le formulaire, je colle ma lettre (Cmd+V) et je joins mon CV.</span><button type="button" class="btn laiton" data-m="site">Ouvrir le formulaire</button></li>
      <li><span>Quand c'est envoyé :</span><button type="button" class="btn plein" data-m="envoyee">J'ai postulé</button></li>
    </ol></div>`;
  return `<div class="guide g-inconnu"><span class="mode">Comment postuler ?</span><p>L'offre ne dit pas encore comment postuler. J'ouvre l'offre pour trouver le courriel ou le lien du formulaire, puis je l'ajoute dans « Détails de la candidature », plus bas.</p></div>`;
}
const blocOffre = (c, ouvert = false) => (c.description ? `<details class="texte-offre" ${ouvert ? "open" : ""}><summary>Le texte de l'offre${c.contrat ? ` (${E(c.contrat)})` : ""}${c.salaire ? ` | ${E(c.salaire)}` : ""}</summary><div class="corps-offre">${E(c.description)}</div></details>` : "");
function ficheCandidature(c, nouvelle = false) {
  const v = (k) => E(c[k] || "");
  const aPostuler = ["a_preparer", "brouillon"].includes(c.statut);
  const lecture = !nouvelle && c.lien && !c.description && aPostuler && !detailsEssayes.has(c.id);
  const cv = cvDe(c);
  const lettreOuverte = nouvelle || c.statut === "a_preparer";
  ouvrirModale(nouvelle ? "Ajouter une candidature" : `${E(nomCourt(c))}${c.poste ? `<small>${E(posteCourt(c.poste))}</small>` : ""}`, `
    <div id="guide-post" data-cid="${E(c.id)}">${lecture ? `<div class="guide"><span class="mode"><span class="tourne"></span> Je lis l'offre...</span><p>La fiche se remplit toute seule : texte de l'offre, ma lettre et la façon de postuler.</p></div>` : nouvelle ? "" : guidePostuler(c)}</div>
    ${lettreOuverte ? "" : `<details class="details-fiche"><summary>Ma lettre${c.statut === "brouillon" ? " (déjà dans mon courriel prêt)" : " (envoyée)"}</summary>`}
    <section class="lettre">${lettreOuverte ? "<h3>Ma lettre</h3>" : ""}
      <label class="champ"><span>Objet du courriel</span><input name="objet" value="${v("objet")}"></label>
      <label class="champ"><span>Texte</span><textarea name="texte" rows="12">${v("texte")}</textarea></label>
      <div class="actions">${c.lien && lettreOuverte ? `<button type="button" class="btn petit" data-m="refaire">Refaire ma lettre à partir de l'offre</button>` : ""}<a class="btn petit" href="/api/cv/?v=${cv.v}" target="_blank" rel="noopener">Voir mon CV ${cv.nom}</a></div>
    </section>${lettreOuverte ? "" : "</details>"}
    <div id="texte-offre">${blocOffre(c)}</div>
    <details class="details-fiche" data-details="infos" ${nouvelle ? "open" : ""}><summary>Détails de la candidature</summary>
    <div class="grille-form">
      <label class="champ"><span>Entreprise</span><input name="entreprise" value="${v("entreprise")}" required></label>
      <label class="champ"><span>Poste</span><input name="poste" value="${v("poste")}"></label>
      <label class="champ"><span>Ville</span><input name="ville" value="${v("ville")}"></label>
      <label class="champ"><span>Où j'en suis</span><select name="statut">${STATUTS.map(([k, n]) => `<option value="${k}" ${c.statut === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="champ large"><span>Courriel du recruteur (si je postule par courriel)</span><input name="courriel" type="email" value="${v("courriel")}"></label>
      <label class="champ large"><span>Lien du formulaire (si je postule sur le site)</span><input name="formulaire" type="url" value="${v("formulaire")}"></label>
      <label class="champ large"><span>Lien de l'offre</span><input name="lien" type="url" value="${v("lien")}"></label>
      <label class="champ"><span>Nom du contact</span><input name="contact" value="${v("contact")}" placeholder="Pour le « Bonjour »"></label>
      <label class="champ"><span>CV à joindre</span><select name="cv"><option value="carriere" ${c.cv !== "barman" ? "selected" : ""}>Mon CV carrière</option><option value="barman" ${c.cv === "barman" ? "selected" : ""}>Mon CV barman</option></select></label>
      <label class="champ"><span>Type</span><select name="type">${[["offre", "Offre publiée"], ["spontanee", "Candidature spontanée"], ["temporaire", "Emploi temporaire"]].map(([k, n]) => `<option value="${k}" ${c.type === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="champ"><span>Priorité</span><select name="priorite">${[[1, "Haute"], [2, "Normale"], [3, "Basse"]].map(([p, n]) => `<option value="${p}" ${Number(c.priorite || 2) === p ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="champ"><span>Date limite</span><input name="echeance" type="date" value="${v("echeance")}"></label>
      <label class="champ"><span>Salaire</span><input name="salaire" value="${v("salaire")}"></label>
      <label class="champ"><span>Envoyée le</span><input name="envoyeLe" type="date" value="${E((c.envoyeLe || "").slice(0, 10))}"></label>
      <label class="champ"><span>Réponse reçue le</span><input name="reponseLe" type="date" value="${E((c.reponseLe || "").slice(0, 10))}"></label>
      <label class="champ"><span>Entrevue</span><input name="entrevueLe" type="datetime-local" value="${E((c.entrevueLe || "").slice(0, 16))}"></label>
      <label class="champ large"><span>Mes notes</span><textarea name="note" rows="3">${v("note")}</textarea></label>
    </div></details>
    ${c.historique?.length ? `<details class="details-fiche"><summary>Historique</summary><ul class="historique">${c.historique.slice(0, 12).map((h) => `<li><time>${dateCourte(h.date)}</time><span>${E(h.texte)}</span></li>`).join("")}</ul></details>` : ""}`,
  `<div class="actions">${!nouvelle ? `<button type="button" class="btn lien danger" data-m="supprimer">Supprimer</button>` : ""}${c.lien ? `<a class="btn" href="${E(c.lien)}" target="_blank" rel="noopener">Voir l'offre</a>` : ""}</div>
   <div class="actions"><button type="button" class="btn plein" data-m="enregistrer">${nouvelle ? "Ajouter" : "Enregistrer et fermer"}</button></div>`,
  (racine) => {
    const lire = () => { $$("[name]", racine).forEach((el) => { c[el.name] = el.name === "priorite" ? Number(el.value) : el.value.trim(); }); };
    let modifie = false;
    racine.addEventListener("input", (e) => {
      modifie = true;
      if (["courriel", "formulaire", "lien"].includes(e.target.name)) { const copie = { ...c }; $$("[name]", racine).forEach((el) => { copie[el.name] = el.value.trim(); }); $("#guide-post").innerHTML = copie.courriel || copie.formulaire || copie.lien ? guidePostuler(copie) : ""; }
    });
    const majFiche = () => { $("#guide-post").innerHTML = guidePostuler(c); };
    racine.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-m]"); if (!b) return;
      const m = b.dataset.m;
      if (m === "copier") { const t = $('[name="texte"]', racine).value; return toast(t ? ((await copier(avecSignature(t))) ? "Ma lettre est copiée. Je la colle dans le formulaire (Cmd+V)." : "Copie impossible : je sélectionne le texte à la main.") : "Ma lettre est vide.", !t); }
      if (m === "refaire") {
        lire(); b.disabled = true; b.textContent = "Je lis l'offre...";
        try { if (!c.description) await remplirDepuisOffre(c); const l = lettrePour(c); $('[name="texte"]', racine).value = l.texte; $('[name="objet"]', racine).value = l.objet; toast("Ma lettre est refaite à partir de l'offre. Je la relis avant d'envoyer."); }
        catch (err) { toast(err.message, true); }
        b.disabled = false; b.textContent = "Refaire ma lettre à partir de l'offre"; return;
      }
      if (m === "site") { lire(); sauver("candidatures"); return postulerSite(c); }
      if (m === "envoyee") {
        if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "Oui, c'est envoyé"; return; }
        lire(); marquerEnvoyee(c); fermerModale(); return rendrePage();
      }
      if (m === "courriel") {
        lire(); sauver("candidatures");
        if (etat.mail && !etat.mail.pret) return ouvrirMessagerie(c);
        fermerModale(); return preparerCandidature(c);
      }
      if (m === "brouillon-voir") { lire(); sauver("candidatures"); fermerModale(); return voirBrouillon(c); }
      if (m === "relancer") { fermerModale(); return preparerRelance(c); }
      if (m === "reponse") { c.reponseLe = jour(); c.reponseTraitee = true; noter(c, "Réponse reçue"); sauver("candidatures"); toast("C'est noté : j'ai eu une réponse."); return majFiche(); }
      if (m === "entrevue") {
        const d = $('[data-details="infos"]', racine); d.open = true;
        $('[name="statut"]', racine).value = "entrevue"; const ch = $('[name="entrevueLe"]', racine); ch.focus(); ch.scrollIntoView({ block: "center" });
        return toast("J'indique la date de l'entrevue, puis « Enregistrer et fermer ».");
      }
      if (m === "enregistrer") {
        const ancien = (etat.d.candidatures.find((x) => x.id === c.id) || {}).statut;
        lire(); if (!c.entreprise) { $('[data-details="infos"]', racine).open = true; return toast("J'indique au moins le nom de l'entreprise.", true); }
        if (nouvelle) { c.id = c.id || uid(); noter(c, "Fiche créée"); etat.d.candidatures.unshift(c); }
        else if (ancien && ancien !== c.statut) noter(c, `Statut : ${NOM_STATUT[ancien]} vers ${NOM_STATUT[c.statut]}`);
        if (c.statut === "envoye" && !c.envoyeLe) c.envoyeLe = jour();
        sauver("candidatures"); fermerModale(); rendrePage(); return toast(nouvelle ? "Candidature ajoutée." : "C'est enregistré.");
      }
      if (m === "supprimer") {
        if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "Oui, supprimer"; b.classList.add("plein-danger"); return; }
        etat.d.candidatures = etat.d.candidatures.filter((x) => x.id !== c.id); sauver("candidatures"); fermerModale(); rendrePage(); return toast("Candidature supprimée.");
      }
    });
    if (lecture) {
      detailsEssayes.add(c.id);
      const copie = { ...c };
      remplirDepuisOffre(copie).then(() => {
        Object.assign(c, Object.fromEntries(Object.entries(copie).filter(([k, val]) => val && !String(c[k] || "").trim())), { description: copie.description, methode: copie.methode, contrat: copie.contrat });
        sauver("candidatures");
        if ($("#guide-post")?.dataset.cid !== c.id) return; // fiche fermée entre-temps
        if (!modifie) return ficheCandidature(c);
        $$("[name]", racine).forEach((el) => { if (!el.value && copie[el.name]) el.value = copie[el.name]; });
        majFiche();
        $("#texte-offre").innerHTML = blocOffre(c);
      }).catch((err) => {
        const l = lettrePour(c); let n = 0;
        if (!c.texte) { c.texte = l.texte; n++; } if (!c.objet) { c.objet = l.objet; n++; }
        if (!c.courriel && !c.formulaire) { c.formulaire = c.lien; n++; }
        if (n) sauver("candidatures");
        if ($("#guide-post")?.dataset.cid !== c.id) return;
        $$("[name]", racine).forEach((el) => { if (!el.value && c[el.name]) el.value = c[el.name]; });
        $("#guide-post").innerHTML = `<p class="aide">L'offre n'a pas pu être lue automatiquement (${E(err.message)}). Les étapes restent les mêmes :</p>` + guidePostuler(c);
      });
    }
  });
}
// Boîte info@ pas branchée : ma propre messagerie s'ouvre avec le courriel déjà écrit.
function ouvrirMessagerie(c) {
  const texte = avecSignature(c.texte || lettrePour(c).texte);
  location.href = `mailto:${encodeURIComponent(c.courriel)}?subject=${encodeURIComponent(c.objet || lettrePour(c).objet)}&body=${encodeURIComponent(texte)}`;
  toast("Ma messagerie s'ouvre avec le courriel écrit. J'y joins mon CV (« Télécharger mon CV »), j'envoie, puis je clique « J'ai postulé ».");
}
// Ouvre le brouillon de cette candidature dans Mes courriels.
async function voirBrouillon(c) {
  if (etat.mail && !etat.mail.pret) { toast("Ma boîte info@ n'est pas encore branchée : je prépare le courriel depuis la fiche.", true); return ficheCandidature(c); }
  toast("J'ouvre mon courriel...");
  try {
    const l = await chargerBoite("brouillons", true);
    const a = String(c.courriel || "").toLowerCase();
    const m = l.find((x) => (x.a || []).some((y) => String(y.courriel || "").toLowerCase() === a));
    etat.boite.dossier = "brouillons"; etat.boite.q = ""; etat.boite.ouvert = m ? { dossier: "brouillons", uid: m.uid } : null;
    if (etat.page === "courriels") pCourriels(); else location.hash = "#courriels";
    if (!m) toast("Je ne retrouve pas ce brouillon : je le prépare à nouveau depuis la fiche (« Préparer mon courriel »).", true);
  } catch (err) { toast(err.message, true); }
}

const remplir = (t, c = {}) => String(t || "")
  .replaceAll("{entreprise}", c.entreprise || "votre entreprise").replaceAll("{poste}", c.poste || "votre poste")
  .replaceAll("{contact}", c.contact ? " " + c.contact : "").replaceAll("{envoyeLe}", c.envoyeLe ? dateCourte(c.envoyeLe) : "récemment")
  .replaceAll("{signature}", etat.d.reglages.signature || "");

// ---------- Lettre adaptée à chaque offre ----------
// Les phrases viennent des deux CV de Sylvain ; on garde celles qui répondent aux mots de l'offre.
const POINTS = {
  carriere: [
    [/(exposition|musée|musee|muséal|galerie|commissaire)/gi, "Chez Age of Union / Never Apart, j'ai planifié et livré plus de 35 expositions et projets culturels, jusqu'à 10 expositions simultanées dans une dizaine de salles."],
    [/(fabrication|atelier|décor|decor|scénograph|scenograph|accessoire|menuiserie|installation|prototyp)/gi, "Fondateur d'Even Even Design, j'ai dirigé pendant dix ans un réseau de sous-traitants (soudeurs, découpe CNC, souffleurs de verre, monteurs), de la conception à l'installation."],
    [/(budget|coûts|couts|achats|approvisionnement|fournisseur|négoci|negoci)/gi, "Je gère les budgets de production, les achats et les fournisseurs : pour les accessoires du spectacle du Grand Prix de Formule 1, j'ai négocié les prix et optimisé l'assemblage pour tenir le budget et l'échéancier."],
    [/(tournée|tournee|international|expédition|expedition|transport|douane|logistique)/gi, "Au Cirque du Soleil, j'ai géré fournisseurs, échéanciers et expéditions internationales (palettes, carnets ATA), et préparé les costumes en tournée internationale avec Varekai."],
    [/(spectacle|scène|scene|théâtre|theatre|cirque|arts vivants|diffusion)/gi, "J'ai travaillé huit ans au Cirque du Soleil, du siège social à la tournée Varekai, et sur les premières de LOVE à Las Vegas et de Corteo à New York."],
    [/(événement|evenement|évènement|festival|congrès|congres|corporatif)/gi, "En événementiel, j'ai organisé de grands événements culturels jusqu'à 1 000 invités : logistique, fournisseurs, licences, budget et calendrier."],
    [/(équipe|equipe|supervis|diriger|encadr|gestion du personnel)/gi, "J'ai dirigé 3 employés à temps plein, environ 5 assistants monteurs, des artisans et des sous-traitants."],
    [/(bâtiment|batiment|immeuble|entretien|maintenance|gestion des lieux)/gi, "J'ai aussi assuré la gestion opérationnelle d'un bâtiment et de son entretien."],
    [/(hôtel|hotel|restaura|hôtellerie|hotellerie)/gi, "J'ai créé une centaine de luminaires sur mesure pour l'hôtel-boutique Maison Grinder, des chambres au restaurant, et dirigé l'installation."],
    [/(anglais|bilingue|english)/gi, "Je travaille en français et en anglais."],
    [/(\bsap\b|excel|suite office|google workspace)/gi, "J'utilise SAP, Excel et Google Workspace au quotidien."],
  ],
  temporaire: [
    [/(cocktail|mixolog|barman|barmaid|bartender|\bbar\b)/gi, "Barman principal au Parking pendant trois ans, je prépare des cocktails classiques et originaux et je tiens un service rapide en volume."],
    [/(haut de gamme|luxe|raffiné|raffine|gastronom|hôtel|hotel|prestige)/gi, "J'ai servi en salle et au bar dans un cadre hôtelier raffiné (Vauvert, Hôtel St-Paul) et lors de réceptions privées haut de gamme."],
    [/(vin\b|vins\b|œnolog|oenolog|sommelier|spiritueux)/gi, "Je soigne la présentation des plats et des vins, avec un service attentif et discret."],
    [/(banquet|buffet|réception|reception|traiteur|événement|evenement|congrès)/gi, "Chez Foran Événement, j'ai supervisé 175 serveurs et 10 superviseurs pour 1 500 invités au Marché Bonsecours, et je monte salles de banquet et buffets."],
    [/(caisse|paiement|point de vente|encaiss)/gi, "Je suis à l'aise avec la gestion des caisses et leur fermeture."],
    [/(superviseur|responsable|chef d'équipe|gérant|gerant|maître d'hôtel|maitre d'hotel)/gi, "J'ai l'habitude de diriger une équipe de service sur le plancher et de régler les imprévus."],
    [/(pression|rapide|volume|achalandé|rythme)/gi, "Je garde mon calme sous pression, même en grand volume."],
    [/(anglais|bilingue|english)/gi, "Je travaille en français et en anglais."],
  ],
};
const joli = (s) => { s = String(s || "").trim(); return s.length > 3 && s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : s; };
function posteNet(p) {
  let s = String(p || "")
    .replace(/\s*[,|]\s*(temps (plein|partiel)|part[- ]?time|full[- ]?time|contrat.*|permanent.*|saisonnier.*|sur appel.*|occasionnel.*)$/i, "")
    .replace(/\s+-\s+(.*)$/, (m, suite) => (/^(événements?|évènements?|evenements?|production|spectacles?|expositions?|festivals?|logistique|opérations|banquets?|service|salle|bar)\b/i.test(suite) ? " " + suite : ""))
    .replace(/\s*\((e|ée|euse|se|trice|rice|ère|s|h\/f|f\/h|m\/f|f\/m)\)/gi, "")
    .replace(/[·•](e|rice|trice|euse|se|ère|s)\b/gi, "")
    .replace(/([\p{L}-]+)\s*\/\s*[\p{L}-]+/gu, "$1")
    .replace(/\s+/g, " ").trim();
  if (s.length > 3 && s === s.toUpperCase()) s = s.toLowerCase();
  s = s.replace(/\b(Bar|Banquets?|Service|Salle|Restaurant|Production|Projets?|Événements?|Évènements?|Opérations|Logistique|Spectacles?|Exposition|Atelier|Fabrication|Technique|Gestionnaire|Directeur|Directrice|Coordonnateur|Coordonnatrice|Responsable|Chargé|Chargée)\b/gu, (m, w, i) => (i === 0 ? m : m.toLowerCase()));
  return /^\p{Lu}\p{Ll}/u.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}
function lettrePour(c) {
  const temp = c.type === "temporaire" || c.cv === "barman";
  const source = `${c.poste || ""} ${c.description || ""}`;
  const choix = POINTS[temp ? "temporaire" : "carriere"]
    .map(([re, phrase], i) => ({ i, phrase, n: (source.match(re) || []).length }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3).sort((a, b) => a.i - b.i).map((x) => x.phrase);
  const poste = posteNet(c.poste) || (temp ? "service" : "gestion de production");
  const chez = c.entreprise ? ` chez ${joli(c.entreprise.split(" (")[0])}` : "";
  const intro = temp
    ? "J'ai plus de 10 ans d'expérience au bar, en salle et en service événementiel à Montréal, du Parking au Club de Golf Métropolitain."
    : "Gestionnaire de production et de projets, j'ai plus de 25 ans d'expérience en événementiel, en arts vivants et en fabrication sur mesure, du Cirque du Soleil au Grand Prix de Formule 1.";
  const defaut = temp ? "J'ai supervisé des équipes de service lors d'événements jusqu'à 1 500 invités." : "J'ai dirigé pendant dix ans Even Even Design et son réseau de sous-traitants, puis géré les opérations du centre Never Apart, avec plus de 35 expositions livrées.";
  const points = choix.length ? choix : [defaut];
  const fin = temp ? "Je suis disponible rapidement. Mon CV est joint." : "Mon CV est joint, et mes projets sont présentés sur www.sylvainbrochu.ca. J'aimerais beaucoup en discuter avec vous.";
  const texte = `Bonjour${c.contact ? " " + c.contact : ""},\n\nJe vous propose ma candidature au poste de ${poste}${chez}${chez.endsWith(".") ? "" : "."}\n\n${intro} ${points.slice(0, 2).join(" ")}${points[2] ? "\n\n" + points[2] : ""}\n\n${fin}\n\nCordialement,\n\n${etat.d.reglages.signature || ""}`;
  return { objet: `Candidature, ${poste} - Sylvain Brochu`, texte };
}
// Lit l'offre (texte complet, courriel, date limite, lien pour postuler) et complète la fiche sans écraser ce qui est déjà rempli.
async function remplirDepuisOffre(c, forcerLettre = false) {
  if (!c.lien) return c;
  const d = await api(`/api/offres/?detail=${encodeURIComponent(c.lien)}&titre=${encodeURIComponent(c.poste || "")}`);
  if (typeof d.description !== "string") throw new Error("lecture des offres pas encore disponible");
  const vide = (k) => !String(c[k] || "").trim();
  if (vide("entreprise") && d.entreprise) c.entreprise = d.entreprise;
  if (vide("poste") && d.titre) c.poste = d.titre;
  if (vide("ville") && d.lieu) c.ville = d.lieu;
  if (vide("salaire") && d.salaire) c.salaire = d.salaire;
  if (vide("echeance") && d.echeance) c.echeance = d.echeance;
  if (vide("courriel") && d.courriel) c.courriel = d.courriel;
  if (vide("formulaire") && !c.courriel) c.formulaire = d.postuler || c.lien;
  c.description = d.description || c.description || "";
  c.contrat = c.contrat || d.contrat || "";
  c.methode = c.courriel ? "courriel" : "site";
  if (forcerLettre || vide("texte")) { const l = lettrePour(c); c.texte = l.texte; if (forcerLettre || vide("objet")) c.objet = l.objet; }
  if (vide("objet")) c.objet = lettrePour(c).objet;
  return c;
}
const avecSignature = (t) => { const sig = etat.d.reglages.signature || ""; return sig && t && !t.includes(sig.split("\n")[0] + "\n") ? `${t.trimEnd()}\n\n${sig}` : t; };
async function copier(t) { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } }
// Candidature par le site de l'employeur : la lettre est copiée, le site s'ouvre, puis on marque l'envoi.
async function postulerSite(c) {
  const lien = c.formulaire || c.lien; if (!lien) return toast("Ajoute le lien du formulaire dans la fiche.", true);
  const ok = c.texte ? await copier(avecSignature(c.texte)) : false;
  window.open(lien, "_blank", "noopener");
  if (!c.ouvertLe) { c.ouvertLe = jour(); noter(c, "Site de l'employeur ouvert pour postuler"); sauver("candidatures"); }
  toast(ok ? "Ma lettre est copiée. Dans le formulaire : je la colle (Cmd+V), je joins mon CV, j'envoie, puis je reviens cliquer « J'ai postulé »." : "Le formulaire s'ouvre. J'y mets ma lettre et mon CV, j'envoie, puis je reviens cliquer « J'ai postulé ».");
}
function marquerEnvoyee(c) {
  if (!c.envoyeLe) c.envoyeLe = jour();
  noter(c, c.courriel ? "Marquée envoyée" : "Envoyée sur le site de l'employeur");
  c.statut = "envoye"; sauver("candidatures"); toast(`C'est noté : j'ai postulé chez ${nomCourt(c)}. Sans réponse dans ${R()} jours, je verrai « Relancer ».`);
}

function preparerCandidature(c) {
  if (!c.courriel && (c.formulaire || c.lien)) return postulerSite(c);
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
  if (!cands.length) return toast("Aucune de mes candidatures n'a d'adresse courriel.");
  toast("Je vérifie mes envois et réponses dans Gmail...");
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
    <p class="aide">Envoyé depuis <b>${E(reg.expediteurNom)} &lt;${E(reg.expediteur)}&gt;</b>${c ? ` | Candidature : <b>${E(nomCourt(c))}</b>` : ""}</p>
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
  `<span class="aide">Pas prêt ? « Garder en brouillon » : je le retrouve dans Mes courriels, Brouillons.</span>
   <div class="actions"><button class="btn" data-m="brouillon">Garder en brouillon</button><button class="btn laiton" data-m="envoyer">${c && !o.relance ? "Envoyer ma candidature" : o.relance ? "Envoyer ma relance" : "Envoyer"}</button></div>`,
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
      try { await api("/api/courriels/?action=brouillon", { method: "POST", body: await message() }); apres(false); fermerModale(); toast("Mon courriel est gardé dans mes brouillons."); delete etat.boite.listes.brouillons; rendrePage(); }
      catch (err) { b.disabled = false; b.textContent = "Garder en brouillon"; toast(err.code === "COURRIEL_ABSENT" ? "Connexion Gmail pas encore configurée (voir Réglages)." : err.message, true); }
    };
    $('[data-m="envoyer"]', racine).onclick = async (e) => {
      const b = e.currentTarget; const m = await message().catch((err) => { toast(err.message, true); return null; }); if (!m) return;
      if (!m.a.trim()) return toast("J'indique à qui envoyer (champ « À »).", true);
      if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.classList.add("laiton"); b.textContent = `Oui, envoyer à ${m.a.split(/[,;]/)[0].trim()}`; return; }
      b.disabled = true; b.textContent = "Envoi...";
      try { await api("/api/courriels/?action=envoyer", { method: "POST", body: m }); apres(true); fermerModale(); toast(c ? `Ma candidature est envoyée à ${nomCourt(c)}.` : "Mon courriel est envoyé."); delete etat.boite.listes.envoyes; rendrePage(); }
      catch (err) { b.disabled = false; b.textContent = "Réessayer l'envoi"; delete b.dataset.ok; toast(err.message, true); }
    };
  });
}

// ======================================================================
// COURRIELS
// ======================================================================
function blocConfigCourriel(court = false) {
  return `<div class="config"><h3>Ma boîte info@ n'est pas encore branchée</h3>
  ${court ? `<p class="aide">Mika s'en occupe. En attendant, « Préparer mon courriel » ouvre ma propre messagerie.</p>` : `<p class="aide">Mika s'en occupe. En attendant, « Préparer mon courriel » ouvre ma propre messagerie avec le courriel déjà écrit. Pour Mika :</p><ol>
    <li>Dans le compte Google <b>${E(etat.mail?.boite || "massivemedias@gmail.com")}</b>, ouvrir <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">Mots de passe des applications</a> et en créer un nommé « Admin Sylvain ».</li>
    <li>Dans Vercel, projet <b>sylvainbrochu.ca</b> : Settings, Environment Variables, ajouter <code>MAIL_APP_PASSWORD</code> avec ce mot de passe (Production).</li>
    <li>Redéployer le projet. La boîte s'affiche ici.</li></ol>
  <p class="aide">${E(etat.mail?.raison || "")}</p>`}</div>`;
}
function pCourriels() {
  const b = etat.boite;
  if (etat.mail && !etat.mail.pret) { $("#page").innerHTML = entete("Mes courriels", "Ma boîte info@sylvainbrochu.ca.") + blocConfigCourriel(); return; }
  $("#page").innerHTML = entete("Mes courriels", "Ce que je reçois sur info@sylvainbrochu.ca, ce que j'ai envoyé et mes courriels prêts à partir (brouillons).",
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
  $("#page").innerHTML = entete("Offres pour moi", "Des offres en production, en événementiel et en bar ou service, cherchées pour moi chaque jour sur une quinzaine de sites d'emploi du grand Montréal. Sur celle qui m'intéresse, je clique « Je postule ».",
    `<button class="btn" data-act="ajouter-offre">J'ajoute une offre trouvée ailleurs</button><button class="btn" data-act="rafraichir-offres">Chercher maintenant</button>`) + `
  <div class="filtres" id="filtres-off"></div>
  <div class="barre-outils"><input class="recherche" type="search" id="rech-off" placeholder="Filtrer par mot (production, bar...)" value="${E(etat.rechOffres)}"><span class="aide" id="etat-off"></span></div>
  <div class="offres" id="liste-off"><p class="vide"><span class="tourne"></span> Je cherche les offres...</p></div>
  <details class="carte plus-loin" id="det-carte"><summary><h2>Voir les offres sur la carte</h2><span class="aide" id="geo-etat"></span></summary>
    <div id="carte-off" class="carte-geo" role="region" aria-label="Carte des offres d'emploi"></div>
    <p class="aide legende"><span class="pt pt-c"></span> Carrière <span class="pt pt-t"></span> Bar et service <span class="pt pt-v"></span> Pâle : position de la ville (adresse pas encore trouvée)</p></details>
  <details class="carte plus-loin"><summary><h2>Chercher moi-même sur d'autres sites</h2><span class="aide">Indeed, LinkedIn, Guichet-Emplois</span></summary>
    <div class="liens-rapides">${["carriere", "temporaire"].map((p) => `<div class="groupe"><h4>${p === "carriere" ? "Carrière" : "Bar et service"}</h4>${RECHERCHES[p].map((q) => `<div style="margin-bottom:6px"><b style="font-size:.84rem">${E(q)}</b><br>${SITES.filter(([n]) => p === "temporaire" || n !== "Hôtellerie Jobs").map(([n, f]) => `<a href="${E(f(q))}" target="_blank" rel="noopener" style="display:inline;margin-right:8px">${n}</a>`).join("")}</div>`).join("")}</div>`).join("")}</div>
    <p class="aide" style="margin-top:10px">Indeed et LinkedIn ne laissent pas lire leurs offres automatiquement : ces liens ouvrent leurs recherches, les plus récentes d'abord. Si je trouve une offre, « J'ajoute une offre trouvée ailleurs ».</p></details>
  <details class="carte plus-loin"><summary><h2>Mes profils sur les sites d'emploi</h2><span class="aide">${(etat.d.plateformes || []).filter((p) => p.profilCree).length}/${(etat.d.plateformes || []).length} faits</span></summary>
    <p class="aide">Je crée mon compte sur chaque site et j'y mets mon CV, puis je coche ici.</p>
    <ul class="liste">${(etat.d.plateformes || []).map((p, i) => `<li><div class="t"><b><a href="${E(p.compte)}" target="_blank" rel="noopener">${E(p.nom)}</a></b><small>CV conseillé : ${p.profil === "barman" ? "barman" : "carrière"}</small></div>
      <div class="actions"><label class="aide"><input type="checkbox" data-plat="${i}" data-k="profilCree" ${p.profilCree ? "checked" : ""}> Mon compte est créé</label>
      <select class="choix" data-plat="${i}" data-k="cvTeleverse"><option value="">CV pas encore mis</option><option value="carriere" ${p.cvTeleverse === "carriere" ? "selected" : ""}>Mon CV carrière y est</option><option value="barman" ${p.cvTeleverse === "barman" ? "selected" : ""}>Mon CV barman y est</option></select></div></li>`).join("")}</ul></details>`;
  $("#rech-off").oninput = (e) => { etat.rechOffres = e.target.value; listerOffres(); };
  $$("[data-plat]").forEach((el) => { el.onchange = () => { const p = etat.d.plateformes[el.dataset.plat]; p[el.dataset.k] = el.type === "checkbox" ? el.checked : el.value; sauver("plateformes"); }; });
  $("#det-carte").ontoggle = (e) => { if (e.target.open) { etat.carteCadree = false; majCarte(($("#liste-off") || {})._offres || []); if (etat.offres?.geoAttente > 0) localiserOffres(); } };
  listerOffres();
}
async function listerOffres(masq = new Set(etat.d["offres-masquees"] || []), force = false) {
  const el = $("#liste-off"); if (!el) return;
  let o;
  try { o = await chargerOffres(force); } catch (e) { el.innerHTML = `<p class="vide">Je n'arrive pas à charger les offres pour l'instant (${E(e.message)}). <button class="btn petit" data-act="rafraichir-offres">Réessayer</button></p>`; return; }
  if (etat.page !== "offres") return;
  afficherEtatOffres();
  const sauvees = (etat.d["offres-sauvees"] || []).map((x) => ({ ...x, sauvee: true }));
  const toutes = [...sauvees, ...o.offres.filter((x) => !masq.has(x.id))];
  const FILTRES = [["tous", "Toutes", () => true], ["nouvelles", "Nouvelles", estNouvelle], ["carriere", "Carrière", (x) => x.profil === "carriere"], ["temporaire", "Bar et service", (x) => x.profil === "temporaire"], ["sauvees", "Ajoutées par moi", (x) => x.sauvee]];
  const f = FILTRES.find((x) => x[0] === etat.profilOffres) || FILTRES[0];
  $("#filtres-off").innerHTML = FILTRES.map(([k, n, fn]) => `<button type="button" data-profil="${k}" aria-pressed="${k === f[0]}">${n} <b>${toutes.filter(fn).length}</b></button>`).join("");
  let l = toutes.filter(f[2]);
  const q = etat.rechOffres.toLowerCase();
  if (q) l = l.filter((x) => `${x.titre} ${x.entreprise} ${x.lieu} ${x.resume}`.toLowerCase().includes(q));
  l.sort((a, b) => (estNouvelle(b) ? 1 : 0) - (estNouvelle(a) ? 1 : 0) || String(b.date || "").localeCompare(String(a.date || "")));
  const liees = new Map((etat.d.candidatures || []).filter((c) => c.lien).map((c) => [c.lien, c]));
  if ($("#det-carte")?.open) { etat.carteCadree = false; majCarte(l); if (o.geoAttente > 0) localiserOffres(); }
  el.innerHTML = l.length ? l.map((x) => { const c = liees.get(x.url); const neuve = estNouvelle(x); return `<article class="offre${neuve ? " neuve" : ""}"><div>
      <h3>${neuve ? `<span class="pastille p-neuve">Nouvelle</span> ` : ""}<a href="${E(x.url)}" target="_blank" rel="noopener">${E(x.titre)}</a></h3>
      <div class="m"><span><b>${E(x.entreprise || "")}</b></span>${x.lieu ? `<span>${E(x.lieu)}</span>` : ""}${x.contrat ? `<span>${E(x.contrat)}</span>` : ""}${x.salaire ? `<span>${E(x.salaire)}</span>` : ""}${x.date ? `<span>${dateCourte(x.date)}</span>` : ""}<span class="pastille ${x.profil === "temporaire" ? "p-brouillon" : "p-envoye"}">${x.profil === "temporaire" ? "Bar et service" : "Carrière"}</span></div></div>
    <div class="actions">${c ? `<button class="btn petit" data-act="fiche" data-id="${c.id}">Dans mes candidatures</button>` : `<button class="btn laiton" data-act="offre-vers-cand" data-oid="${x.id}">Je postule</button>`}<button class="btn petit" data-act="lire-offre" data-oid="${x.id}">Lire l'offre</button>${x.sauvee ? `<button class="btn petit lien danger" data-act="retirer-offre" data-oid="${x.id}">Retirer</button>` : `<button class="btn petit lien" data-act="masquer-offre" data-oid="${x.id}" title="Je ne verrai plus cette offre">Pas pour moi</button>`}</div>
    ${x.resume ? `<p>${E(x.resume)}</p>` : ""}<div class="detail-offre" id="det-${x.id}" hidden></div></article>`; }).join("")
    : `<p class="vide">${f[0] === "nouvelles" ? "Pas de nouvelle offre depuis ma dernière visite." : f[0] === "sauvees" ? "Je n'ai pas encore ajouté d'offre moi-même." : "Aucune offre ici."}</p>`;
  el._offres = l;
  noterVues(o.offres);
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
  $("#page").innerHTML = entete("Mon CV", v === "carriere" ? "Mon CV carrière est celui de mon site. « Publier sur mon site » remplace le PDF que les visiteurs téléchargent, et celui joint à mes courriels." : "Mon CV barman sert aux emplois en bar et service. Il n'est jamais affiché sur mon site, seulement joint à mes courriels.",
    `<a class="btn" href="/api/cv/?v=${v}" target="_blank" rel="noopener">Voir mon CV actuel</a><button class="btn" data-act="cv-pdf">Télécharger ce PDF</button><button class="btn plein" data-act="cv-publier">${v === "carriere" ? "Publier sur mon site" : "L'utiliser dans mes courriels"}</button>`) + `
  <div class="filtres">${[["carriere", "Mon CV carrière (sur mon site)"], ["barman", "Mon CV barman (privé)"]].map(([k, n]) => `<button type="button" data-cv="${k}" aria-pressed="${k === v}">${n}</button>`).join("")}</div>
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
    toast(v === "carriere" ? `Mon CV est publié sur mon site (${r.pages} pages). Il est aussi joint à mes prochains courriels.` : `Mon CV barman est enregistré (${r.pages} page${r.pages > 1 ? "s" : ""}). Il sera joint à mes courriels pour le bar et le service.`);
  } catch (e) { toast("PDF impossible : " + e.message, true); }
}

// ======================================================================
// STATISTIQUES
// ======================================================================
let minuteurLive = null;
function pStats() {
  $("#page").innerHTML = entete("Visites de mon site", "Qui visite sylvainbrochu.ca, d'où et quelles pages. Les robots et mes propres visites ici ne sont pas comptés.",
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
  $("#page").innerHTML = entete("Mes modèles de courriels", "Mes textes prêts pour les candidatures, relances et remerciements. Ces mots se remplacent tout seuls : {entreprise}, {poste}, {contact}, {envoyeLe}, {signature}.",
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
  $("#page").innerHTML = entete("Réglages", "Qui a accès, délai de relance, ma signature et l'état des connexions.") + `
  <div class="grille g2">
    <section class="carte"><h2>Qui a accès à mon espace</h2><label class="champ"><span>Adresses Google autorisées (une par ligne)</span><textarea id="r-acces" rows="5">${E((r.acces || []).join("\n"))}</textarea></label>
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
  // Le focus va sur la fenêtre (pas sur un champ : évite d'ouvrir le clavier sur téléphone et de surligner un champ).
  const f = $(".fenetre", m); f.tabIndex = -1; f.focus({ preventScroll: true });
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
    case "supprimer-cand": {
      if (!cand) return;
      if (t.dataset.ok !== "1") { t.dataset.ok = "1"; t.textContent = "Confirmer"; t.classList.add("plein-danger"); setTimeout(() => { if (t.isConnected) { delete t.dataset.ok; t.textContent = "Supprimer"; t.classList.remove("plein-danger"); } }, 4000); return; }
      etat.d.candidatures = etat.d.candidatures.filter((x) => x.id !== cand.id); sauver("candidatures"); toast(`Candidature ${cand.entreprise} supprimée.`); return rendrePage();
    }
    case "envoyee": {
      if (!cand) return;
      if (t.dataset.ok !== "1") { t.dataset.ok = "1"; t.textContent = "Confirmer"; return; }
      marquerEnvoyee(cand); return rendrePage();
    }
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
    case "rafraichir-offres": { if (!etat.offres) return listerOffres(); const avant = etat.offres.maj; await mettreAJourOffres(true); if (etat.offres && etat.offres.maj === avant) toast(`Les offres sont déjà à jour (${ilYa(Date.parse(avant))}).`); return; }
    case "lire-reponse": {
      if (!cand) return;
      cand.reponseTraitee = true; sauver("candidatures");
      etat.boite.dossier = "recus"; etat.boite.q = cand.courriel || nomCourt(cand); etat.boite.ouvert = null; delete etat.boite.listes.recus;
      if (etat.page === "courriels") return pCourriels(); location.hash = "#courriels"; return;
    }
    case "voir-brouillon": return cand && voirBrouillon(cand);
    case "lire-offre": {
      const o = offreParId(t.dataset.oid); const box = document.getElementById("det-" + t.dataset.oid); if (!o || !box) return;
      if (!box.hidden) { box.hidden = true; t.textContent = "Lire l'offre"; return; }
      box.hidden = false; t.textContent = "Fermer l'offre"; box.innerHTML = `<p class="aide"><span class="tourne"></span> Je lis l'offre...</p>`;
      try {
        const d = await api(`/api/offres/?detail=${encodeURIComponent(o.url)}&titre=${encodeURIComponent(o.titre || "")}`);
        const infos = [d.salaire && `Salaire : ${d.salaire}`, d.contrat && `Contrat : ${d.contrat}`, d.echeance && `Date limite : ${dateCourte(d.echeance)}`].filter(Boolean);
        box.innerHTML = `<div class="guide ${d.courriel ? "g-courriel" : "g-site"}"><span class="mode">${d.courriel ? "On postule par courriel" : "On postule sur le site de l'employeur"}</span>${d.courriel ? `<p>À ${E(d.courriel)}</p>` : ""}${infos.length ? `<p>${infos.map(E).join(" | ")}</p>` : ""}</div>
          <div class="corps-offre">${E(d.description || "Le texte n'a pas pu être lu : j'ouvre l'offre avec son titre.")}</div>`;
      } catch (err) { box.innerHTML = `<p class="vide">${E(err.message)}</p>`; }
      return;
    }
    case "masquer-offre": (etat.d["offres-masquees"] = etat.d["offres-masquees"] || []).push(t.dataset.oid); sauver("offres-masquees"); toast("C'est noté : je ne verrai plus cette offre."); majCompteurs(); return listerOffres();
    case "retirer-offre": etat.d["offres-sauvees"] = (etat.d["offres-sauvees"] || []).filter((x) => x.id !== t.dataset.oid); sauver("offres-sauvees"); return listerOffres();
    case "offre-vers-cand": {
      const o = offreParId(t.dataset.oid); if (!o) return;
      const c = { id: uid(), entreprise: o.entreprise || "", poste: o.titre, ville: o.lieu || "", type: o.profil === "temporaire" ? "temporaire" : "offre", cv: o.profil === "temporaire" ? "barman" : "carriere", lien: o.url, statut: "a_preparer", priorite: 2, salaire: o.salaire || "", historique: [] };
      noter(c, `Ajoutée depuis les offres (${o.source || "ajout manuel"})`); etat.d.candidatures.unshift(c); sauver("candidatures");
      if (etat.page === "tableau") offresAccueil(); else listerOffres();
      return ficheCandidature(c);
    }
    case "ajouter-offre": return ouvrirModale("J'ajoute une offre", `<p class="aide">Une offre trouvée ailleurs (Indeed, LinkedIn, un ami...). Je colle son lien.</p><div class="grille-form">
        <label class="champ large"><span>Lien de l'offre</span><input name="url" type="url" required></label><label class="champ"><span>Titre du poste</span><input name="titre"></label>
        <label class="champ"><span>Entreprise</span><input name="entreprise"></label><label class="champ"><span>Lieu</span><input name="lieu" value="Montréal"></label>
        <label class="champ"><span>Type</span><select name="profil"><option value="carriere">Carrière</option><option value="temporaire">Bar et service</option></select></label></div>`,
      `<span></span><button class="btn plein" data-m="ok">Ajouter</button>`, (m) => {
        $('[data-m="ok"]', m).onclick = () => { const o = { id: uid(), source: "Ajout manuel", date: new Date().toISOString() }; $$("[name]", m).forEach((x) => { o[x.name] = x.value.trim(); }); if (!o.url) return toast("Je colle le lien de l'offre.", true); (etat.d["offres-sauvees"] = etat.d["offres-sauvees"] || []).unshift(o); sauver("offres-sauvees"); fermerModale(); etat.profilOffres = "sauvees"; pOffres(); };
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
