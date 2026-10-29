// /api/auth : état de la session (GET), connexion Google (POST), déconnexion (DELETE).
import { GOOGLE_CLIENT_ID, fermerSession, listeAcces, ouvrirSession, utilisateur, verifierGoogle } from "./_lib/auth.js";
import { kvPret } from "./_lib/kv.js";
import { corps, erreur, json } from "./_lib/util.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      if (!kvPret()) return json(res, 200, { connecte: false, clientId: GOOGLE_CLIENT_ID, stockage: false });
      const u = await utilisateur(req);
      return json(res, 200, { connecte: Boolean(u), utilisateur: u, clientId: GOOGLE_CLIENT_ID, stockage: true });
    }
    if (req.method === "POST") {
      const { credential } = await corps(req);
      if (!credential) return json(res, 400, { erreur: "Jeton Google manquant" });
      const u = await verifierGoogle(credential);
      const acces = await listeAcces();
      if (!acces.includes(u.email)) return json(res, 403, { erreur: "ACCES_REFUSE", email: u.email });
      await ouvrirSession(res, u);
      return json(res, 200, { connecte: true, utilisateur: u });
    }
    if (req.method === "DELETE") {
      fermerSession(res);
      return json(res, 200, { connecte: false });
    }
    return json(res, 405, { erreur: "Méthode non permise" });
  } catch (e) { return erreur(res, e); }
}
