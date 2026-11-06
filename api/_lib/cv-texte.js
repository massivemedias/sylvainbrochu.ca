// Sortir le texte d'un fichier envoyé dans l'admin : .docx, .pdf, .txt, .rtf, .html.
// Aucune dépendance : un .docx est un zip (zlib suffit), un .pdf se lit par ses flux de contenu.
// Un PDF scanné (une image) ne donne rien : on le dit clairement plutôt que de renvoyer du charabia.
import zlib from "node:zlib";
import { texteDuPdf } from "./cv-pdf.js";

// ---------- ZIP (pour .docx) ----------
function fichierDuZip(buf, nom) {
  // Fin du répertoire central
  let fin = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error("Fichier Word illisible.");
  let p = buf.readUInt32LE(fin + 16);
  const total = buf.readUInt16LE(fin + 10);
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const methode = buf.readUInt16LE(p + 10);
    const lgNom = buf.readUInt16LE(p + 28), lgExtra = buf.readUInt16LE(p + 30), lgComm = buf.readUInt16LE(p + 32);
    const taille = buf.readUInt32LE(p + 20);
    const depart = buf.readUInt32LE(p + 42);
    const ceNom = buf.toString("utf8", p + 46, p + 46 + lgNom);
    if (ceNom === nom) {
      const lgNom2 = buf.readUInt16LE(depart + 26), lgExtra2 = buf.readUInt16LE(depart + 28);
      const d = depart + 30 + lgNom2 + lgExtra2;
      const brut = buf.subarray(d, d + taille);
      return methode === 0 ? brut : zlib.inflateRawSync(brut);
    }
    p += 46 + lgNom + lgExtra + lgComm;
  }
  return null;
}

const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decoder = (s) => s.replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => ENTITES[n]).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

function texteDocx(buf) {
  const xml = fichierDuZip(buf, "word/document.xml");
  if (!xml) throw new Error("Ce fichier Word ne contient pas de texte lisible.");
  const s = xml.toString("utf8");
  const lignes = [];
  for (const m of s.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>|<w:p\b[^>]*\/>/g)) {
    const corps = m[1] || "";
    const puce = /<w:numPr\b/.test(corps) || /<w:pStyle[^>]+w:val="[^"]*(List|Bullet|Puce|Para)[^"]*"/i.test(corps);
    let t = corps
      .replace(/<w:tab\b[^>]*\/?>/g, " ")
      .replace(/<w:br\b[^>]*\/?>/g, "\n")
      .replace(/<\/w:p>/g, "")
      .replace(/<[^>]+>/g, "");
    t = decoder(t).replace(/[ \t ]+/g, " ").trim();
    for (const bout of t.split("\n")) {
      const l = bout.trim();
      lignes.push(l && puce ? "• " + l : l);
    }
  }
  return lignes.join("\n");
}

// ---------- Entrée ----------
export function extraireTexte(nomFichier, buf) {
  const ext = (nomFichier.match(/\.([a-z0-9]+)$/i) || ["", ""])[1].toLowerCase();
  if (ext === "docx" || (buf[0] === 0x50 && buf[1] === 0x4b && ext !== "pdf")) return { texte: texteDocx(buf), type: "docx" };
  if (ext === "pdf" || buf.subarray(0, 5).toString("latin1") === "%PDF-") {
    const t = texteDuPdf(buf);
    const lettres = (t.match(/[a-zà-ÿ]/gi) || []).length;
    if (lettres < 120) throw new Error("Ce PDF ne contient pas de texte lisible, c'est sans doute un scan ou une image. Envoie plutôt le fichier Word (.docx), ou colle le texte du CV dans la case prévue.");
    return { texte: t, type: "pdf" };
  }
  if (ext === "rtf") return { texte: buf.toString("utf8").replace(/\\par[d]?/g, "\n").replace(/\{\\[^{}]*\}/g, "").replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\[a-z]+-?\d* ?/gi, "").replace(/[{}]/g, "").trim(), type: "rtf" };
  if (ext === "html" || ext === "htm") return { texte: decoder(buf.toString("utf8").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<li\b[^>]*>/gi, "• ").replace(/<[^>]+>/g, "")), type: "html" };
  if (ext === "doc") throw new Error("L'ancien format Word (.doc) n'est pas lisible ici. Ouvre-le dans Word et enregistre-le en .docx, ou colle le texte du CV.");
  return { texte: buf.toString("utf8"), type: "texte" };
}
