// Blocs d'une page : les grandes sections, enfants directs de <main>.
// Sert à « Organiser la page » dans l'admin : réordonner, masquer, déplacer une section
// vers une autre page. Aucune dépendance : un petit scanner de balises suffit.
import { createHash } from "node:crypto";

const VIDES = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const BRUTS = new Set(["script", "style", "textarea", "title"]);
// Ce qui compte comme un bloc déplaçable au premier niveau de <main>.
const BLOCS = new Set(["section", "header", "article", "aside", "div", "footer", "nav", "figure", "p", "ul", "ol", "h1", "h2", "blockquote"]);

const empreinte = (s) => createHash("sha1").update(s).digest("hex").slice(0, 10);

function finBalise(h, i) {
  let j = i + 1, q = null;
  while (j < h.length) {
    const c = h[j];
    if (q) { if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === ">") return j;
    j++;
  }
  return -1;
}

function sauterBrut(h, i, nom) {
  const f = new RegExp(`</\\s*${nom}\\s*>`, "i");
  const reste = h.slice(i);
  const m = f.exec(reste);
  return m ? i + m.index + m[0].length : h.length;
}

// Renvoie l'index juste après la balise fermante de l'élément qui commence à `debut`.
function finElement(h, debut) {
  const f = finBalise(h, debut);
  if (f < 0) return -1;
  const ouvrante = h.slice(debut, f + 1);
  const nom = (/^<\s*([a-zA-Z0-9-]+)/.exec(ouvrante) || [])[1];
  if (!nom) return -1;
  const n = nom.toLowerCase();
  if (VIDES.has(n) || /\/>\s*$/.test(ouvrante)) return f + 1;
  if (BRUTS.has(n)) return sauterBrut(h, f + 1, n);
  let niveau = 1, i = f + 1;
  while (i < h.length) {
    if (h.startsWith("<!--", i)) { const e = h.indexOf("-->", i); i = e < 0 ? h.length : e + 3; continue; }
    if (h[i] !== "<") { i++; continue; }
    const fb = finBalise(h, i);
    if (fb < 0) return -1;
    const t = h.slice(i, fb + 1);
    const m = /^<\s*(\/?)\s*([a-zA-Z0-9-]+)/.exec(t);
    if (!m) { i = fb + 1; continue; }
    const tn = m[2].toLowerCase();
    if (!m[1] && BRUTS.has(tn)) { i = sauterBrut(h, fb + 1, tn); continue; }
    if (tn === n) {
      if (m[1]) { niveau--; if (!niveau) return fb + 1; }
      else if (!VIDES.has(tn) && !/\/>\s*$/.test(t)) niveau++;
    }
    i = fb + 1;
  }
  return -1;
}

const DECODE = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&eacute;": "é", "&egrave;": "è", "&agrave;": "à", "&ccedil;": "ç", "&rsquo;": "'", "&laquo;": "«", "&raquo;": "»", "&hellip;": "..." };
export function texteBrut(h) {
  return String(h || "")
    .replace(/<(script|style|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (e) => DECODE[e.toLowerCase()] || " ")
    .replace(/\s+/g, " ").trim();
}

function titreDe(html, tag) {
  const sur = /<[a-z0-9]+[^>]*class="[^"]*\bsurtitre\b[^"]*"[^>]*>([\s\S]*?)<\/[a-z0-9]+>/i.exec(html);
  const hx = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(html);
  const a = texteBrut(sur ? sur[1] : "").slice(0, 60);
  const b = texteBrut(hx ? hx[1] : "").slice(0, 70);
  if (a && b) return `${a} : ${b}`;
  if (b) return b;
  if (a) return a;
  const aria = /\saria-label="([^"]+)"/i.exec(html);
  if (aria) return texteBrut(aria[1]).slice(0, 70);
  const cl = /^<[a-z0-9]+[^>]*\sclass="([^"]+)"/i.exec(html);
  if (cl) return cl[1].split(/\s+/)[0].replace(/-/g, " ");
  const t = texteBrut(html).slice(0, 70);
  return t || tag;
}

function resumeDe(html) {
  const t = texteBrut(html.replace(/<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>/gi, " "));
  return t.length > 120 ? t.slice(0, 117) + "..." : t;
}

const estMasque = (html) => /^<[a-z0-9]+[^>]*\shidden(?=[\s>/])/i.test(html);
const ancreDe = (html) => (/^<[a-z0-9]+[^>]*\sid="([^"]+)"/i.exec(html) || [])[1] || "";
const nbPhotos = (html) => (html.match(/<img\b/gi) || []).length;

// ---------- Découpage ----------
export function decouper(html) {
  const o = /<main\b[^>]*>/i.exec(html);
  if (!o) return null;
  const debut = o.index + o[0].length;
  const fin = finElement(html, o.index);
  if (fin < 0) return null;
  const ferm = /<\/main\s*>\s*$/i.exec(html.slice(debut, fin));
  const finInterieur = ferm ? debut + ferm.index : fin;
  const interieur = html.slice(debut, finInterieur);

  const blocs = [];
  let i = 0;
  while (i < interieur.length) {
    if (interieur.startsWith("<!--", i)) { const e = interieur.indexOf("-->", i); i = e < 0 ? interieur.length : e + 3; continue; }
    if (interieur[i] !== "<") { i++; continue; }
    const fb = finBalise(interieur, i);
    if (fb < 0) break;
    const nom = (/^<\s*([a-zA-Z0-9-]+)/.exec(interieur.slice(i, fb + 1)) || [])[1];
    if (!nom || !BLOCS.has(nom.toLowerCase())) { i = fb + 1; continue; }
    const f = finElement(interieur, i);
    if (f < 0) break;
    const brut = interieur.slice(i, f);
    blocs.push({ tag: nom.toLowerCase(), html: brut });
    i = f;
  }
  if (!blocs.length) return null;

  const vus = new Map();
  blocs.forEach((b, n) => {
    let id = empreinte(b.html);
    const d = (vus.get(id) || 0) + 1;
    vus.set(id, d);
    if (d > 1) id = `${id}-${d}`;
    b.id = id;
    b.rang = n;
    b.titre = titreDe(b.html, b.tag);
    b.resume = resumeDe(b.html);
    b.masque = estMasque(b.html);
    b.ancre = ancreDe(b.html);
    b.photos = nbPhotos(b.html);
    b.taille = b.html.length;
  });
  return { avant: html.slice(0, debut), apres: html.slice(finInterieur), blocs };
}

// Vue légère pour l'admin (sans le HTML complet, qui pèse lourd).
export const apercu = (d) => d.blocs.map((b) => ({ id: b.id, tag: b.tag, titre: b.titre, resume: b.resume, masque: b.masque, ancre: b.ancre, photos: b.photos }));

// ---------- Réécriture ----------
function poserMasque(html, masque) {
  const f = finBalise(html, 0);
  if (f < 0) return html;
  let ouvrante = html.slice(0, f + 1);
  const reste = html.slice(f + 1);
  ouvrante = ouvrante.replace(/\shidden(?=[\s>/])/i, "");
  if (masque) ouvrante = ouvrante.replace(/\s*(\/?)>$/, " hidden$1>");
  return ouvrante + reste;
}

export function recomposer(d, blocs) {
  const corps = blocs.map((b) => "\n\n" + b.html.trim()).join("");
  return d.avant + corps + "\n\n" + d.apres.replace(/^\s*/, "");
}

// Applique un ordre (liste d'identifiants) et des masques à une page déjà découpée.
// Renvoie { html, sortis } : les blocs retirés de la page (pour un déplacement).
export function appliquer(d, ordre, masques, sortants) {
  const parId = new Map(d.blocs.map((b) => [b.id, b]));
  const sortirs = new Set(sortants || []);
  const garde = [];
  for (const id of ordre) {
    const b = parId.get(id);
    if (!b) throw new Error("Cette page a changé depuis que tu l'as ouverte. Recharge-la, puis refais ton organisation.");
    if (sortirs.has(id)) continue;
    garde.push({ ...b, html: poserMasque(b.html, (masques || []).includes(id)) });
  }
  const sortis = [...sortirs].map((id) => {
    const b = parId.get(id);
    if (!b) throw new Error("Cette page a changé depuis que tu l'as ouverte. Recharge-la, puis refais ton organisation.");
    return { ...b, html: poserMasque(b.html, false) };
  });
  if (!garde.some((b) => !estMasque(b.html))) throw new Error("Il doit rester au moins une section visible sur la page.");
  return { html: recomposer(d, garde), sortis };
}

// Insère des blocs dans une page cible. position : "debut", "fin", ou l'identifiant d'un bloc (insertion après lui).
export function inserer(d, entrants, position) {
  const liste = d.blocs.slice();
  let i = liste.length;
  if (position === "debut") i = 0;
  else if (position && position !== "fin") {
    const n = liste.findIndex((b) => b.id === position);
    i = n < 0 ? liste.length : n + 1;
  }
  liste.splice(i, 0, ...entrants);
  return recomposer(d, liste);
}

// Le chemin de la page jumelle (FR <-> EN), d'après <link rel="alternate">.
export function jumeau(html, chemin) {
  const versEn = !chemin.startsWith("en/");
  const r = new RegExp(`<link[^>]*rel="alternate"[^>]*hreflang="${versEn ? "en" : "fr"}[^"]*"[^>]*>`, "i");
  const l = r.exec(html);
  if (!l) return "";
  const h = /href="([^"]+)"/i.exec(l[0]);
  if (!h) return "";
  try {
    const p = new URL(h[1], "https://www.sylvainbrochu.ca/").pathname.replace(/^\//, "");
    return (p.endsWith("/") || !p ? p : p + "/") + "index.html";
  } catch { return ""; }
}
