// /api/donnees : lecture et écriture des données de l'admin (candidatures, CV, modèles, réglages...).
// GET ?cle=tout|<cle>   PUT ?cle=<cle> (corps = nouvelle valeur)   DELETE ?cle=cv-<id>
// Les clés « cv-<id> » sont ouvertes : Sylvain crée ses propres versions de CV depuis l'admin.
import { exiger } from "./_lib/auth.js";
import { CLES, CV_VIDE, CVS_DEPART, DONNEES_DEFAUT } from "./_lib/defauts.js";
import { cmd, lireJSON, ecrireJSON } from "./_lib/kv.js";
import { corps, erreur, json, parametres } from "./_lib/util.js";

const k = (cle) => "sb:" + cle;
const CV_CLE = /^cv-[a-z0-9][a-z0-9-]{0,31}$/;
const permise = (cle) => CLES.includes(cle) || CV_CLE.test(cle);
const defautDe = (cle) => (cle in DONNEES_DEFAUT ? DONNEES_DEFAUT[cle] : CV_CLE.test(cle) ? { ...CV_VIDE } : null);

export default async function handler(req, res) {
  try {
    const u = await exiger(req, res); if (!u) return;
    const cle = parametres(req).get("cle") || "tout";

    if (req.method === "GET") {
      if (cle === "tout") {
        const vals = await cmd("MGET", ...CLES.map(k));
        const out = {};
        CLES.forEach((c, i) => {
          let v = null;
          try { v = vals[i] == null ? null : JSON.parse(vals[i]); } catch { v = null; }
          out[c] = v ?? DONNEES_DEFAUT[c];
        });
        out.reglages = { ...DONNEES_DEFAUT.reglages, ...out.reglages };
        // Versions de CV créées par Sylvain : elles ne sont pas dans la liste fixe, on les charge ici.
        out.cvs = Array.isArray(out.cvs) && out.cvs.length ? out.cvs : CVS_DEPART;
        const sup = out.cvs.map((x) => `cv-${x.v}`).filter((c) => CV_CLE.test(c) && !(c in out));
        if (sup.length) {
          const autres = await cmd("MGET", ...sup.map(k));
          sup.forEach((c, i) => { try { out[c] = autres[i] == null ? { ...CV_VIDE } : JSON.parse(autres[i]); } catch { out[c] = { ...CV_VIDE }; } });
        }
        return json(res, 200, { donnees: out, utilisateur: u });
      }
      if (cle === "journal") {
        const l = (await cmd("LRANGE", "sb:journal", 0, 99)) || [];
        return json(res, 200, { valeur: l.map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean) });
      }
      if (!permise(cle)) return json(res, 404, { erreur: "Clé inconnue" });
      return json(res, 200, { valeur: await lireJSON(k(cle), defautDe(cle)) });
    }

    if (req.method === "PUT") {
      if (!permise(cle)) return json(res, 404, { erreur: "Clé inconnue" });
      const valeur = await corps(req);
      if (cle === "reglages") {
        const acces = (valeur.acces || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
        if (!acces.includes(u.email)) acces.push(u.email); // on ne peut pas se retirer soi-même
        valeur.acces = acces;
      }
      // Copie de sécurité de la version précédente (une par jour et par clé)
      const avant = await cmd("GET", k(cle));
      if (avant) await cmd("SET", `sb:copie:${cle}:${new Date().toISOString().slice(0, 10)}`, avant, "EX", 60 * 86400);
      await ecrireJSON(k(cle), valeur);
      await cmd("LPUSH", "sb:journal", JSON.stringify({ date: new Date().toISOString(), qui: u.email, quoi: `Modification : ${cle}` }));
      await cmd("LTRIM", "sb:journal", 0, 299);
      return json(res, 200, { ok: true });
    }

    if (req.method === "DELETE") {
      // Seules les versions de CV se suppriment ; le CV carrière reste, c'est celui du site.
      if (!CV_CLE.test(cle) || cle === "cv-carriere") return json(res, 400, { erreur: "Cette donnée ne peut pas être supprimée." });
      await cmd("DEL", k(cle));
      await cmd("DEL", `sb:cvpdf:${cle.slice(3)}`);
      await cmd("LPUSH", "sb:journal", JSON.stringify({ date: new Date().toISOString(), qui: u.email, quoi: `Version de CV supprimée : ${cle.slice(3)}` }));
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { erreur: "Méthode non permise" });
  } catch (e) { return erreur(res, e); }
}
