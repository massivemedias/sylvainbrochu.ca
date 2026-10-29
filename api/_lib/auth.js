// Connexion : bouton « Se connecter avec Google » (jeton d'identité vérifié avec les clés publiques de Google),
// puis session dans un témoin signé. Seules les adresses de la liste d'accès entrent.
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { randomBytes } from "node:crypto";
import { cmd, lireJSON } from "./kv.js";
import { cookies, json } from "./util.js";

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "__GOOGLE_CLIENT_ID__";
export const ACCES_DEFAUT = ["massivemedias@gmail.com", "info@sylvainbrochu.ca", "sylvain@lecartel.ca", "sylvain@cartel.ca"];
const TEMOIN = "sb_session";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

async function secret() {
  let s = await cmd("GET", "sb:secret");
  if (!s) {
    s = randomBytes(32).toString("base64");
    await cmd("SET", "sb:secret", s);
  }
  return new TextEncoder().encode(s);
}

export async function listeAcces() {
  const r = await lireJSON("sb:reglages", {});
  const l = Array.isArray(r.acces) && r.acces.length ? r.acces : ACCES_DEFAUT;
  return l.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
}

export async function verifierGoogle(credential) {
  const { payload } = await jwtVerify(credential, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: GOOGLE_CLIENT_ID,
  });
  if (!payload.email || payload.email_verified === false) throw new Error("Adresse Google non vérifiée");
  return { email: String(payload.email).toLowerCase(), nom: payload.name || payload.email, photo: payload.picture || "" };
}

export async function ouvrirSession(res, u) {
  const jeton = await new SignJWT({ email: u.email, nom: u.nom, photo: u.photo })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(await secret());
  res.setHeader("Set-Cookie", `${TEMOIN}=${jeton}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`);
}

export function fermerSession(res) {
  res.setHeader("Set-Cookie", `${TEMOIN}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export async function utilisateur(req) {
  if (process.env.SB_LOCAL === "1" && process.env.SB_DEV_USER) return { email: process.env.SB_DEV_USER, nom: "Test local", photo: "" };
  const jeton = cookies(req)[TEMOIN];
  if (!jeton) return null;
  try {
    const { payload } = await jwtVerify(jeton, await secret());
    const acces = await listeAcces();
    if (!acces.includes(String(payload.email).toLowerCase())) return null;
    return { email: payload.email, nom: payload.nom, photo: payload.photo };
  } catch { return null; }
}

// À appeler au début de chaque fonction protégée. Renvoie l'utilisateur ou répond 401.
export async function exiger(req, res) {
  const u = await utilisateur(req);
  if (!u) { json(res, 401, { erreur: "NON_CONNECTE" }); return null; }
  return u;
}
