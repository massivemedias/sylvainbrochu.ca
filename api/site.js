// /api/site : « Mon site », l'éditeur des pages du site dans l'admin (connecté seulement).
//   GET  ?action=etat                 l'éditeur est-il branché (jeton GitHub présent) ?
//   GET  ?action=pages                liste des pages modifiables
//   GET  ?action=page&chemin=<f>      code HTML d'une page + son empreinte (sha)
//   POST ?action=photo                { chemin, donnees: dataURL } : envoie une photo, renvoie son empreinte
//   POST ?action=publier              { fichiers: [{ chemin, contenu, sha }], photos: [{ chemin, sha }], message }
//   GET  ?action=menu                 l'ordre et les noms des onglets du menu (FR et EN ensemble)
//   POST ?action=menu                 { entrees } : applique le menu aux ~77 pages du site, en un seul commit
//   GET  ?action=blocs&chemin=<f>     les grandes sections d'une page (ordre, masquage, page jumelle)
//   POST ?action=blocs                { chemin, ordre, masques, sorties, aussiEn } : réorganise la page et déplace des sections vers d'autres pages
// Publier = un commit sur la branche main du dépôt ; Vercel remet le site en ligne tout seul (environ une minute).
// Sans jeton GitHub mais en local (SB_LOCAL=1), les pages sont lues et écrites dans un dossier (SB_SITE_DIR).
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { exiger } from "./_lib/auth.js";
import { lireJSON, ecrireJSON } from "./_lib/kv.js";
import { entreesDepuisHtml, fusionner, reecrirePage, verifier } from "./_lib/menu.js";
import { apercu, appliquer, decouper, inserer, jumeau } from "./_lib/blocs.js";
import { corps, erreur, json, parametres } from "./_lib/util.js";

const DEPOT = process.env.GITHUB_REPO || "massivemedias/sylvainbrochu.ca";
const BRANCHE = process.env.GITHUB_BRANCH || "main";
const JETON = process.env.GITHUB_TOKEN || "";
const LOCAL = !JETON && process.env.SB_LOCAL === "1";
const DOSSIER_LOCAL = process.env.SB_SITE_DIR || process.cwd();

// Pages qu'on ne modifie pas ici : l'admin, les fonctions, et les fiches de la boutique (remplies par « Ma boutique »).
const EXCLUS = /^(admin|api|node_modules|outils|\.)|^(onomiko\/boutique|en\/onomiko\/shop)\/(?!index\.html$)/;
const PAGE_OK = (c) => typeof c === "string" && /^[a-z0-9][a-z0-9/_-]*\/index\.html$|^index\.html$/.test(c) && !c.includes("..") && !EXCLUS.test(c);
// Le menu, lui, est sur TOUTES les pages du site, fiches de la boutique et 404 comprises.
const MENU_OK = (c) => typeof c === "string" && /^[a-z0-9][a-z0-9/_-]*\/index\.html$|^index\.html$|^404\.html$/.test(c) && !c.includes("..") && !/^(admin|api|node_modules|outils|\.)/.test(c);
const PHOTO_OK = (c) => typeof c === "string" && /^img\/cms\/[a-z0-9-]+\.(webp|jpg)$/.test(c);

const shaGit = (buf) => createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
const refus = (statut, message) => Object.assign(new Error(message), { statut });

async function gh(chemin, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${DEPOT}${chemin}`, {
    method: opts.method || "GET",
    headers: { Authorization: `Bearer ${JETON}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "sylvainbrochu-admin", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`GitHub ${r.status} : ${j.message || r.statusText}`); e.gh = r.status; throw e; }
  return j;
}

// ---------- Lecture ----------
async function listerPages() {
  if (LOCAL) {
    const out = [];
    const marcher = async (rel) => {
      for (const n of await fs.readdir(path.join(DOSSIER_LOCAL, rel), { withFileTypes: true })) {
        const c = rel ? `${rel}/${n.name}` : n.name;
        if (n.isDirectory()) { if (!/^(admin|api|node_modules|outils|img|\.)/.test(c)) await marcher(c); } else if (PAGE_OK(c)) out.push(c);
      }
    };
    await marcher("");
    return out.sort();
  }
  const t = await gh(`/git/trees/${BRANCHE}?recursive=1`);
  return t.tree.filter((x) => x.type === "blob" && PAGE_OK(x.path)).map((x) => x.path).sort();
}

async function lirePage(chemin) {
  if (LOCAL) {
    const buf = await fs.readFile(path.join(DOSSIER_LOCAL, chemin));
    return { contenu: buf.toString("utf8"), sha: shaGit(buf) };
  }
  const j = await gh(`/contents/${chemin.split("/").map(encodeURIComponent).join("/")}?ref=${BRANCHE}`);
  return { contenu: Buffer.from(j.content, "base64").toString("utf8"), sha: j.sha };
}

// ---------- Photos ----------
const enAttenteLocal = new Map(); // sha -> octets (mode local seulement)
async function envoyerPhoto(b) {
  if (!PHOTO_OK(b.chemin)) throw refus(400, "Nom de photo invalide.");
  const m = /^data:image\/(webp|jpeg);base64,(.+)$/s.exec(String(b.donnees || ""));
  if (!m) throw refus(400, "Format de photo non pris en charge.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 3_000_000) throw refus(413, "Photo trop lourde.");
  if (LOCAL) { const sha = shaGit(buf); enAttenteLocal.set(sha, buf); return { sha }; }
  const r = await gh("/git/blobs", { method: "POST", body: { content: m[2], encoding: "base64" } });
  return { sha: r.sha };
}

// ---------- Publication ----------
async function publier(b, qui, okChemin = PAGE_OK) {
  const fichiers = Array.isArray(b.fichiers) ? b.fichiers : [];
  const photos = Array.isArray(b.photos) ? b.photos : [];
  if (!fichiers.length && !photos.length) throw refus(400, "Rien à publier.");
  for (const f of fichiers) {
    if (!okChemin(f.chemin) || typeof f.contenu !== "string" || f.contenu.length < 200 || !/<\/html>\s*$/i.test(f.contenu)) throw refus(400, `Page invalide : ${f.chemin}`);
  }
  for (const p of photos) if (!PHOTO_OK(p.chemin) || !/^[0-9a-f]{40}$/.test(String(p.sha || ""))) throw refus(400, "Photo invalide.");
  const message = String(b.message || "Mise à jour du site depuis l'admin").replace(/\s+/g, " ").slice(0, 200) + `\n\nPublié depuis l'admin par ${qui}`;

  if (LOCAL) {
    for (const f of fichiers) {
      const actuel = shaGit(await fs.readFile(path.join(DOSSIER_LOCAL, f.chemin)));
      if (f.sha && actuel !== f.sha) throw refus(409, "Cette page a été modifiée ailleurs entre-temps. Recharge-la, puis refais ta correction.");
    }
    for (const p of photos) {
      const buf = enAttenteLocal.get(p.sha); if (!buf) throw refus(400, "Photo introuvable, ajoute-la de nouveau.");
      await fs.mkdir(path.dirname(path.join(DOSSIER_LOCAL, p.chemin)), { recursive: true });
      await fs.writeFile(path.join(DOSSIER_LOCAL, p.chemin), buf);
    }
    const shas = {};
    for (const f of fichiers) { const buf = Buffer.from(f.contenu, "utf8"); await fs.writeFile(path.join(DOSSIER_LOCAL, f.chemin), buf); shas[f.chemin] = shaGit(buf); }
    return { ok: true, commit: "local", shas };
  }

  // Jusqu'à 3 essais si quelqu'un d'autre publie au même moment.
  for (let essai = 0; ; essai++) {
    const ref = await gh(`/git/ref/heads/${BRANCHE}`);
    const tete = ref.object.sha;
    const commit = await gh(`/git/commits/${tete}`);
    for (const f of fichiers) {
      if (!f.sha) continue;
      const j = await gh(`/contents/${f.chemin.split("/").map(encodeURIComponent).join("/")}?ref=${tete}`);
      if (j.sha !== f.sha) throw refus(409, "Cette page a été modifiée ailleurs entre-temps. Recharge-la, puis refais ta correction.");
    }
    const arbre = await gh("/git/trees", { method: "POST", body: {
      base_tree: commit.tree.sha,
      tree: [
        ...fichiers.map((f) => ({ path: f.chemin, mode: "100644", type: "blob", content: f.contenu })),
        ...photos.map((p) => ({ path: p.chemin, mode: "100644", type: "blob", sha: p.sha })),
      ],
    } });
    const nouveau = await gh("/git/commits", { method: "POST", body: { message, tree: arbre.sha, parents: [tete] } });
    try {
      await gh(`/git/refs/heads/${BRANCHE}`, { method: "PATCH", body: { sha: nouveau.sha, force: false } });
    } catch (e) {
      if (e.gh === 422 && essai < 2) continue;
      throw e;
    }
    const shas = {};
    for (const f of fichiers) shas[f.chemin] = shaGit(Buffer.from(f.contenu, "utf8"));
    return { ok: true, commit: nouveau.sha, shas };
  }
}


// ---------- Menu (toutes les pages d'un coup) ----------
const CLE_MENU = "sb:menu";
const ACCUEIL_FR = "index.html", ACCUEIL_EN = "en/index.html";

// 77 pages : lues en parallèle par petits paquets, sinon c'est trop long.
async function lireToutesLesPages() {
  if (LOCAL) {
    const pages = [];
    const marcher = async (rel) => {
      for (const n of await fs.readdir(path.join(DOSSIER_LOCAL, rel), { withFileTypes: true })) {
        const c = rel ? `${rel}/${n.name}` : n.name;
        if (n.isDirectory()) { if (!/^(admin|api|node_modules|outils|img|\.)/.test(c)) await marcher(c); }
        else if (MENU_OK(c)) { const buf = await fs.readFile(path.join(DOSSIER_LOCAL, c)); pages.push({ chemin: c, sha: shaGit(buf), contenu: buf.toString("utf8") }); }
      }
    };
    await marcher("");
    return pages;
  }
  const arbre = await gh(`/git/trees/${BRANCHE}?recursive=1`);
  const blobs = arbre.tree.filter((x) => x.type === "blob" && MENU_OK(x.path));
  const pages = [];
  for (let i = 0; i < blobs.length; i += 10) {
    const paquet = await Promise.all(blobs.slice(i, i + 10).map(async (x) => {
      const j = await gh(`/git/blobs/${x.sha}`);
      return { chemin: x.path, sha: x.sha, contenu: Buffer.from(j.content, "base64").toString("utf8") };
    }));
    pages.push(...paquet);
  }
  return pages;
}

// La structure vient toujours des pages (source de vérité) ; Redis ne garde que
// l'ordre voulu, les noms choisis et ce qui est masqué.
async function menuActuel() {
  const fr = (await lirePage(ACCUEIL_FR)).contenu;
  const en = (await lirePage(ACCUEIL_EN)).contenu;
  const duSite = entreesDepuisHtml(fr, en);
  let enregistre = null;
  try { enregistre = await lireJSON(CLE_MENU, null); } catch { /* sans Redis : on part des pages */ }
  return fusionner(enregistre, duSite);
}

async function publierMenu(b, qui) {
  const reference = await menuActuel();
  let entrees;
  try { entrees = verifier(b.entrees, reference); } catch (e) { throw refus(400, e.message); }
  const pages = await lireToutesLesPages();
  const fichiers = [];
  for (const p of pages) {
    const neuf = reecrirePage(p.contenu, p.chemin, entrees);
    // Pas de sha ici : les pages viennent d'être lues, les revérifier une par une ferait 77 appels de plus.
    if (neuf !== p.contenu) fichiers.push({ chemin: p.chemin, contenu: neuf });
  }
  try { await ecrireJSON(CLE_MENU, entrees); } catch { /* sans Redis : le HTML suffit */ }
  if (!fichiers.length) return { ok: true, pages: 0, entrees, rien: true };
  const r = await publier({ fichiers, photos: [], message: "Mon site : ordre du menu" }, qui, MENU_OK);
  return { ok: true, pages: fichiers.length, entrees, commit: r.commit };
}


// ---------- Blocs (les grandes sections d'une page) ----------
async function lireBlocs(chemin) {
  const { contenu } = await lirePage(chemin);
  const d = decouper(contenu);
  if (!d) throw refus(400, "Cette page n'a pas de sections repérables.");
  return { contenu, d };
}

async function blocsDeLaPage(chemin) {
  const { contenu, d } = await lireBlocs(chemin);
  const j = jumeau(contenu, chemin);
  let jumelle = null;
  if (j && PAGE_OK(j)) {
    try {
      const autre = await lireBlocs(j);
      jumelle = { chemin: j, nb: autre.d.blocs.length, alignee: autre.d.blocs.length === d.blocs.length };
    } catch { jumelle = null; }
  }
  return { chemin, blocs: apercu(d), jumelle };
}

// L'identifiant du bloc de même rang sur la page jumelle.
const memeRang = (source, cible, id) => {
  const n = source.blocs.findIndex((b) => b.id === id);
  return n < 0 || !cible.blocs[n] ? null : cible.blocs[n].id;
};

async function publierBlocs(b, qui) {
  const chemin = String(b.chemin || "");
  if (!PAGE_OK(chemin)) throw refus(400, "Page invalide.");
  const ordre = Array.isArray(b.ordre) ? b.ordre.map(String) : [];
  const masques = Array.isArray(b.masques) ? b.masques.map(String) : [];
  const sorties = (Array.isArray(b.sorties) ? b.sorties : []).map((x) => ({ id: String(x.id || ""), vers: String(x.vers || ""), position: String(x.position || "fin") }));
  for (const s of sorties) {
    if (!PAGE_OK(s.vers)) throw refus(400, "Page de destination invalide.");
    if (s.vers === chemin) throw refus(400, "Pour changer l'ordre dans la même page, sers-toi des flèches.");
  }

  const source = await lireBlocs(chemin);
  if (ordre.length !== source.d.blocs.length) throw refus(409, "Cette page a changé depuis que tu l'as ouverte. Recharge-la, puis refais ton organisation.");

  const fichiers = [];
  const pousser = (c, contenu) => { if (!fichiers.some((f) => f.chemin === c)) fichiers.push({ chemin: c, contenu }); };

  let r;
  try { r = appliquer(source.d, ordre, masques, sorties.map((s) => s.id)); } catch (e) { throw refus(409, e.message); }
  pousser(chemin, r.html);

  // Déplacements vers d'autres pages, regroupés par page de destination.
  const parCible = new Map();
  for (const s of sorties) {
    const bloc = r.sortis.find((x) => x.id === s.id);
    if (!bloc) continue;
    const e = parCible.get(s.vers) || { position: s.position, blocs: [] };
    e.blocs.push(bloc);
    parCible.set(s.vers, e);
  }
  const ciblesLues = new Map();
  for (const [vers, e] of parCible) {
    const c = await lireBlocs(vers);
    ciblesLues.set(vers, c);
    pousser(vers, inserer(c.d, e.blocs, e.position));
  }

  // Version anglaise : même organisation, repérée par le rang des sections.
  let anglais = null;
  if (b.aussiEn) {
    const jSource = jumeau(source.contenu, chemin);
    if (jSource && PAGE_OK(jSource)) {
      const cs = await lireBlocs(jSource);
      if (cs.d.blocs.length !== source.d.blocs.length) anglais = { fait: false, raison: "La version anglaise n'a pas le même nombre de sections, elle n'a pas été touchée." };
      else {
        const ordreEn = ordre.map((id) => memeRang(source.d, cs.d, id)).filter(Boolean);
        const masquesEn = masques.map((id) => memeRang(source.d, cs.d, id)).filter(Boolean);
        const sortiesEn = [];
        let souci = "";
        for (const s of sorties) {
          const idEn = memeRang(source.d, cs.d, s.id);
          const cible = ciblesLues.get(s.vers);
          const jCible = cible ? jumeau(cible.contenu, s.vers) : "";
          if (!idEn || !jCible || !PAGE_OK(jCible)) { souci = "Une section déplacée n'a pas d'équivalent anglais, elle est restée en place côté anglais."; continue; }
          let positionEn = "fin";
          if (s.position === "debut") positionEn = "debut";
          else if (s.position !== "fin") {
            const cEn = ciblesLues.get(jCible) || (ciblesLues.set(jCible, await lireBlocs(jCible)), ciblesLues.get(jCible));
            positionEn = memeRang(cible.d, cEn.d, s.position) || "fin";
          }
          sortiesEn.push({ id: idEn, vers: jCible, position: positionEn });
        }
        try {
          const rEn = appliquer(cs.d, ordreEn, masquesEn, sortiesEn.map((s) => s.id));
          pousser(jSource, rEn.html);
          const parCibleEn = new Map();
          for (const s of sortiesEn) {
            const bloc = rEn.sortis.find((x) => x.id === s.id);
            if (!bloc) continue;
            const e = parCibleEn.get(s.vers) || { position: s.position, blocs: [] };
            e.blocs.push(bloc);
            parCibleEn.set(s.vers, e);
          }
          for (const [vers, e] of parCibleEn) {
            const c = ciblesLues.get(vers) || (ciblesLues.set(vers, await lireBlocs(vers)), ciblesLues.get(vers));
            pousser(vers, inserer(c.d, e.blocs, e.position));
          }
          anglais = { fait: true, raison: souci };
        } catch (e) { anglais = { fait: false, raison: e.message }; }
      }
    } else anglais = { fait: false, raison: "Cette page n'a pas de version anglaise." };
  }

  const aPublier = fichiers.filter((f) => {
    if (f.chemin === chemin) return f.contenu !== source.contenu;
    const c = ciblesLues.get(f.chemin);
    return !c || f.contenu !== c.contenu;
  });
  if (!aPublier.length) return { ok: true, pages: 0, rien: true, anglais };
  const res = await publier({ fichiers: aPublier, photos: [], message: "Mon site : organisation des sections" }, qui);
  return { ok: true, pages: aPublier.length, chemins: aPublier.map((f) => f.chemin), commit: res.commit, anglais };
}

export default async function handler(req, res) {
  try {
    const u = await exiger(req, res); if (!u) return;
    const q = parametres(req);
    const action = q.get("action") || "";
    if (req.method === "GET" && action === "etat") return json(res, 200, { pret: !!JETON || LOCAL, local: LOCAL, depot: DEPOT });
    if (!JETON && !LOCAL) return json(res, 503, { erreur: "GITHUB_ABSENT", message: "L'éditeur n'est pas encore branché (variable GITHUB_TOKEN manquante dans Vercel)." });

    if (req.method === "GET" && action === "pages") return json(res, 200, { pages: await listerPages() });
    if (req.method === "GET" && action === "page") {
      const chemin = q.get("chemin") || "";
      if (!PAGE_OK(chemin)) return json(res, 400, { erreur: "Page invalide" });
      return json(res, 200, await lirePage(chemin));
    }
    if (req.method === "GET" && action === "blocs") {
      const chemin = q.get("chemin") || "";
      if (!PAGE_OK(chemin)) return json(res, 400, { erreur: "Page invalide" });
      return json(res, 200, await blocsDeLaPage(chemin));
    }
    if (req.method === "POST" && action === "blocs") return json(res, 200, await publierBlocs(await corps(req, 200_000), u.email || u.courriel || "admin"));
    if (req.method === "GET" && action === "menu") return json(res, 200, { entrees: await menuActuel() });
    if (req.method === "POST" && action === "menu") return json(res, 200, await publierMenu(await corps(req, 200_000), u.email || u.courriel || "admin"));
    if (req.method === "POST" && action === "photo") return json(res, 200, await envoyerPhoto(await corps(req, 4_200_000)));
    if (req.method === "POST" && action === "publier") return json(res, 200, await publier(await corps(req, 4_200_000), u.email || u.courriel || "admin"));
    return json(res, 405, { erreur: "Méthode non permise" });
  } catch (e) {
    if (e && e.statut) return json(res, e.statut, { erreur: "REFUS", message: e.message });
    return erreur(res, e);
  }
}
