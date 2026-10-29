// Accès à la boîte Gmail où arrivent les courriels de info@sylvainbrochu.ca (IMAP pour lire, SMTP pour envoyer).
// Le code ne lit que les courriels envoyés à info@ ou depuis info@, et les messages du formulaire du site.
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { simpleParser } from "mailparser";
import { readFile } from "node:fs/promises";
import { cmd, lireJSON } from "./kv.js";
import { REGLAGES } from "./defauts.js";

const UTILISATEUR = process.env.MAIL_USER || "massivemedias@gmail.com";
// Un mot de passe d'application Gmail fait 16 lettres. Si la valeur collée est plus longue
// (collée plusieurs fois, ou avec du texte autour), on essaie chaque bloc de 16 lettres.
const BRUT = (process.env.MAIL_APP_PASSWORD || "").replace(/\s+/g, "");
const CANDIDATS = [...new Set([
  ...(BRUT.length > 16 ? (BRUT.match(/[a-z]{16}/gi) || []) : []),
  BRUT,
])].filter(Boolean);
let MOT_DE_PASSE = CANDIDATS[0] || "";
let motVerifie = CANDIDATS.length <= 1;
export const courrielPret = () => Boolean(MOT_DE_PASSE);
const INFO = "info@sylvainbrochu.ca";

async function connecter() {
  let essais = motVerifie ? [MOT_DE_PASSE] : CANDIDATS;
  if (!motVerifie) {
    // Le bon bloc est mémorisé pour que les nouvelles instances ne refassent pas tous les essais.
    const i = Number(await cmd("GET", "sb:mail:bloc").catch(() => null));
    if (Number.isInteger(i) && CANDIDATS[i]) essais = [CANDIDATS[i], ...CANDIDATS.filter((_, k) => k !== i)];
  }
  let derniere;
  for (const pass of essais) {
    for (let tentative = 0; tentative < 2; tentative++) {
      const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: UTILISATEUR, pass }, logger: false });
      try {
        await client.connect();
        if (!motVerifie) await cmd("SET", "sb:mail:bloc", String(CANDIDATS.indexOf(pass))).catch(() => null);
        MOT_DE_PASSE = pass; motVerifie = true;
        return client;
      } catch (e) {
        derniere = e;
        if (e.authenticationFailed) break;
        if (tentative === 0) { await new Promise((r) => setTimeout(r, 800)); continue; }
        throw e;
      }
    }
  }
  throw derniere;
}

export const FILTRES = {
  recus: `(to:${INFO} OR cc:${INFO} OR deliveredto:${INFO} OR label:sylvain-emplois OR (from:submissions@formsubmit.co sylvainbrochu)) -from:${INFO} -in:drafts -in:spam -in:trash`,
  envoyes: `from:${INFO} -in:drafts -in:trash`,
  brouillons: `from:${INFO}`,
};

async function reglages() {
  return { ...REGLAGES, ...(await lireJSON("sb:reglages", {})) };
}

export async function avecImap(fn) {
  if (!MOT_DE_PASSE) throw new Error("COURRIEL_ABSENT");
  const client = await connecter();
  try { return await fn(client); } finally { try { await client.logout(); } catch { /* déjà fermé */ } }
}

async function chemins(client) {
  const l = await client.list();
  const trouver = (u, defaut) => (l.find((b) => b.specialUse === u) || {}).path || defaut;
  return { tous: trouver("\\All", "[Gmail]/All Mail"), envoyes: trouver("\\Sent", "[Gmail]/Sent Mail"), brouillons: trouver("\\Drafts", "[Gmail]/Drafts"), corbeille: trouver("\\Trash", "[Gmail]/Trash") };
}

const adresses = (a) => (a || []).map((x) => ({ nom: x.name || "", courriel: (x.address || "").toLowerCase() }));
const resume = (m) => ({
  uid: m.uid, fil: m.threadId ? String(m.threadId) : "", date: (m.internalDate || m.envelope?.date || new Date()).toISOString(),
  sujet: m.envelope?.subject || "(sans objet)", de: adresses(m.envelope?.from), a: adresses(m.envelope?.to), cc: adresses(m.envelope?.cc),
  idMessage: m.envelope?.messageId || "", lu: m.flags ? m.flags.has("\\Seen") : true, taille: m.size || 0,
});

async function chercher(client, chemin, gmraw, max) {
  const lock = await client.getMailboxLock(chemin);
  try {
    const uids = (await client.search({ gmraw }, { uid: true })) || [];
    const choix = uids.sort((a, b) => b - a).slice(0, max);
    if (!choix.length) return [];
    const out = [];
    for await (const m of client.fetch(choix, { uid: true, envelope: true, flags: true, internalDate: true, threadId: true, size: true }, { uid: true })) out.push(resume(m));
    return out.sort((a, b) => b.date.localeCompare(a.date));
  } finally { lock.release(); }
}

export async function liste(dossier, q = "", max = 60) {
  return avecImap(async (client) => {
    const c = await chemins(client);
    const filtre = FILTRES[dossier] || FILTRES.recus;
    const gmraw = q ? `${filtre} ${q}` : filtre;
    return chercher(client, dossier === "brouillons" ? c.brouillons : c.tous, gmraw, max);
  });
}

async function source(client, chemin, uid) {
  const lock = await client.getMailboxLock(chemin);
  try {
    const m = await client.fetchOne(String(uid), { uid: true, source: true, flags: true, threadId: true, envelope: true }, { uid: true });
    if (!m) throw new Error("Courriel introuvable");
    return m;
  } finally { lock.release(); }
}

// Vérifie qu'un message relève bien de info@ avant de l'ouvrir.
function autorise(p) {
  const tout = [p.from, p.to, p.cc, p.bcc].flatMap((x) => (x ? x.value : [])).map((x) => (x.address || "").toLowerCase());
  const formulaire = tout.includes("submissions@formsubmit.co") && /sylvainbrochu/i.test(p.subject || "");
  const viaInfo = /info@sylvainbrochu\.ca/i.test(String(p.headers.get("delivered-to") || "")) || /info@sylvainbrochu\.ca/i.test(String(p.headers.get("x-forwarded-to") || ""));
  return tout.includes(INFO) || formulaire || viaInfo;
}

export async function lire(dossier, uid) {
  return avecImap(async (client) => {
    const c = await chemins(client);
    const chemin = dossier === "brouillons" ? c.brouillons : c.tous;
    const m = await source(client, chemin, uid);
    const p = await simpleParser(m.source);
    if (!autorise(p)) throw new Error("Ce courriel ne concerne pas info@sylvainbrochu.ca");
    if (dossier === "recus" && !(m.flags && m.flags.has("\\Seen"))) {
      const lock = await client.getMailboxLock(chemin);
      try { await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }); } finally { lock.release(); }
    }
    const x = (v) => (v ? v.value.map((a) => ({ nom: a.name || "", courriel: (a.address || "").toLowerCase() })) : []);
    return {
      uid: m.uid, fil: m.threadId ? String(m.threadId) : "", sujet: p.subject || "(sans objet)", date: (p.date || new Date()).toISOString(),
      de: x(p.from), a: x(p.to), cc: x(p.cc), cci: x(p.bcc), idMessage: p.messageId || "", references: [].concat(p.references || []),
      texte: p.text || "", html: p.html || "",
      pieces: (p.attachments || []).filter((a) => a.contentDisposition !== "inline" || !a.cid).map((a, i) => ({ index: i, nom: a.filename || `piece-${i + 1}`, type: a.contentType, taille: a.size })),
    };
  });
}

export async function piece(dossier, uid, index) {
  return avecImap(async (client) => {
    const c = await chemins(client);
    const m = await source(client, dossier === "brouillons" ? c.brouillons : c.tous, uid);
    const p = await simpleParser(m.source);
    if (!autorise(p)) throw new Error("Accès refusé");
    const a = (p.attachments || []).filter((x) => x.contentDisposition !== "inline" || !x.cid)[Number(index)];
    if (!a) throw new Error("Pièce introuvable");
    return { nom: a.filename || "piece", type: a.contentType || "application/octet-stream", contenu: a.content };
  });
}

// ---------- CV en pièce jointe ----------
export async function pdfCV(version) {
  const v = version === "barman" ? "barman" : "carriere";
  const b64 = await cmd("GET", `sb:cvpdf:${v}`);
  const nom = v === "barman" ? "Sylvain-Brochu-CV-Bar.pdf" : "Sylvain-Brochu-CV.pdf";
  if (b64) return { nom, contenu: Buffer.from(b64, "base64") };
  return { nom, contenu: await readFile(new URL(`../_fichiers/cv-${v}.pdf`, import.meta.url)) };
}

// Texte simple vers HTML : paragraphes, liens web, courriels et téléphone cliquables.
const echapper = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function lier(s) {
  return s
    .replace(/\b((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)])/gi, (u) => `<a href="${/^www\./i.test(u) ? "https://" + u : u}">${u}</a>`)
    .replace(/(^|[\s(>])([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi, (_, a, e) => `${a}<a href="mailto:${e}">${e}</a>`)
    .replace(/(^|[\s(>])(\d{3}-\d{3}-\d{4})\b/g, (_, a, t) => `${a}<a href="tel:+1${t.replace(/-/g, "")}">${t}</a>`);
}
export function versHtml(texte) {
  const blocs = String(texte || "").replace(/\r/g, "").trim().split(/\n{2,}/);
  return `<div dir="ltr">${blocs.map((b) => `<p>${lier(echapper(b)).replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
}

// Un brouillon doit garder la Cci, que MailComposer retire par défaut.
async function brutBrouillon(msg) {
  const noeud = new MailComposer(msg).compile();
  noeud.keepBcc = true;
  return noeud.build();
}

async function composer(m) {
  const r = await reglages();
  const pieces = [];
  if (m.piece === "carriere" || m.piece === "barman") {
    const f = await pdfCV(m.piece);
    pieces.push({ filename: f.nom, content: f.contenu, contentType: "application/pdf" });
  }
  (m.piecesJointes || []).forEach((p) => pieces.push({ filename: p.nom, content: Buffer.from(p.contenu, "base64"), contentType: p.type || "application/octet-stream" }));
  const liste = (v) => (Array.isArray(v) ? v : String(v || "").split(/[,;]/)).map((x) => x.trim()).filter(Boolean);
  return {
    from: { name: r.expediteurNom || "Sylvain Brochu", address: r.expediteur || INFO },
    to: liste(m.a), cc: liste(m.cc), bcc: liste(m.cci),
    subject: m.sujet || "", text: m.texte || "",
    html: m.html || (m.texte ? versHtml(m.texte) : undefined),
    inReplyTo: m.enReponseA || undefined,
    references: m.references && m.references.length ? m.references : (m.enReponseA ? [m.enReponseA] : undefined),
    attachments: pieces,
  };
}

function transport() {
  if (!MOT_DE_PASSE) throw new Error("COURRIEL_ABSENT");
  return nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: UTILISATEUR, pass: MOT_DE_PASSE } });
}

export async function envoyer(m) {
  if (!motVerifie) await avecImap(async () => null);
  const msg = await composer(m);
  if (!msg.to.length) throw new Error("Aucun destinataire");
  const info = await transport().sendMail(msg);
  return { idMessage: info.messageId, acceptes: info.accepted };
}

export async function brouillon(m) {
  const msg = await composer(m);
  const brut = await brutBrouillon(msg);
  return avecImap(async (client) => {
    const c = await chemins(client);
    const r = await client.append(c.brouillons, brut, ["\\Draft", "\\Seen"]);
    return { uid: r && r.uid ? r.uid : null };
  });
}

export async function envoyerBrouillon(uid) {
  return avecImap(async (client) => {
    const c = await chemins(client);
    const m = await source(client, c.brouillons, uid);
    const p = await simpleParser(m.source);
    if (!autorise(p)) throw new Error("Ce brouillon n'est pas un courriel de info@sylvainbrochu.ca");
    const x = (v) => (v ? v.value.map((a) => a.address).filter(Boolean) : []);
    const r = await reglages();
    const info = await transport().sendMail({
      from: { name: r.expediteurNom || "Sylvain Brochu", address: INFO },
      to: x(p.to), cc: x(p.cc), bcc: x(p.bcc), subject: p.subject || "", text: p.text || "", html: p.html || undefined,
      inReplyTo: p.inReplyTo || undefined, references: p.references || undefined,
      attachments: (p.attachments || []).map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType, cid: a.cid })),
    });
    const lock = await client.getMailboxLock(c.brouillons);
    try { await client.messageDelete(String(uid), { uid: true }); } finally { lock.release(); }
    return { idMessage: info.messageId, a: x(p.to) };
  });
}

export async function supprimerBrouillon(uid) {
  return avecImap(async (client) => {
    const c = await chemins(client);
    const m = await source(client, c.brouillons, uid);
    const p = await simpleParser(m.source);
    if (!autorise(p)) throw new Error("Accès refusé");
    const lock = await client.getMailboxLock(c.brouillons);
    try { await client.messageDelete(String(uid), { uid: true }); } finally { lock.release(); }
    return { ok: true };
  });
}

// Pour chaque adresse de candidature : dernier envoi depuis info@, dernière réponse reçue, brouillon en attente.
export async function synchroniser(liste) {
  const propres = [...new Set((liste || []).map((x) => String(x).trim().toLowerCase()).filter((x) => /@/.test(x)))].slice(0, 60);
  return avecImap(async (client) => {
    const c = await chemins(client);
    const out = {};
    const lockTous = await client.getMailboxLock(c.tous);
    try {
      for (const ad of propres) {
        const r = { envois: [], reponses: [], brouillons: 0 };
        const env = (await client.search({ gmraw: `from:${INFO} to:${ad} -in:drafts` }, { uid: true })) || [];
        if (env.length) for await (const m of client.fetch(env.slice(-10), { uid: true, envelope: true, internalDate: true }, { uid: true })) r.envois.push({ date: m.internalDate.toISOString(), sujet: m.envelope.subject, idMessage: m.envelope.messageId, uid: m.uid });
        const rep = (await client.search({ gmraw: `from:${ad} -in:drafts` }, { uid: true })) || [];
        if (rep.length) for await (const m of client.fetch(rep.slice(-10), { uid: true, envelope: true, internalDate: true }, { uid: true })) r.reponses.push({ date: m.internalDate.toISOString(), sujet: m.envelope.subject, uid: m.uid });
        r.envois.sort((a, b) => a.date.localeCompare(b.date)); r.reponses.sort((a, b) => a.date.localeCompare(b.date));
        out[ad] = r;
      }
    } finally { lockTous.release(); }
    const lockB = await client.getMailboxLock(c.brouillons);
    try {
      for (const ad of propres) {
        const b = (await client.search({ gmraw: `to:${ad}` }, { uid: true })) || [];
        out[ad].brouillons = b.length;
        out[ad].brouillonUids = b;
      }
    } finally { lockB.release(); }
    return out;
  });
}

// Crée dans Gmail les brouillons des candidatures « Brouillon prêt » qui n'en ont pas encore.
export async function recreerBrouillons(candidatures, remplacer = false) {
  const r = await reglages();
  const sig = r.signature || "";
  const liste = (candidatures || []).filter((c) => c && c.statut === "brouillon" && /@/.test(c.courriel || "") && c.texte);
  const out = { crees: [], deja: [] };
  if (!liste.length) return out;
  await avecImap(async (client) => {
    const ch = await chemins(client);
    const lock = await client.getMailboxLock(ch.brouillons);
    try {
      for (const c of liste) {
        const ad = c.courriel.trim().toLowerCase();
        const existe = (await client.search({ gmraw: `to:${ad} from:${INFO}` }, { uid: true })) || [];
        if (existe.length && !remplacer) { out.deja.push(ad); continue; }
        if (existe.length) await client.messageDelete(existe, { uid: true });
        const texte = sig && !c.texte.includes(sig.split("\n")[0] + "\n") ? `${c.texte.trimEnd()}\n\n${sig}` : c.texte;
        const msg = await composer({ a: ad, cci: r.cci || "", sujet: c.objet || "", texte, piece: c.cv || "carriere" });
        const brut = await brutBrouillon(msg);
        await client.append(ch.brouillons, brut, ["\\Draft", "\\Seen"]);
        out.crees.push(ad);
      }
    } finally { lock.release(); }
  });
  return out;
}

export async function etat() {
  if (!MOT_DE_PASSE) return { pret: false, raison: "MAIL_APP_PASSWORD absent", boite: UTILISATEUR };
  try {
    const n = await avecImap(async (client) => { const c = await chemins(client); return c; });
    return { pret: true, boite: UTILISATEUR, dossiers: n };
  } catch (e) {
    const detail = [e.responseText, e.serverResponseCode, e.code].filter(Boolean).join(" | ");
    const raison = e.authenticationFailed ? `Gmail refuse le mot de passe d'application (${detail || e.message})` : (detail ? `${e.message} : ${detail}` : e.message);
    return { pret: false, raison, boite: UTILISATEUR, longueurMotDePasse: BRUT.length, essais: CANDIDATS.length };
  }
}
