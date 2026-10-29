// Valeurs par défaut de l'admin : réglages, modèles de courriels, plateformes d'emploi.
import { ACCES_DEFAUT } from "./auth.js";
import { CANDIDATURES } from "./seed-candidatures.js";
import { CV_CARRIERE } from "./cv-carriere.js";
import { CV_BARMAN } from "./cv-barman.js";

export const SIGNATURE = "Sylvain Brochu\n514-299-5986 | info@sylvainbrochu.ca\nwww.sylvainbrochu.ca";

export const REGLAGES = {
  acces: ACCES_DEFAUT,
  relanceJours: 7,
  cci: "sylvain@cartel.ca",
  expediteurNom: "Sylvain Brochu",
  expediteur: "info@sylvainbrochu.ca",
  signature: SIGNATURE,
  // Rappel par courriel quand un employeur attend ma réponse (voir api/rappels.js)
  rappels: true,
  rappelHeures: 3,
  rappelA: "sylvain@cartel.ca",
};

export const MODELES = [
  {
    id: "offre", nom: "Candidature à une offre", cv: "carriere",
    objet: "Candidature, {poste} - Sylvain Brochu",
    corps: "Bonjour{contact},\n\nJe vous propose ma candidature au poste de {poste} chez {entreprise}.\n\nGestionnaire de production et de projets, j'ai plus de 25 ans d'expérience en événementiel, en arts vivants et en fabrication sur mesure, du Cirque du Soleil au Grand Prix de Formule 1. J'ai dirigé pendant dix ans Even Even Design et son réseau de sous-traitants, puis géré les opérations du centre Never Apart, avec plus de 35 expositions livrées.\n\nMon CV est joint, et mes projets sont présentés sur mon site. J'aimerais beaucoup en discuter avec vous.\n\nCordialement,\n\n{signature}",
  },
  {
    id: "spontanee", nom: "Candidature spontanée", cv: "carriere",
    objet: "Candidature spontanée, gestion de production - Sylvain Brochu",
    corps: "Bonjour{contact},\n\nJe me permets de vous écrire pour vous proposer ma candidature en direction de production, en gestion de projets ou en direction des opérations chez {entreprise}.\n\nJ'ai plus de 25 ans d'expérience en événementiel, en arts vivants et en fabrication sur mesure : huit ans au Cirque du Soleil, dix ans à la tête d'Even Even Design, neuf ans à la gestion des opérations du centre Never Apart et, en 2026, les accessoires du spectacle du Grand Prix de Formule 1.\n\nMon CV est joint. Je serais heureux d'échanger avec vous, même sans poste ouvert en ce moment.\n\nCordialement,\n\n{signature}",
  },
  {
    id: "relance", nom: "Relance", cv: "",
    objet: "Suivi de ma candidature, {poste} - Sylvain Brochu",
    corps: "Bonjour{contact},\n\nJe me permets de faire un suivi de ma candidature au poste de {poste}, envoyée le {envoyeLe}.\n\nLe poste m'intéresse toujours beaucoup et je reste disponible pour une rencontre à votre convenance. Mon CV et mon portfolio sont accessibles sur www.sylvainbrochu.ca.\n\nMerci de votre attention,\n\n{signature}",
  },
  {
    id: "merci", nom: "Remerciement après entrevue", cv: "",
    objet: "Merci pour la rencontre - Sylvain Brochu",
    corps: "Bonjour{contact},\n\nMerci pour notre rencontre au sujet du poste de {poste}. Nos échanges m'ont confirmé mon intérêt pour le poste et pour l'équipe de {entreprise}.\n\nJe reste disponible pour toute information supplémentaire.\n\nAu plaisir,\n\n{signature}",
  },
  {
    id: "disponibilites", nom: "Réponse : disponibilités pour une entrevue", cv: "",
    objet: "",
    corps: "Bonjour{contact},\n\nMerci pour votre retour. Je suis disponible aux moments suivants :\n\n- \n- \n- \n\nJe peux me déplacer ou faire la rencontre en visioconférence.\n\nAu plaisir,\n\n{signature}",
  },
  {
    id: "temporaire", nom: "Emploi temporaire (bar, service, événements)", cv: "barman",
    objet: "Candidature, {poste} - Sylvain Brochu",
    corps: "Bonjour{contact},\n\nJe vous propose ma candidature pour un poste de {poste}.\n\nJ'ai plus de 10 ans d'expérience au bar, en salle et en service événementiel à Montréal, du Parking au Club de Golf Métropolitain, et j'ai supervisé des équipes de service lors d'événements jusqu'à 1 500 invités.\n\nJe suis disponible rapidement. Mon CV est joint.\n\nCordialement,\n\n{signature}",
  },
];

// Plateformes d'emploi : liens de recherche prêts et suivi du profil de Sylvain.
export const PLATEFORMES = [
  { id: "indeed", nom: "Indeed", compte: "https://ca.indeed.com/account/login", profil: "carriere" },
  { id: "linkedin", nom: "LinkedIn", compte: "https://www.linkedin.com/in/sylvain-brochu-profil/", profil: "carriere" },
  { id: "hotelleriejobs", nom: "Hôtellerie Jobs", compte: "https://www.hotelleriejobs.com/", profil: "barman" },
  { id: "jobboom", nom: "Jobboom", compte: "https://www.jobboom.com/", profil: "carriere" },
  { id: "jobillico", nom: "Jobillico", compte: "https://www.jobillico.com/", profil: "carriere" },
  { id: "grenier", nom: "Grenier aux emplois (culture)", compte: "https://www.grenier.qc.ca/emplois", profil: "carriere" },
  { id: "guichet", nom: "Guichet-Emplois", compte: "https://www.guichetemplois.gc.ca/", profil: "carriere" },
];

export const DONNEES_DEFAUT = {
  candidatures: CANDIDATURES,
  "cv-carriere": CV_CARRIERE,
  "cv-barman": CV_BARMAN,
  reglages: REGLAGES,
  modeles: MODELES,
  plateformes: PLATEFORMES.map((p) => ({ ...p, profilCree: false, cvTeleverse: "", note: "" })),
  "offres-sauvees": [],
  "offres-masquees": [],
  notes: "",
};
export const CLES = Object.keys(DONNEES_DEFAUT);
