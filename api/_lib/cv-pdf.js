// Lire le texte d'un PDF sans dépendance.
// Les PDF faits par Word, Google Docs ou LibreOffice embarquent des polices en sous-ensemble :
// les chaînes contiennent des numéros de glyphes, pas des lettres. Il faut donc passer par la
// table « ToUnicode » de chaque police, sinon on ne récupère que du charabia.
import zlib from "node:zlib";

const inflate = (b) => { try { return zlib.inflateSync(b); } catch { try { return zlib.inflateRawSync(b); } catch { return null; } } };

// ---------- Objets du fichier ----------
function lireObjets(buf) {
  const brut = buf.toString("latin1");
  const objets = new Map();
  for (const m of brut.matchAll(/(\d+)\s+\d+\s+obj\b/g)) {
    const num = Number(m[1]);
    const depart = m.index + m[0].length;
    const posFlux = brut.indexOf("stream", depart);
    let posFin = brut.indexOf("endobj", depart);
    if (posFin < 0) posFin = brut.length;
    if (posFlux >= 0 && posFlux < posFin) {
      const dict = brut.slice(depart, posFlux);
      let d = posFlux + 6;
      if (brut[d] === "\r") d++;
      if (brut[d] === "\n") d++;
      const lg = /\/Length\s+(\d+)[^0-9R]/.exec(dict);
      let fin = lg ? d + Number(lg[1]) : -1;
      if (fin < 0 || brut.slice(fin, fin + 20).indexOf("endstream") < 0) fin = brut.indexOf("endstream", d);
      objets.set(num, { dict, flux: buf.subarray(d, fin < 0 ? d : fin) });
    } else {
      objets.set(num, { dict: brut.slice(depart, posFin), flux: null });
    }
  }
  // Objets rangés dans des flux d'objets (PDF récents)
  for (const [, o] of [...objets]) {
    if (!o.flux || !/\/ObjStm/.test(o.dict)) continue;
    const d = inflate(o.flux); if (!d) continue;
    const s = d.toString("latin1");
    const n = Number(/\/N\s+(\d+)/.exec(o.dict)?.[1] || 0);
    const first = Number(/\/First\s+(\d+)/.exec(o.dict)?.[1] || 0);
    const tete = s.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const num = tete[i * 2], dec = tete[i * 2 + 1];
      if (!Number.isFinite(num) || objets.has(num)) continue;
      const fin = i + 1 < n ? first + tete[i * 2 + 3] : s.length;
      objets.set(num, { dict: s.slice(first + dec, fin), flux: null });
    }
  }
  return objets;
}

const contenuFlux = (o) => (o && o.flux ? (/\/Flate/.test(o.dict) ? inflate(o.flux) : o.flux) : null);

// ---------- Tables ToUnicode ----------
function lireCMap(txt) {
  const table = new Map();
  let largeur = 2;
  const code = (h) => parseInt(h, 16);
  const uni = (h) => { let o = ""; for (let i = 0; i < h.length; i += 4) o += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return o; };
  for (const bloc of txt.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of bloc[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) { largeur = Math.max(1, p[1].length / 2); table.set(code(p[1]), uni(p[2])); }
  }
  for (const bloc of txt.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of bloc[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]*)>|\[([\s\S]*?)\])/g)) {
      const a = code(p[1]), b = code(p[2]);
      largeur = Math.max(1, p[1].length / 2);
      if (p[3] !== undefined) { const base = code(p[3]); for (let c = a; c <= b && c - a < 65536; c++) table.set(c, String.fromCharCode(base + (c - a))); }
      else { const liste = [...p[4].matchAll(/<([0-9A-Fa-f]*)>/g)]; liste.forEach((x, i) => table.set(a + i, uni(x[1]))); }
    }
  }
  return { table, largeur };
}

function cartesDesPolices(objets) {
  const parObjet = new Map(); // numéro d'objet police -> cmap
  for (const [num, o] of objets) {
    const r = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(o.dict);
    if (!r) continue;
    const flux = contenuFlux(objets.get(Number(r[1])));
    if (flux) parObjet.set(num, lireCMap(flux.toString("latin1")));
  }
  // Le dictionnaire des polices d'une page est soit écrit sur place, soit renvoyé à un autre objet.
  const parNom = new Map(); // /F1 -> cmap
  const noter = (texte) => {
    for (const p of texte.matchAll(/\/([A-Za-z0-9#+.-]+)\s+(\d+)\s+\d+\s+R/g)) {
      const c = parObjet.get(Number(p[2]));
      if (c && !parNom.has(p[1])) parNom.set(p[1], c);
    }
  };
  for (const [, o] of objets) {
    for (const d of o.dict.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) noter(d[1]);
    for (const d of o.dict.matchAll(/\/Font\s+(\d+)\s+\d+\s+R/g)) {
      const cible = objets.get(Number(d[1]));
      if (cible) noter(cible.dict);
    }
  }
  return parNom;
}

// ---------- Texte d'un flux de contenu ----------
const WIN = { 0x91: "'", 0x92: "'", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "-", 0x97: "-", 0x85: "..." };
const litteral = (s) => s.replace(/\\(\n|n|r|t|b|f|\(|\)|\\|[0-7]{1,3})/g, (_, c) =>
  c === "n" || c === "\n" ? "" : c === "r" ? "" : c === "t" ? " " : c === "b" || c === "f" ? "" : /^[0-7]+$/.test(c) ? String.fromCharCode(parseInt(c, 8)) : c);
const octetsHexa = (h) => { const x = h.replace(/[^0-9A-Fa-f]/g, ""); const o = []; for (let i = 0; i < x.length; i += 2) o.push(parseInt(x.slice(i, i + 2).padEnd(2, "0"), 16)); return o; };
const octetsTexte = (s) => [...s].map((c) => c.charCodeAt(0));

function decoder(octets, cmap) {
  if (!cmap) return octets.map((c) => WIN[c] ?? (c === 0 ? "" : String.fromCharCode(c))).join("");
  let out = "";
  if (cmap.largeur === 2) { for (let i = 0; i + 1 < octets.length; i += 2) out += cmap.table.get((octets[i] << 8) | octets[i + 1]) ?? ""; }
  else for (const c of octets) out += cmap.table.get(c) ?? "";
  return out;
}

function texteDuContenu(s, polices) {
  const lignes = [];
  let tx = 0, ty = 0;        // matrice de ligne (BT la remet à zéro)
  let posY = null, posX = null; // position de ce qui est déjà dans la ligne en cours
  let courant = "", cmap = null;
  const finirLigne = () => { const t = courant.replace(/\s+/g, " ").trim(); if (t) lignes.push(t); courant = ""; };
  const placer = () => {
    if (posY !== null && Math.abs(ty - posY) > 2.2) finirLigne();
    else if (posY !== null && tx > posX + 1 && courant && !/\s$/.test(courant)) courant += " ";
    posY = ty; posX = tx;
  };

  const re = /\/([A-Za-z0-9#+.-]+)\s+[\d.]+\s+Tf|\(((?:\\.|[^\\()])*)\)\s*(?:Tj|')|\[((?:\\.|[^\]])*)\]\s*TJ|<([0-9A-Fa-f\s]*)>\s*(?:Tj|')|(-?[\d.]+)\s+(-?[\d.]+)\s+(?:Td|TD)|(?:-?[\d.]+\s+){4}(-?[\d.]+)\s+(-?[\d.]+)\s+Tm|\bT\*|\bBT\b|\bET\b/g;
  for (const m of s.matchAll(re)) {
    if (m[1] !== undefined) { cmap = polices.get(m[1]) || null; continue; }
    if (m[2] !== undefined) { placer(); courant += decoder(octetsTexte(litteral(m[2])), cmap); continue; }
    if (m[3] !== undefined) {
      placer();
      for (const p of m[3].matchAll(/\(((?:\\.|[^\\()])*)\)|<([0-9A-Fa-f\s]+)>|(-?[\d.]+)/g)) {
        if (p[1] !== undefined) courant += decoder(octetsTexte(litteral(p[1])), cmap);
        else if (p[2] !== undefined) courant += decoder(octetsHexa(p[2]), cmap);
        else if (Number(p[3]) < -170) courant += " ";
      }
      continue;
    }
    if (m[4] !== undefined) { placer(); courant += decoder(octetsHexa(m[4]), cmap); continue; }
    if (m[5] !== undefined) { tx += Number(m[5]); ty += Number(m[6]); continue; }
    if (m[7] !== undefined) { tx = Number(m[7]); ty = Number(m[8]); continue; }
    const op = m[0].trim();
    if (op === "BT") { tx = 0; ty = 0; continue; }
    if (op === "T*") { ty -= 12; continue; }
    finirLigne(); posY = null; posX = null; // ET
  }
  finirLigne();
  return lignes;
}

// Les polices à symboles (Wingdings, Symbol) rendent la puce dans la zone privée Unicode.
const NORMALISER = (s) => s.replace(/[\uf000-\uf0ff]/g, (c) => String.fromCharCode(c.charCodeAt(0) & 0xff));
const PUCE_SEULE = /^[\u2022\u00b7\u25cf\u25aa\u25a0\u25e6\u2023\u2043\u00a4\u00de*\u2219-]\s*$/;

export function texteDuPdf(buf) {
  const objets = lireObjets(buf);
  const polices = cartesDesPolices(objets);
  const lignes = [];
  for (const [, o] of objets) {
    if (!o.flux || /\/(ObjStm|XObject|Font|Metadata|XRef)\b/.test(o.dict) || /\/Subtype\s*\/(Image|Type1C|TrueType|CIDFontType0C)/.test(o.dict)) continue;
    const d = contenuFlux(o); if (!d) continue;
    const s = d.toString("latin1");
    if (!/\bTj\b|\bTJ\b/.test(s)) continue;
    lignes.push(...texteDuContenu(s, polices));
  }
  // Une puce dessinée à part (sa propre commande de texte) est recollée à la ligne qu'elle annonce.
  const sortie = [];
  let puce = "";
  for (const brute of lignes) {
    const l = NORMALISER(brute).trim();
    if (!l) continue;
    if (PUCE_SEULE.test(l)) { puce = "\u2022 "; continue; }
    sortie.push(puce + l); puce = "";
  }
  return sortie.join("\n").trim();
}
