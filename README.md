# sylvainbrochu.ca

Site portfolio et CV de Sylvain Brochu. HTML, CSS et JS statiques, sans build. Déployé sur Vercel.

Les images sont servies depuis le CDN Wix de l'ancien site Even Even, en attendant les photos du portfolio papier.

## Admin (/admin)

Recherche d'emploi de Sylvain : candidatures, boîte info@, offres d'emploi, CV, statistiques.

- `api/offres.js` : veille d'offres (Grenier, Cultive, CQT, Eluta, Talent.com, Jobillico, Guichet-Emplois, Hôtellerie Jobs, Cirque du Soleil, Solotech, GSM, alertes courriel reçues sur info@). `?detail=<lien>` lit une offre : texte complet, courriel du recruteur, date limite, salaire, lien pour postuler.
- Une offre ajoutée aux candidatures ouvre une fiche pré-remplie : lettre adaptée au poste, CV à joindre, façon de postuler (courriel ou site de l'employeur).
