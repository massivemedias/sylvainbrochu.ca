// /api/rappels : courriels importants qui attendent ma réponse (employeurs, formulaire du site).
// GET sans paramètre : appelé toutes les 30 min par la tâche planifiée GitHub (.github/workflows/rappels.yml)
//   et chaque jour par Vercel. Entre 8 h et 21 h (Montréal), si un courriel attend une réponse depuis plus de
//   « rappelHeures » (Réglages, 3 h par défaut), un rappel part vers « rappelA ». Au plus 2 rappels par courriel :
//   le premier après le délai, le second après 24 h. Ne renvoie que des nombres, jamais le contenu.
// GET ?action=liste (session de l'admin) : la liste, pour l'accueil et Mes courriels.
import { createHash } from "node:crypto";
import { utilisateur } from "./_lib/auth.js";
import { cmd, lireJSON } from "./_lib/kv.js";
import { DONNEES_DEFAUT, REGLAGES } from "./_lib/defauts.js";
import * as mail from "./_lib/mail.js";
import { erreur, json, parametres } from "./_lib/util.js";

const heureMontreal = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }).format(new Date()));
const cle = (x) => "sb:rappel:" + createHash("sha1").update(String(x.idMessage || x.uid)).digest("hex").slice(0, 16);

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return json(res, 405, { erreur: "Méthode non permise" });
    const q = parametres(req);
    const candidatures = await lireJSON("sb:candidatures", DONNEES_DEFAUT.candidatures);

    if (q.get("action") === "liste") {
      if (!(await utilisateur(req))) return json(res, 401, { erreur: "NON_CONNECTE" });
      if (!mail.courrielPret()) return json(res, 200, { pret: false, courriels: [] });
      return json(res, 200, { pret: true, courriels: await mail.aRepondre(candidatures) });
    }

    // Tâche planifiée
    if (!mail.courrielPret()) return json(res, 200, { ok: false, raison: "boîte info@ pas branchée" });
    const r = { ...REGLAGES, ...(await lireJSON("sb:reglages", {})) };
    if (r.rappels === false) return json(res, 200, { ok: true, actif: false });
    const h = heureMontreal();
    if (h < 8 || h >= 21) return json(res, 200, { ok: true, nuit: true });
    if ((await cmd("SET", "sb:rappels:verrou", "1", "NX", "EX", 600)) !== "OK") return json(res, 200, { ok: true, deja: true });

    const seuil = Math.min(48, Math.max(1, Number(r.rappelHeures) || 3)) * 3600e3;
    const liste = await mail.aRepondre(candidatures);
    const aEnvoyer = [];
    for (const x of liste) {
      const age = Date.now() - Date.parse(x.date);
      if (age < seuil) continue;
      const k = cle(x);
      const n = Number(await cmd("GET", k)) || 0;
      if (n >= 2 || (n === 1 && age < 24 * 3600e3)) continue;
      aEnvoyer.push({ ...x, k, n });
    }
    if (!aEnvoyer.length) return json(res, 200, { ok: true, enAttente: liste.length, rappels: 0 });

    const a = String(r.rappelA || REGLAGES.rappelA).split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /@/.test(x));
    if (!a.length) return json(res, 200, { ok: false, raison: "aucune adresse de rappel" });
    await mail.envoyerRappel(a, aEnvoyer);
    for (const x of aEnvoyer) await cmd("SET", x.k, String(x.n + 1), "EX", 30 * 86400);
    await cmd("LPUSH", "sb:journal", JSON.stringify({ date: new Date().toISOString(), qui: "rappel automatique", quoi: `Rappel envoyé à ${a.join(", ")} : ${aEnvoyer.length} courriel${aEnvoyer.length > 1 ? "s" : ""} en attente de réponse` }));
    await cmd("LTRIM", "sb:journal", 0, 299);
    return json(res, 200, { ok: true, enAttente: liste.length, rappels: aEnvoyer.length });
  } catch (e) { return erreur(res, e); }
}
