// /api/cv : le CV en PDF.
// GET ?v=carriere (public, c'est le CV du site) | ?v=barman | ?v=service (admin seulement, jamais publics)
// POST ?v=carriere|barman|service (admin) : enregistre un PDF généré dans l'admin. Pour « carriere », il remplace le CV du site.
import { readFile } from "node:fs/promises";
import { exiger, utilisateur } from "./_lib/auth.js";
import { cmd } from "./_lib/kv.js";
import { corps, erreur, json, parametres } from "./_lib/util.js";

export default async function handler(req, res) {
  try {
    const demande = parametres(req).get("v");
    const v = demande === "barman" || demande === "service" ? demande : "carriere";
    const NOMS = { carriere: "Sylvain-Brochu-CV.pdf", barman: "Sylvain-Brochu-CV-Bar.pdf", service: "Sylvain-Brochu-CV-Service.pdf" };
    if (req.method === "GET") {
      if (v !== "carriere" && !(await utilisateur(req))) return json(res, 401, { erreur: "NON_CONNECTE" });
      let contenu = null;
      try { const b = await cmd("GET", `sb:cvpdf:${v}`); if (b) contenu = Buffer.from(b, "base64"); } catch { contenu = null; }
      if (!contenu) {
        try { contenu = await readFile(new URL(`./_fichiers/cv-${v}.pdf`, import.meta.url)); } catch { contenu = null; }
      }
      if (!contenu) return json(res, 404, { erreur: "Ce CV n'a pas encore été enregistré. Ouvre Mon CV dans l'admin et clique « L'utiliser dans les courriels »." });
      const nom = NOMS[v];
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${nom}"`);
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
      await cmd("LPUSH", "sb:journal", JSON.stringify({ date: new Date().toISOString(), qui: u.email, quoi: v === "carriere" ? "CV carrière publié sur le site" : v === "barman" ? "CV barman enregistré" : "CV accueil et service enregistré" }));
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { erreur: "Méthode non permise" });
  } catch (e) { return erreur(res, e); }
}
