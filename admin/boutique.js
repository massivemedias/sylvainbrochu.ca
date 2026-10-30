// Ma boutique : les pièces Onomiko en vente sur le site et les demandes de réservation des visiteurs.
// Les pièces sont dans etat.d.boutique (enregistrées par /api/donnees), les photos et les demandes par /api/boutique.

export const TYPES = [["kimono", "Kimono"], ["peignoir", "Peignoir"], ["cape", "Cape"], ["manteau", "Manteau"], ["tunique", "Tunique"], ["robe", "Robe"], ["autre", "Autre"]];
export const STATUTS_PIECE = [["dispo", "Disponible"], ["reserve", "Réservée"], ["vendu", "Vendue"], ["cache", "Cachée (pas sur le site)"]];
const NOM_STATUT = { dispo: "Disponible", reserve: "Réservée", vendu: "Vendue", cache: "Cachée" };

export function creerBoutique(ctx) {
  const { etat, E, $, api, toast, ouvrirModale, fermerModale, entete, ouvrirComposeur, dateHeure, rafraichirCompteurs } = ctx;
  etat.resa = etat.resa || [];
  const pieces = () => (Array.isArray(etat.d.boutique) ? etat.d.boutique : []);
  const nouvelles = () => etat.resa.filter((r) => r.statut === "nouvelle");
  const enregistrer = () => api("/api/donnees/?cle=boutique", { method: "PUT", body: etat.d.boutique });
  const prixTexte = (p) => (typeof p.prix === "number" && p.prix > 0 ? `${p.prix.toLocaleString("fr-CA")} $` : "Prix sur demande");

  async function charger() {
    try {
      const r = await api("/api/boutique/?action=reservations");
      const avant = JSON.stringify(nouvelles().map((x) => x.id));
      etat.resa = r.reservations || [];
      rafraichirCompteurs();
      return avant !== JSON.stringify(nouvelles().map((x) => x.id));
    } catch { return false; }
  }

  // Tâches pour « Aujourd'hui » : une par demande de réservation pas encore traitée.
  function taches() {
    return nouvelles().map((r) => ({
      type: "reservation", r, tri: r.date,
      texte: `Répondre à ${r.nom} : réservation Onomiko`,
      detail: `${r.nomPiece || r.piece || "Une pièce"}${r.taille ? `, taille ${r.taille}` : ""}. Demande reçue ${dateHeure(r.date)}.`,
      bouton: "Voir la demande",
    }));
  }

  // ---------- Page ----------
  function page() {
    const l = pieces(); const n = nouvelles(); const traitees = etat.resa.filter((r) => r.statut !== "nouvelle");
    $("#page").innerHTML = entete("Ma boutique", "Tes pièces Onomiko en vente sur ton site. Quand un visiteur réserve une pièce, sa demande arrive ici.",
      `<a class="btn" href="/onomiko/boutique/" target="_blank" rel="noopener">Voir la boutique</a><button class="btn laiton" data-bq="ajouter">Ajouter une pièce</button>`) + `
    <section class="carte bq-demandes">
      <header><h2>Demandes de réservation${n.length ? ` <span class="pastille p-urgent">${n.length} à traiter</span>` : ""}</h2></header>
      ${n.length ? `<ul class="liste bq-resa">${n.map(ligneResa).join("")}</ul>` : `<p class="vide">Aucune nouvelle demande. Les réservations faites sur ta boutique arrivent ici.</p>`}
      ${traitees.length ? `<details class="details-fiche"><summary>Demandes traitées (${traitees.length})</summary><ul class="liste bq-resa">${traitees.map(ligneResa).join("")}</ul></details>` : ""}
    </section>
    <section class="carte">
      <header><h2>Mes pièces (${l.length})</h2></header>
      ${l.length ? `<div class="bq-grille">${l.map(cartePiece).join("")}</div>` : `<p class="vide">Aucune pièce. Clique « Ajouter une pièce » pour mettre un kimono en vente.</p>`}
      <p class="aide">Clique une pièce pour changer ses photos, son prix ou son statut. Une pièce « Cachée » n'apparaît pas sur le site.</p>
    </section>`;
  }
  function ligneResa(r) {
    const nouvelle = r.statut === "nouvelle";
    return `<li class="${nouvelle ? "nouvelle" : ""}"><div class="t">
      <b>${E(r.nom)} veut réserver ${E(r.nomPiece || r.piece || "une pièce")}</b>
      <small>${E(dateHeure(r.date))} | <a href="mailto:${E(r.courriel)}">${E(r.courriel)}</a>${r.telephone ? ` | <a href="tel:${E(r.telephone.replace(/[^\d+]/g, ""))}">${E(r.telephone)}</a>` : ""}${r.taille ? ` | Taille : ${E(r.taille)}` : ""}${r.langue === "en" ? " | En anglais" : ""}</small>
      ${r.message ? `<p class="bq-message">${E(r.message)}</p>` : ""}
    </div><div class="actions">
      <button class="btn laiton petit" data-bq="repondre" data-id="${E(r.id)}">Répondre</button>
      ${nouvelle ? `<button class="btn petit" data-bq="traitee" data-id="${E(r.id)}">Marquer comme traitée</button>` : `<button class="btn petit" data-bq="rouvrir" data-id="${E(r.id)}">Remettre à traiter</button><button class="btn lien petit" data-bq="effacer" data-id="${E(r.id)}">Supprimer</button>`}
    </div></li>`;
  }
  function cartePiece(p) {
    const ph = (p.photos || [])[0];
    return `<button type="button" class="bq-carte s-${E(p.statut || "dispo")}" data-bq="modifier" data-id="${E(p.id)}">
      <span class="bq-vignette">${ph ? `<img src="${E(ph.petit || ph.grand)}" alt="" loading="lazy">` : `<span class="bq-sans">Pas de photo</span>`}</span>
      <span class="bq-info"><b>${E(p.nom || "Sans nom")}</b><small>${E(prixTexte(p))}${p.tissu ? ` | ${E(p.tissu)}` : ""}</small><i class="bq-statut">${E(NOM_STATUT[p.statut] || "Disponible")}</i></span>
    </button>`;
  }

  // ---------- Photos : réduites dans le navigateur avant l'envoi ----------
  async function decoder(fichier) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(fichier, { imageOrientation: "from-image" }); } catch { /* essai suivant */ }
    }
    const url = URL.createObjectURL(fichier);
    try {
      return await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    } catch { throw new Error(`« ${fichier.name} » ne s'ouvre pas dans ton navigateur. Enregistre la photo en JPG, puis réessaie.`); }
  }
  function reduire(src, max, qualite) {
    const W = src.width, H = src.height, k = Math.min(1, max / Math.max(W, H));
    const c = document.createElement("canvas"); c.width = Math.round(W * k); c.height = Math.round(H * k);
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, c.width, c.height);
    let q = qualite, d = c.toDataURL("image/jpeg", q);
    while (d.length > 880_000 && q > 0.45) { q -= 0.08; d = c.toDataURL("image/jpeg", q); }
    return { d, w: c.width, h: c.height };
  }
  async function televerser(fichier) {
    if (!/^image\//.test(fichier.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(fichier.name)) throw new Error(`« ${fichier.name} » n'est pas une photo.`);
    const src = await decoder(fichier);
    const g = reduire(src, 1600, 0.84), p = reduire(src, 700, 0.8);
    const r = await api("/api/boutique/?action=photo", { method: "POST", body: { grand: g.d, petit: p.d, w: g.w, h: g.h } });
    return r.photo;
  }

  const slugifier = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "piece";
  function slugUnique(nom, id) {
    const base = slugifier(nom); let s = base, i = 2;
    while (pieces().some((p) => p.slug === s && p.id !== id) || ["merci", "piece", "thank-you"].includes(s)) s = `${base}-${i++}`;
    return s;
  }

  // ---------- Fiche d'une pièce ----------
  function editer(p0) {
    const neuve = !p0;
    const p = neuve ? { id: "p" + Date.now().toString(36), slug: "", type: "kimono", nom: "", nom_en: "", tissu: "", tissu_en: "", prix: null, tailles: "", desc: "", desc_en: "", statut: "dispo", photos: [] } : JSON.parse(JSON.stringify(p0));
    const depart = new Set((p0?.photos || []).map((x) => x.id).filter(Boolean));
    const ajoutees = new Set();
    let enCours = 0;
    const v = (k) => E(p[k] ?? "");
    ouvrirModale(neuve ? "Ajouter une pièce" : E(p.nom || "Ma pièce"), `
      <div class="bq-photos" id="bq-photos"></div>
      <p class="aide">La première photo est la photo principale de la boutique. Ajoute autant de photos que tu veux (tu peux aussi les glisser ici).</p>
      <div class="grille-form">
        <label class="champ large"><span>Nom de la pièce</span><input name="nom" value="${v("nom")}" placeholder="Ex. Kimono soie émeraude" required></label>
        <label class="champ"><span>Type</span><select name="type">${TYPES.map(([id, nom]) => `<option value="${id}" ${p.type === id ? "selected" : ""}>${nom}</option>`).join("")}</select></label>
        <label class="champ"><span>Prix en dollars</span><input name="prix" type="number" min="0" step="1" inputmode="numeric" value="${typeof p.prix === "number" ? p.prix : ""}" placeholder="Vide : prix sur demande"></label>
        <label class="champ"><span>Tissu</span><input name="tissu" value="${v("tissu")}" placeholder="Ex. satin, soie, velours"></label>
        <label class="champ"><span>Tailles</span><input name="tailles" value="${v("tailles")}" placeholder="Ex. S, M, L ou taille unique"></label>
        <label class="champ"><span>Statut</span><select name="statut">${STATUTS_PIECE.map(([id, nom]) => `<option value="${id}" ${p.statut === id ? "selected" : ""}>${nom}</option>`).join("")}</select></label>
        <label class="champ large"><span>Description</span><textarea name="desc" rows="4" placeholder="La coupe, les détails, comment la porter.">${v("desc")}</textarea></label>
      </div>
      <details class="details-fiche"><summary>Version anglaise (facultatif)</summary><div class="grille-form">
        <label class="champ large"><span>Nom en anglais</span><input name="nom_en" value="${v("nom_en")}"></label>
        <label class="champ large"><span>Tissu en anglais</span><input name="tissu_en" value="${v("tissu_en")}"></label>
        <label class="champ large"><span>Description en anglais</span><textarea name="desc_en" rows="3">${v("desc_en")}</textarea></label>
      </div><p class="aide">Vide : la page anglaise de la boutique montre le texte français.</p></details>`,
    `${neuve ? "<span></span>" : `<button class="btn danger" data-m="supprimer">Retirer de la boutique</button>`}
     <div class="actions"><button class="btn" data-m="annuler">Annuler</button><button class="btn laiton" data-m="enregistrer">Enregistrer</button></div>`,
    (racine) => {
      const zone = $("#bq-photos", racine);
      const dessiner = () => {
        zone.innerHTML = p.photos.map((ph, i) => `<figure class="bq-ph">
            <img src="${E(ph.petit || ph.grand)}" alt="">
            ${i === 0 ? `<i class="bq-principale">Principale</i>` : ""}
            <div class="bq-outils">
              <button type="button" data-ph="gauche" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Avancer la photo">&larr;</button>
              <button type="button" data-ph="droite" data-i="${i}" ${i === p.photos.length - 1 ? "disabled" : ""} aria-label="Reculer la photo">&rarr;</button>
              <button type="button" data-ph="retirer" data-i="${i}" aria-label="Retirer la photo">&times;</button>
            </div></figure>`).join("") +
          `<label class="bq-ajout">${enCours ? `<span class="tourne"></span><span>Envoi de ${enCours} photo${enCours > 1 ? "s" : ""}...</span>` : `<b>+</b><span>Ajouter des photos</span>`}<input type="file" accept="image/*,.heic,.heif" multiple hidden></label>`;
        $(".bq-ajout input", zone).onchange = (e) => ajouter([...e.target.files]);
      };
      const ajouter = async (fichiers) => {
        fichiers = fichiers.filter(Boolean); if (!fichiers.length) return;
        enCours += fichiers.length; dessiner();
        for (const f of fichiers) {
          try { const ph = await televerser(f); ph.alt = p.nom; p.photos.push(ph); ajoutees.add(ph.id); }
          catch (e) { toast(e.message, true); }
          enCours--; dessiner();
        }
      };
      zone.onclick = (e) => {
        const b = e.target.closest("[data-ph]"); if (!b) return;
        const i = Number(b.dataset.i);
        if (b.dataset.ph === "retirer") p.photos.splice(i, 1);
        if (b.dataset.ph === "gauche" && i > 0) [p.photos[i - 1], p.photos[i]] = [p.photos[i], p.photos[i - 1]];
        if (b.dataset.ph === "droite" && i < p.photos.length - 1) [p.photos[i + 1], p.photos[i]] = [p.photos[i], p.photos[i + 1]];
        dessiner();
      };
      zone.ondragover = (e) => { e.preventDefault(); zone.classList.add("survol"); };
      zone.ondragleave = () => zone.classList.remove("survol");
      zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove("survol"); ajouter([...(e.dataTransfer?.files || [])]); };
      dessiner();

      const effacerPhotos = (ids) => ids.forEach((id) => api(`/api/boutique/?img=${id}g`, { method: "DELETE" }).catch(() => {}));
      const annuler = () => { effacerPhotos([...ajoutees]); fermerModale(); };
      $('[data-m="annuler"]', racine).onclick = annuler;
      $(".fermer", racine).onclick = annuler;
      racine.onclick = (e) => { if (e.target === racine) annuler(); };
      const sup = $('[data-m="supprimer"]', racine);
      if (sup) sup.onclick = async () => {
        if (!confirm(`Retirer « ${p.nom} » de la boutique ? La pièce et ses photos seront supprimées.`)) return;
        const avant = etat.d.boutique;
        etat.d.boutique = pieces().filter((x) => x.id !== p.id);
        try { await enregistrer(); } catch (err) { etat.d.boutique = avant; return toast("Pas enregistré : " + err.message, true); }
        effacerPhotos([...new Set([...depart, ...ajoutees])]);
        fermerModale(); toast("Pièce retirée de la boutique."); page();
      };
      $('[data-m="enregistrer"]', racine).onclick = async (e) => {
        if (enCours) return toast("Attends la fin de l'envoi des photos.", true);
        const f = (n) => $(`[name="${n}"]`, racine).value.trim();
        if (!f("nom")) { $('[name="nom"]', racine).focus(); return toast("Donne un nom à la pièce.", true); }
        ["nom", "nom_en", "tissu", "tissu_en", "tailles", "desc", "desc_en", "type", "statut"].forEach((k) => { p[k] = f(k); });
        const prix = Number(f("prix").replace(",", ".")); p.prix = f("prix") && prix > 0 ? Math.round(prix * 100) / 100 : null;
        if (!p.slug) p.slug = slugUnique(p.nom, p.id);
        p.photos.forEach((ph) => { if (!ph.alt || ph.id) ph.alt = p.nom; if (ph.id) ph.alt_en = p.nom_en || p.nom; });
        p.maj = new Date().toISOString();
        const l = pieces().slice(); const i = l.findIndex((x) => x.id === p.id);
        if (i >= 0) l[i] = p; else l.unshift(p);
        const avant = etat.d.boutique;
        etat.d.boutique = l;
        e.target.disabled = true;
        try { await enregistrer(); } catch (err) { etat.d.boutique = avant; e.target.disabled = false; return toast("Pas enregistré : " + err.message, true); }
        const gardees = new Set(p.photos.map((x) => x.id).filter(Boolean));
        effacerPhotos([...new Set([...depart, ...ajoutees])].filter((id) => !gardees.has(id)));
        fermerModale();
        toast(p.statut === "cache" ? "Pièce enregistrée (cachée du site)." : "Pièce enregistrée. Elle est à jour sur ta boutique.");
        page();
      };
    });
  }

  // ---------- Actions ----------
  async function majResa(id, statut) {
    const r = await api("/api/boutique/?action=reservation", { method: "PATCH", body: { id, statut } });
    etat.resa = r.reservations; rafraichirCompteurs(); page();
  }
  function repondre(r) {
    const en = r.langue === "en"; const prenom = String(r.nom || "").split(" ")[0];
    const piece = r.nomPiece || r.piece || "";
    ouvrirComposeur({
      a: r.courriel,
      sujet: en ? `Your Onomiko reservation: ${piece}` : `Votre réservation Onomiko : ${piece}`,
      texte: en
        ? `Hello ${prenom},\n\nThank you for your reservation request for the ${piece}.\n\n\n\nBest regards,\nSylvain Brochu\nOnomiko`
        : `Bonjour ${prenom},\n\nMerci pour votre demande de réservation pour la pièce « ${piece} ».\n\n\n\nAu plaisir,\nSylvain Brochu\nOnomiko`,
    });
  }
  async function action(t) {
    const a = t.dataset.bq, id = t.dataset.id;
    if (a === "ajouter") return editer(null);
    if (a === "modifier") { const p = pieces().find((x) => x.id === id); return p && editer(p); }
    const r = etat.resa.find((x) => x.id === id); if (!r) return;
    try {
      if (a === "repondre") return repondre(r);
      if (a === "traitee") return await majResa(id, "traitee");
      if (a === "rouvrir") return await majResa(id, "nouvelle");
      if (a === "effacer") {
        if (!confirm(`Supprimer la demande de ${r.nom} ?`)) return;
        const rep = await api(`/api/boutique/?action=reservation&id=${encodeURIComponent(id)}`, { method: "DELETE" });
        etat.resa = rep.reservations; rafraichirCompteurs(); page();
      }
    } catch (e) { toast(e.message, true); }
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-bq]");
    if (t && etat.d) { e.preventDefault(); action(t); }
  });

  return { page, charger, taches, compte: () => nouvelles().length };
}
