// /api/boutique : boutique Onomiko gérée par Sylvain dans son admin.
// Public :
//   GET                     pièces visibles de la boutique (statut autre que « cache »)
//   GET ?img=<id>           une photo téléversée (gardée dans Redis, mise en cache par le CDN)
//   POST ?action=reserver   demande de réservation d'un visiteur (message à Sylvain dans l'admin)
// Admin (connecté) :
//   POST ?action=photo      téléverse une photo (grand + petit format, préparés dans le navigateur)
//   DELETE ?img=<id>        supprime une photo téléversée
//   GET ?action=reservations    liste des demandes
//   PATCH ?action=reservation   { id, statut } ; DELETE ?action=reservation&id=<id>
// Les pièces elles-mêmes sont enregistrées par /api/donnees (clé « boutique »), avec copie de sécurité.
import { createHash, randomBytes } from "node:crypto";
import { exiger } from "./_lib/auth.js";
import { BOUTIQUE_DEPART } from "./_lib/boutique-depart.js";
import { cmd, lireJSON, ecrireJSON } from "./_lib/kv.js";
import { corps, erreur, json, parametres } from "./_lib/util.js";

const CLE_PIECES = "sb:boutique";
const CLE_RESA = "sb:boutique:reservations";
const MAX_RESA = 500;
const TYPES_IMG = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png" };

const net = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const netLong = (v, max) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
const idImg = (v) => /^[a-z0-9]{10,40}[gp]$/.test(String(v || "")) ? String(v) : "";

async function pieces() {
  const l = await lireJSON(CLE_PIECES, null);
  return Array.isArray(l) ? l : BOUTIQUE_DEPART;
}
const publique = (p) => ({
  id: p.id, slug: p.slug, type: p.type || "", nom: p.nom || "", nom_en: p.nom_en || "", tissu: p.tissu || "", tissu_en: p.tissu_en || "",
  prix: typeof p.prix === "number" && p.prix > 0 ? p.prix : null, tailles: p.tailles || "", desc: p.desc || "", desc_en: p.desc_en || "",
  statut: ["dispo", "reserve", "vendu"].includes(p.statut) ? p.statut : "dispo",
  photos: (p.photos || []).filter((x) => x && x.grand).map((x) => ({ grand: x.grand, petit: x.petit || x.grand, w: x.w || 800, h: x.h || 1200, alt: x.alt || p.nom || "", alt_en: x.alt_en || p.nom_en || x.alt || p.nom || "" })),
});

async function envoyerImage(res, id) {
  const v = await cmd("GET", "sb:img:" + id);
  if (!v) { res.statusCode = 404; res.setHeader("Cache-Control", "public, max-age=60"); return res.end(); }
  const i = v.indexOf(";");
  const type = v.slice(0, i), donnees = Buffer.from(v.slice(i + 1), "base64");
  res.statusCode = 200;
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Length", donnees.length);
  // Une photo garde le même identifiant toute sa vie : une nouvelle photo a un nouvel identifiant.
  res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
  return res.end(donnees);
}

function lireBase64(v) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(String(v || ""));
  if (!m || !TYPES_IMG[m[1]]) throw Object.assign(new Error("Format d'image non pris en charge (JPG, PNG ou WebP)."), { statut: 400 });
  const octets = Math.floor(m[2].length * 3 / 4);
  if (octets > 700_000) throw Object.assign(new Error("Photo trop lourde après réduction."), { statut: 413 });
  return { type: m[1], b64: m[2] };
}

async function reserver(req, res) {
  const b = await corps(req, 20_000);
  if (b.site) return json(res, 200, { ok: true }); // champ piège rempli par un robot
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  const cleIp = "sb:boutique:ip:" + createHash("sha256").update(ip).digest("hex").slice(0, 20);
  const n = await cmd("INCR", cleIp);
  if (n === 1) await cmd("EXPIRE", cleIp, 3600);
  if (n > 8) return json(res, 429, { erreur: "TROP", message: "Trop de demandes. Réessayez dans une heure." });
  const r = {
    id: Date.now().toString(36) + randomBytes(3).toString("hex"),
    date: new Date().toISOString(),
    piece: net(b.piece, 80), nomPiece: net(b.nomPiece, 120),
    nom: net(b.nom, 100), courriel: net(b.courriel, 160).toLowerCase(), telephone: net(b.telephone, 40),
    taille: net(b.taille, 60), message: netLong(b.message, 2000), langue: b.langue === "en" ? "en" : "fr",
    statut: "nouvelle",
  };
  if (!r.nom || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.courriel)) return json(res, 400, { erreur: "CHAMPS", message: r.langue === "en" ? "Please enter your name and a valid email." : "Indiquez votre nom et un courriel valide." });
  const l = await pieces();
  const p = l.find((x) => x.slug === r.piece);
  if (p) r.nomPiece = p.nom || r.nomPiece;
  const liste = (await lireJSON(CLE_RESA, [])) || [];
  liste.unshift(r);
  await ecrireJSON(CLE_RESA, liste.slice(0, MAX_RESA));
  await cmd("LPUSH", "sb:journal", JSON.stringify({ date: r.date, qui: r.courriel, quoi: `Réservation Onomiko : ${r.nomPiece || r.piece}` })).catch(() => null);
  return json(res, 200, { ok: true });
}

export default async function handler(req, res) {
  try {
    const q = parametres(req);
    const action = q.get("action") || "";
    const img = idImg(q.get("img"));

    if (req.method === "GET" && img) return envoyerImage(res, img);
    if (req.method === "GET" && !action) {
      const l = (await pieces()).filter((p) => p.statut !== "cache").map(publique);
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=15, stale-while-revalidate=60");
      res.statusCode = 200; res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ pieces: l }));
    }
    if (req.method === "POST" && action === "reserver") return reserver(req, res);

    // ---------- Admin ----------
    const u = await exiger(req, res); if (!u) return;
    if (req.method === "POST" && action === "photo") {
      const b = await corps(req, 2_600_000);
      const g = lireBase64(b.grand), p = lireBase64(b.petit || b.grand);
      const id = Date.now().toString(36) + randomBytes(5).toString("hex");
      await cmd("SET", `sb:img:${id}g`, `${g.type};${g.b64}`);
      await cmd("SET", `sb:img:${id}p`, `${p.type};${p.b64}`);
      return json(res, 200, { photo: { id, grand: `/api/boutique/?img=${id}g`, petit: `/api/boutique/?img=${id}p`, w: Number(b.w) || 1200, h: Number(b.h) || 1600 } });
    }
    if (req.method === "DELETE" && img) {
      const base = img.slice(0, -1);
      await cmd("DEL", `sb:img:${base}g`); await cmd("DEL", `sb:img:${base}p`);
      return json(res, 200, { ok: true });
    }
    if (req.method === "GET" && action === "reservations") return json(res, 200, { reservations: (await lireJSON(CLE_RESA, [])) || [] });
    if (action === "reservation" && (req.method === "PATCH" || req.method === "DELETE")) {
      const b = req.method === "PATCH" ? await corps(req, 20_000) : { id: q.get("id") };
      const liste = (await lireJSON(CLE_RESA, [])) || [];
      const i = liste.findIndex((x) => x.id === b.id);
      if (i < 0) return json(res, 404, { erreur: "Introuvable" });
      if (req.method === "DELETE") liste.splice(i, 1);
      else if (["nouvelle", "traitee"].includes(b.statut)) { liste[i].statut = b.statut; liste[i].traiteeLe = b.statut === "traitee" ? new Date().toISOString() : ""; }
      await ecrireJSON(CLE_RESA, liste);
      return json(res, 200, { ok: true, reservations: liste });
    }
    return json(res, 405, { erreur: "Méthode non permise" });
  } catch (e) {
    if (e && e.statut) return json(res, e.statut, { erreur: "REFUS", message: e.message });
    return erreur(res, e);
  }
}
