// /api/site : « Mon site », l'éditeur des pages du site dans l'admin (connecté seulement).
//   GET  ?action=etat                 l'éditeur est-il branché (jeton GitHub présent) ?
//   GET  ?action=pages                liste des pages modifiables
//   GET  ?action=page&chemin=<f>      code HTML d'une page + son empreinte (sha)
//   POST ?action=photo                { chemin, donnees: dataURL } : envoie une photo, renvoie son empreinte
//   POST ?action=publier              { fichiers: [{ chemin, contenu, sha }], photos: [{ chemin, sha }], message }
// Publier = un commit sur la branche main du dépôt ; Vercel remet le site en ligne tout seul (environ une minute).
// Sans jeton GitHub mais en local (SB_LOCAL=1), les pages sont lues et écrites dans un dossier (SB_SITE_DIR).
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { exiger } from "./_lib/auth.js";
import { corps, erreur, json, parametres } from "./_lib/util.js";

const DEPOT = process.env.GITHUB_REPO || "massivemedias/sylvainbrochu.ca";
const BRANCHE = process.env.GITHUB_BRANCH || "main";
const JETON = process.env.GITHUB_TOKEN || "";
const LOCAL = !JETON && process.env.SB_LOCAL === "1";
const DOSSIER_LOCAL = process.env.SB_SITE_DIR || process.cwd();

// Pages qu'on ne modifie pas ici : l'admin, les fonctions, et les fiches de la boutique (remplies par « Ma boutique »).
const EXCLUS = /^(admin|api|node_modules|outils|\.)|^(onomiko\/boutique|en\/onomiko\/shop)\/(?!index\.html$)/;
const PAGE_OK = (c) => typeof c === "string" && /^[a-z0-9][a-z0-9/_-]*\/index\.html$|^index\.html$/.test(c) && !c.includes("..") && !EXCLUS.test(c);
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
async function publier(b, qui) {
  const fichiers = Array.isArray(b.fichiers) ? b.fichiers : [];
  const photos = Array.isArray(b.photos) ? b.photos : [];
  if (!fichiers.length && !photos.length) throw refus(400, "Rien à publier.");
  for (const f of fichiers) {
    if (!PAGE_OK(f.chemin) || typeof f.contenu !== "string" || f.contenu.length < 200 || !/<\/html>\s*$/i.test(f.contenu)) throw refus(400, `Page invalide : ${f.chemin}`);
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
    if (req.method === "POST" && action === "photo") return json(res, 200, await envoyerPhoto(await corps(req, 4_200_000)));
    if (req.method === "POST" && action === "publier") return json(res, 200, await publier(await corps(req, 4_200_000), u.email || u.courriel || "admin"));
    return json(res, 405, { erreur: "Méthode non permise" });
  } catch (e) {
    if (e && e.statut) return json(res, e.statut, { erreur: "REFUS", message: e.message });
    return erreur(res, e);
  }
}
