# sylvainbrochu.ca

Site portfolio et CV de Sylvain Brochu. HTML, CSS et JS statiques, sans build. Déployé sur Vercel.

Les images sont servies depuis le CDN Wix de l'ancien site Even Even, en attendant les photos du portfolio papier.

## Admin (/admin)

Recherche d'emploi de Sylvain : candidatures, boîte info@, offres d'emploi, CV, statistiques.

- `api/offres.js` : veille d'offres (Grenier, Cultive, CQT, Eluta, Talent.com, Jobillico, Guichet-Emplois, Hôtellerie Jobs, Cirque du Soleil, Solotech, GSM, alertes courriel reçues sur info@). `?detail=<lien>` lit une offre : texte complet, courriel du recruteur, date limite, salaire, lien pour postuler.
- Une offre ajoutée aux candidatures ouvre une fiche pré-remplie : lettre adaptée au poste, CV à joindre, façon de postuler (courriel ou site de l'employeur).
- L'admin est l'espace de Sylvain : tous les textes sont au « je » (Mes candidatures, Mon CV...). Accueil « Aujourd'hui » : une seule prochaine étape mise en avant, puis la suite et les nouvelles offres.
- Bouton « Je postule » sur chaque offre : la fiche affiche un guide clair, par courriel (courriel préparé avec le CV joint) ou sur le site de l'employeur (copier la lettre, télécharger le CV, ouvrir le formulaire, « J'ai postulé »). Si la boîte info@ n'est pas branchée, « Préparer mon courriel » ouvre la messagerie de Sylvain avec le courriel écrit.
- Rappels : un courriel important (employeur lié à une candidature, réponse à un courriel envoyé de info@, message du formulaire du site) qui attend une réponse depuis plus de 3 h déclenche un rappel par courriel à sylvain@cartel.ca, avec un lien direct vers le courriel dans l'admin. Jamais entre 21 h et 8 h, au plus 2 rappels par courriel (après 3 h, puis après 24 h). Vérification toutes les 30 min par GitHub Actions (`.github/workflows/rappels.yml`, qui appelle `/api/rappels/`), plus une fois par jour par Vercel. Délai, adresses et arrêt : admin, Réglages, « Mes rappels ». Ces courriels apparaissent aussi en tête de l'accueil (« Répondre à... »).
- Offres toujours prêtes : le dernier résultat est gardé 14 jours et s'affiche tout de suite ; s'il a plus d'une heure, l'admin lance une mise à jour en arrière-plan. Une tâche planifiée Vercel (vercel.json, `crons`, chaque jour à 6 h, heure de Montréal) refait la collecte. Les offres jamais vues dans ce navigateur sont marquées « Nouvelle ».
