// Génère le CV en PDF (texte sélectionnable) avec la mise en page du modèle Google Doc :
// Arial, nom en capitales gris foncé, titre en italique, titres de section bleus, puces rondes.
import { EMOJIS } from "./emojis.js";

const GRIS = "#434343", GRIS_CLAIR = "#999999", BLEU = "#3f6caf", LIEN = "#1155cc";
const propre = (s) => String(s || "").replace(/[\u2013\u2014]/g, "-");

function ligneContact(morceaux) {
  const cols = [];
  morceaux.forEach((m) => {
    if (m.icone) cols.push({ image: EMOJIS[m.icone], width: 10.5, margin: [0, 1.6, 4.5, 0] });
    cols.push({ text: m.texte, width: "auto" });
  });
  return { columns: cols, columnGap: 0, margin: [0, 0, 0, 2.6] };
}

export function construireCV(cv) {
  const c = cv || {};
  const contenu = [
    { text: propre(c.nom || "SYLVAIN BROCHU"), fontSize: 26, bold: true, color: GRIS, lineHeight: 1 },
    { text: propre(c.titre), fontSize: 15, italics: true, color: "#666666", margin: [0, 3, 0, 18], lineHeight: 1.1 },
  ];
  const l1 = [];
  if (c.courriel) l1.push({ icone: "courriel", texte: [propre(c.courriel), c.telephone ? "  |  " : ""] });
  if (c.telephone) l1.push({ icone: "telephone", texte: propre(c.telephone) });
  if (l1.length) contenu.push(ligneContact(l1));
  if (c.linkedin) contenu.push(ligneContact([{ icone: "lien", texte: ["LinkedIn: ", { text: c.linkedin, link: c.linkedin, color: LIEN, decoration: "underline" }] }]));
  if (c.site) contenu.push(ligneContact([{ icone: "lien", texte: ["Portfolio & site web: ", { text: c.site, link: c.site, color: LIEN, decoration: "underline" }] }]));
  if (c.lieu) contenu.push(ligneContact([{ icone: "lieu", texte: propre(c.lieu) }]));

  const compact = Boolean(c.compact);
  const titre = (t) => ({ text: propre(t).toUpperCase(), fontSize: 13, bold: true, color: BLEU, margin: [0, compact ? 9 : 15, 0, compact ? 2 : 4], headlineLevel: 1, lineHeight: 1.1 });
  const puces = (items) => ({ ul: items, margin: [24, 2, 0, 0], markerColor: GRIS });

  if (c.profil) { contenu.push(titre("Profil")); contenu.push({ text: propre(c.profil) }); }
  if ((c.competences || []).length) {
    contenu.push(titre(c.titreCompetences || "Compétences clés"));
    contenu.push(puces(c.competences.filter((x) => x.label || x.texte).map((x) => ({ text: [{ text: propre(x.label) + (x.texte ? " : " : ""), bold: true }, propre(x.texte)] }))));
  }
  if ((c.experiences || []).length) {
    contenu.push(titre(c.titreExperiences || "Expériences professionnelles"));
    c.experiences.forEach((x, i) => {
      const poste = propre(x.poste) + (x.employeur ? " - " + propre(x.employeur) : "");
      const tete = c.disposition === "une_ligne"
        ? { columns: [{ text: poste, bold: true, italics: true, color: "#000000", width: "*" }, { text: propre(x.lieu), italics: true, color: GRIS_CLAIR, width: "auto", alignment: "right", margin: [10, 0, 0, 0] }], margin: [0, i ? (compact ? 6 : 9) : 2, 0, 0], headlineLevel: 2 }
        : { stack: [{ text: poste, bold: true, italics: true, color: "#000000" }, { text: propre(x.lieu), bold: true, italics: true, color: GRIS_CLAIR }], margin: [0, i ? (compact ? 6 : 9) : 2, 0, 0], headlineLevel: 2 };
      contenu.push(tete);
      const p = (x.puces || []).map(propre).filter(Boolean);
      if (p.length) contenu.push(puces(p));
    });
  }
  (c.sections || []).forEach((s) => {
    const p = (s.puces || []).map(propre).filter(Boolean);
    if (!s.titre && !p.length) return;
    contenu.push(titre(s.titre));
    if (p.length) contenu.push(puces(p));
  });

  return {
    pageSize: "LETTER",
    pageMargins: compact ? [58, 40, 58, 30] : [72, 66, 72, 54],
    info: { title: `CV ${propre(c.nom || "Sylvain Brochu")}`, author: "Sylvain Brochu" },
    defaultStyle: { font: "Arial", fontSize: compact ? 9.6 : 10, color: GRIS, lineHeight: compact ? 1.16 : 1.42 },
    content: contenu,
    // Jamais un titre seul en bas de page
    pageBreakBefore: (n, suivants) => Boolean(n.headlineLevel) && suivants.length === 0,
  };
}

// ---------- Navigateur ----------
let pret = null;
async function b64(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  let s = ""; const o = new Uint8Array(buf);
  for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode.apply(null, o.subarray(i, i + 0x8000));
  return btoa(s);
}
async function preparer() {
  if (pret) return pret;
  pret = (async () => {
    if (!window.pdfMake) await new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "/admin/vendor/pdfmake.min.js"; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
    const noms = ["Regular", "Bold", "Italic", "BoldItalic"];
    const vfs = {};
    await Promise.all(noms.map(async (n) => { vfs[`ls-${n}.ttf`] = await b64(`/admin/polices/ls-${n}.ttf`); }));
    window.pdfMake.vfs = vfs;
    window.pdfMake.fonts = { Arial: { normal: "ls-Regular.ttf", bold: "ls-Bold.ttf", italics: "ls-Italic.ttf", bolditalics: "ls-BoldItalic.ttf" } };
  })();
  return pret;
}

export async function genererPDF(cv) {
  await preparer();
  const doc = window.pdfMake.createPdf(construireCV(cv));
  const base64 = await new Promise((ok) => doc.getBase64(ok));
  const binaire = atob(base64);
  const pages = (binaire.match(/\/Type\s*\/Page[^s]/g) || []).length;
  return { doc, base64, pages };
}
