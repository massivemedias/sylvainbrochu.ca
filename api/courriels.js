// /api/courriels : boîte de info@sylvainbrochu.ca.
// GET  ?action=liste&dossier=recus|envoyes|brouillons&q=   |  ?action=lire&dossier=&uid=  |  ?action=piece&dossier=&uid=&index=  |  ?action=etat
// POST ?action=envoyer|brouillon|envoyerBrouillon|supprimerBrouillon|synchroniser
import { exiger } from "./_lib/auth.js";
import { cmd } from "./_lib/kv.js";
import * as mail from "./_lib/mail.js";
import { corps, erreur, json, parametres } from "./_lib/util.js";

async function journal(u, quoi) {
  await cmd("LPUSH", "sb:journal", JSON.stringify({ date: new Date().toISOString(), qui: u.email, quoi }));
  await cmd("LTRIM", "sb:journal", 0, 299);
}

export default async function handler(req, res) {
  try {
    const u = await exiger(req, res); if (!u) return;
    const q = parametres(req);
    const action = q.get("action") || "liste";
    if (req.method === "GET") {
      if (action === "etat") return json(res, 200, await mail.etat());
      if (action === "liste") return json(res, 200, { messages: await mail.liste(q.get("dossier") || "recus", (q.get("q") || "").slice(0, 200)) });
      if (action === "lire") return json(res, 200, { message: await mail.lire(q.get("dossier") || "recus", q.get("uid")) });
      if (action === "piece") {
        const p = await mail.piece(q.get("dossier") || "recus", q.get("uid"), q.get("index"));
        res.statusCode = 200;
        res.setHeader("Content-Type", p.type);
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(p.nom)}`);
        res.setHeader("Cache-Control", "private, no-store");
        return res.end(p.contenu);
      }
      return json(res, 400, { erreur: "Action inconnue" });
    }
    if (req.method === "POST") {
      const b = await corps(req, 12_000_000);
      if (action === "envoyer") { const r = await mail.envoyer(b); await journal(u, `Courriel envoyé à ${b.a} : ${b.sujet}`); return json(res, 200, r); }
      if (action === "brouillon") { const r = await mail.brouillon(b); await journal(u, `Brouillon créé pour ${b.a} : ${b.sujet}`); return json(res, 200, r); }
      if (action === "envoyerBrouillon") { const r = await mail.envoyerBrouillon(b.uid); await journal(u, `Brouillon envoyé à ${(r.a || []).join(", ")}`); return json(res, 200, r); }
      if (action === "supprimerBrouillon") { const r = await mail.supprimerBrouillon(b.uid); await journal(u, "Brouillon supprimé"); return json(res, 200, r); }
      if (action === "synchroniser") return json(res, 200, { resultats: await mail.synchroniser(b.adresses) });
      return json(res, 400, { erreur: "Action inconnue" });
    }
    return json(res, 405, { erreur: "Méthode non permise" });
  } catch (e) { return erreur(res, e); }
}
