// /api/cv : le CV en PDF, et l'import d'un CV envoyé par Sylvain.
//   GET  ?v=carriere            le CV du site (public)
//   GET  ?v=<autre>             les autres versions (admin seulement, jamais publiques)
//   POST ?v=<version>           enregistre le PDF généré dans l'admin
//   POST ?action=importer       { nom, fichier: dataURL } ou { nom, texte } : lit un CV
//                               (.docx, .pdf, .txt, .rtf, .html) et le range dans la mise en page du site
import { readFile } from "node:fs/promises";
import { exiger, utilisateur } from "./_lib/auth.js";
import { cmd, lireJSON } from "./_lib/kv.js";
import { CVS_DEPART } from "./_lib/defauts.js";
import { extraireTexte } from "./_lib/cv-texte.js";
import { lireCV } from "./_lib/cv-lire.js";
import { corps, erreur, json, parametres } from "./_lib/util.js";

const VERSION_OK = (v) => /^[a-z0-9][a-z0-9-]{1,23}$/.test(v);

async function versions() {
  try { const l = await lireJSON("sb:cvs", null); if (Array.isArray(l) && l.length) return l; } catch { /* sans Redis */ }
  return CVS_DEPART;
}
const nomFichier = (liste, v) => (liste.find((x) => x.v === v) || {}).fichier || `Sylvain-Brochu-CV-${v}.pdf`;

// ---------- Import ----------
async function importer(b) {
  let texte = String(b.texte || "");
  let source = "texte collé";
  if (!texte.trim() && b.fichier) {
    const m = /^data:[^;,]*;base64,(.+)$/s.exec(String(b.fichier));
    if (!m) throw Object.assign(new Error("Fichier illisible."), { statut: 400 });
    const buf = Buffer.from(m[1], "base64");
    if (buf.length > 12_000_000) throw Object.assign(new Error("Fichier trop lourd (12 Mo maximum)."), { statut: 413 });
    const r = extraireTexte(String(b.nomFichier || "cv.txt"), buf);
    texte = r.texte; source = r.type;
  }
  texte = texte.replace(/\u0000/g, "").trim();
  if (texte.replace(/\s/g, "").length < 80) {
    throw Object.assign(new Error("Je n'ai trouvé presque aucun texte dans ce document. S'il s'agit d'un scan ou d'une image, envoie le fichier Word, ou colle le texte du CV."), { statut: 400 });
  }
  const { cv, manques } = lireCV(texte, String(b.nom || ""));
  return { cv, manques, source, texte };
}

export default async function handler(req, res) {
  try {
    const q = parametres(req);
    const action = q.get("action") || "";

    if (req.method === "POST" && action === "importer") {
      const u = await exiger(req, res); if (!u) return;
      try { return json(res, 200, await importer(await corps(req, 16_000_000))); }
      catch (e) { return json(res, e.statut || 400, { erreur: "REFUS", message: e.message }); }
    }

    const liste = await versions();
    const demande = q.get("v") || "carriere";
    const v = VERSION_OK(demande) && liste.some((x) => x.v === demande) ? demande : "carriere";

    if (req.method === "GET") {
      if (v !== "carriere" && !(await utilisateur(req))) return json(res, 401, { erreur: "NON_CONNECTE" });
      let contenu = null;
      try { const b = await cmd("GET", `sb:cvpdf:${v}`); if (b) contenu = Buffer.from(b, "base64"); } catch { contenu = null; }
      if (!contenu) {
        try { contenu = await readFile(new URL(`./_fichiers/cv-${v}.pdf`, import.meta.url)); } catch { contenu = null; }
      }
      if (!contenu) return json(res, 404, { erreur: "Ce CV n'a pas encore été enregistré. Ouvre Mon CV dans l'admin et clique « L'utiliser dans les courriels »." });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${nomFichier(liste, v)}"`);
      res.setHeader("Cache-Control", v === "carriere" ? "public, max-age=300" : "private, no-store");
      if (v !== "carriere") res.setHeader("X-Robots-Tag", "noindex");
      return res.end(contenu);
    }

    if (req.method === "POST") {
      const u = await exiger(req, res); if (!u) return;
      const { pdf } = await corps(req, 6_000_000);
      if (!pdf || !/^JVBER/.test(pdf)) return json(res, 400, { erreur: "PDF invalide" });
      await cmd("SET", `sb:cvpdf:${v}`, pdf);
      await cmd("SET", `sb:cvpdf:${v}:date`, new Date().toISOString());
      const quoi = v === "carriere" ? "CV carrière publié sur le site" : `${(liste.find((x) => x.v === v) || {}).court || "CV " + v} enregistré`;
      await cmd("LPUSH", "sb:journal", JSON.stringify({ date: new Date().toISOString(), qui: u.email, quoi }));
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { erreur: "Méthode non permise" });
  } catch (e) { return erreur(res, e); }
}
