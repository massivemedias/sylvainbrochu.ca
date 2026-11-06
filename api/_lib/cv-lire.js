// Transformer le texte brut d'un CV en la structure utilisée par l'admin et par le PDF.
// Le but n'est pas d'être parfait : c'est de donner à Sylvain un CV déjà rangé dans la bonne
// mise en page, qu'il corrige ensuite dans l'éditeur. Chaque champ non reconnu reste vide.

const RE_COURRIEL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const RE_LINKEDIN = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/[^\s|,;)]+/i;
const RE_SITE = /(?:https?:\/\/)[^\s|,;)]+/i;
const RE_TEL = /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const RE_ANNEE = /\b(19|20)\d{2}\b/;
const PUCE = /^[\s]*[•·▪●◦‣⁃*∙]\s*|^[\s]*[-–—]\s+/;

// Titres de section reconnus, français et anglais.
const SECTIONS = [
  ["profil", /^(profil|profile|sommaire|r[ée]sum[ée]|about ?me|summary|objectif|pr[ée]sentation|qui suis|professional summary)\b/i],
  ["competences", /^(comp[ée]tences?|aptitudes?|savoir[- ]faire|skills|core skills|key skills|expertise|qualifications?|atouts?)\b/i],
  ["experiences", /^(exp[ée]riences?|parcours|emplois?|carri[èe]re|work experience|employment|professional experience|historique)\b/i],
  ["formation", /^(formations?|[ée]ducation|dipl[ôo]mes?|scolarit[ée]|[ée]tudes|academic|education)\b/i],
  ["langues", /^(langues?|languages?)\b/i],
  ["autres", /^(autres?|divers|b[ée]n[ée]volat|certifications?|r[ée]alisations?|projets?|int[ée]r[êe]ts?|loisirs|r[ée]f[ée]rences?|volunteer|awards|prix|distinctions?|publications?|formations compl)\b/i],
];
const TITRES_JOLIS = { formation: "Formation", langues: "Langues", autres: "Autres expériences" };

const sansPuce = (l) => l.replace(PUCE, "").trim();
const estPuce = (l) => PUCE.test(l);
const motsDe = (l) => l.trim().split(/\s+/).filter(Boolean);

// Une ligne est un titre de section si elle est courte et qu'elle colle à un mot-clé,
// ou si elle est courte, sans ponctuation finale, et tout en majuscules. « Langues : français,
// anglais » n'est pas un titre mais une ligne de compétence : un deux-points suivi de texte
// disqualifie la ligne. Les majuscules ne comptent qu'après l'en-tête, sinon le nom en
// capitales en haut du CV passerait pour un titre de section.
function titreSection(ligne, dansEntete) {
  const l = sansPuce(ligne).replace(/[:：]\s*$/, "").trim();
  if (!l || l.length > 60 || motsDe(l).length > 6) return null;
  if (/[:：]\s*\S/.test(l) || /[.;,]$/.test(l)) return null;
  for (const [cle, re] of SECTIONS) if (re.test(l)) return { cle, libelle: l };
  if (dansEntete) return null;
  const lettres = l.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (lettres.length > 2 && lettres === lettres.toUpperCase() && !RE_ANNEE.test(l)) return { cle: "autres", libelle: l };
  return null;
}

// « COMPÉTENCES CLÉS » -> « Compétences clés » ; un titre déjà écrit normalement n'est pas touché.
function joliTitre(s) {
  const t = String(s || "").trim();
  const lettres = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (lettres.length > 2 && lettres === lettres.toUpperCase()) return t.charAt(0) + t.slice(1).toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// « Montréal, Québec | 2021 - 2024 », « 2015 à aujourd'hui », « Jan 2020 - Déc 2022 »
const estLigneDates = (l) => {
  const t = sansPuce(l);
  if (!RE_ANNEE.test(t)) return false;
  return motsDe(t).length <= 12 && !/[.;]$/.test(t);
};

// « Directeur de production - Age of Union » / « Serveur, Hôtel X » / « Barman chez Y »
function couperPoste(l) {
  const t = sansPuce(l).replace(/\s*[|·]\s*/g, " - ");
  const sep = /\s+[-–—]\s+|\s+(?:chez|at|@|pour)\s+/i.exec(t);
  if (sep) return { poste: t.slice(0, sep.index).trim(), employeur: t.slice(sep.index + sep[0].length).trim() };
  const virgule = t.indexOf(", ");
  if (virgule > 2 && virgule < t.length - 2 && motsDe(t).length <= 10) return { poste: t.slice(0, virgule).trim(), employeur: t.slice(virgule + 2).trim() };
  return { poste: t, employeur: "" };
}

export function lireCV(texteBrut, nomVersion = "") {
  const lignes = String(texteBrut || "").replace(/\r/g, "").split("\n").map((l) => l.replace(/[   ]/g, " ").trimEnd());

  // ---------- Découpage en sections ----------
  const blocs = []; // { cle, libelle, lignes[] }
  let entete = [];
  let courant = null;
  let pleines = 0;
  for (const brute of lignes) {
    const l = brute.trim();
    if (l) pleines++;
    const t = l ? titreSection(l, !courant && pleines <= 4) : null;
    if (t) { courant = { ...t, lignes: [] }; blocs.push(courant); continue; }
    if (courant) courant.lignes.push(brute);
    else entete.push(brute);
  }

  // ---------- En-tête ----------
  const texteEntete = entete.join("\n");
  const courriel = (RE_COURRIEL.exec(texteEntete) || [""])[0];
  const linkedin = (RE_LINKEDIN.exec(texteEntete) || [""])[0];
  const site = (RE_SITE.exec(texteEntete.replace(linkedin, "")) || [""])[0];
  let telephone = "";
  for (const l of entete) { const m = RE_TEL.exec(l.replace(RE_ANNEE, "")); if (m && !RE_COURRIEL.test(m[0])) { telephone = m[0].trim(); break; } }

  const propres = entete.map((l) => l
    .replace(RE_COURRIEL, "").replace(RE_LINKEDIN, "").replace(RE_SITE, "")
    .replace(telephone || "\u0000", "")
    .replace(/^[\s•·|,;–—-]+|[\s•·|,;–—-]+$/g, "").trim()).filter(Boolean);
  const nom = propres[0] && motsDe(propres[0]).length <= 6 ? propres[0] : "";
  const reste = propres.slice(nom ? 1 : 0);
  const iLieu = reste.findIndex((l) => /disponible|montr[ée]al|qu[ée]bec|canada|available|,\s*(QC|Qc|Québec|Quebec|Ontario|ON)\b/i.test(l));
  const lieu = iLieu >= 0 ? reste[iLieu] : "";
  const titre = reste.filter((_, i) => i !== iLieu)[0] || "";

  // ---------- Profil ----------
  const bloc = (cle) => blocs.filter((b) => b.cle === cle);
  const texteDe = (b) => b.lignes.map((l) => sansPuce(l)).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const profil = bloc("profil").map(texteDe).filter(Boolean).join(" ");

  // ---------- Compétences ----------
  const competences = [];
  let titreCompetences = "Compétences clés";
  for (const b of bloc("competences")) {
    titreCompetences = joliTitre(b.libelle);
    for (const brute of b.lignes) {
      const l = sansPuce(brute); if (!l) continue;
      const m = /^(.{2,40}?)\s*[:：]\s*(.+)$/.exec(l);
      if (m) competences.push({ label: m[1].trim(), texte: m[2].trim() });
      else if (motsDe(l).length <= 3) competences.push({ label: l, texte: "" });
      else competences.push({ label: "", texte: l });
    }
  }

  // ---------- Expériences ----------
  const experiences = [];
  let titreExperiences = "Expériences professionnelles";
  for (const b of bloc("experiences")) {
    titreExperiences = joliTitre(b.libelle);
    let poste = null;
    const fermer = () => { if (poste && (poste.poste || poste.puces.length)) experiences.push(poste); poste = null; };
    for (const brute of b.lignes) {
      const l = brute.trim(); if (!l) continue;
      if (estPuce(brute)) { if (!poste) poste = { poste: "", employeur: "", lieu: "", puces: [] }; poste.puces.push(sansPuce(brute)); continue; }
      if (poste && !poste.lieu && !poste.puces.length && estLigneDates(l)) { poste.lieu = l; continue; }
      // Une ligne pleine, longue et ponctuée après un poste : c'est une réalisation, pas un nouveau poste.
      if (poste && !estLigneDates(l) && (motsDe(l).length > 12 || /[.;]$/.test(l))) { poste.puces.push(l); continue; }
      fermer();
      const c = couperPoste(l);
      poste = { poste: c.poste, employeur: c.employeur, lieu: "", puces: [] };
      if (estLigneDates(l) && !c.employeur) { poste.poste = ""; poste.lieu = l; }
    }
    fermer();
  }

  // ---------- Autres sections ----------
  const sections = [];
  for (const b of blocs) {
    if (["profil", "competences", "experiences"].includes(b.cle)) continue;
    const puces = b.lignes.map((l) => sansPuce(l)).filter(Boolean);
    if (!puces.length) continue;
    const titreBloc = joliTitre(b.libelle) || TITRES_JOLIS[b.cle] || "Autres";
    sections.push({ titre: titreBloc, puces });
  }

  const cv = {
    nom: nom || "SYLVAIN BROCHU",
    titre: titre || nomVersion,
    courriel: courriel || "info@sylvainbrochu.ca",
    telephone: telephone || "514-299-5986",
    linkedin: linkedin ? (linkedin.startsWith("http") ? linkedin : "https://" + linkedin) : "https://www.linkedin.com/in/sylvain-brochu-profil",
    site: site || "https://www.sylvainbrochu.ca/",
    lieu: lieu || "Montréal, Québec | Disponible immédiatement",
    disposition: "une_ligne",
    compact: true,
    profil,
    titreCompetences,
    competences,
    titreExperiences,
    experiences,
    sections,
  };
  const manques = [];
  if (!profil) manques.push("le profil");
  if (!competences.length) manques.push("les compétences");
  if (!experiences.length) manques.push("les expériences");
  return { cv, manques };
}
