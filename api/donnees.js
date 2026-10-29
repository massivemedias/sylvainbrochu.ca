// /api/donnees : lecture et écriture des données de l'admin (candidatures, CV, modèles, réglages...).
// GET ?cle=tout|<cle>   PUT ?cle=<cle> (corps = nouvelle valeur)
import { exiger } from "./_lib/auth.js";
import { CLES, DONNEES_DEFAUT } from "./_lib/defauts.js";
import { cmd, lireJSON, ecrireJSON } from "./_lib/kv.js";
import { corps, erreur, json, parametres } from "./_lib/util.js";

const k = (cle) => "sb:" + cle;

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
        return json(res, 200, { donnees: out, utilisateur: u });
      }
      if (cle === "journal") {
        const l = (await cmd("LRANGE", "sb:journal", 0, 99)) || [];
        return json(res, 200, { valeur: l.map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean) });
      }
      if (!CLES.includes(cle)) return json(res, 404, { erreur: "Clé inconnue" });
      return json(res, 200, { valeur: await lireJSON(k(cle), DONNEES_DEFAUT[cle]) });
    }

    if (req.method === "PUT") {
      if (!CLES.includes(cle)) return json(res, 404, { erreur: "Clé inconnue" });
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
    return json(res, 405, { erreur: "Méthode non permise" });
  } catch (e) { return erreur(res, e); }
}
