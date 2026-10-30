(function () {
  // Accueil : la lampe s'allume au chargement
  var hero = document.querySelector('.hero');
  if (hero) {
    var heroImg = hero.querySelector('img');
    var allumer = function () { hero.classList.add('lit'); };
    if (heroImg.complete) allumer();
    else { heroImg.addEventListener('load', allumer); setTimeout(allumer, 2500); }
  }

  // Navigation : fond opaque après le hero, menu mobile
  var nav = document.querySelector('.nav');
  if (hero) {
    var surDefilement = function () { nav.classList.toggle('solid', window.scrollY > window.innerHeight * 0.6); };
    window.addEventListener('scroll', surDefilement, { passive: true });
    surDefilement();
  }
  var menuBtn = nav.querySelector('.menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      var ouvert = nav.classList.toggle('ouvert');
      menuBtn.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
      menuBtn.textContent = ouvert ? (document.documentElement.lang.indexOf('en') === 0 ? 'Close' : 'Fermer') : 'Menu';
      document.body.style.overflow = ouvert ? 'hidden' : '';
    });
    nav.querySelectorAll('ul a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('ouvert'); menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.textContent = 'Menu'; document.body.style.overflow = '';
      });
    });
  }

  // Filtres de l'index des projets
  var filtres = document.querySelectorAll('.filtres button');
  filtres.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cat = btn.dataset.cat;
      filtres.forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
      document.querySelectorAll('.cartes .carte, .produits .produit').forEach(function (c) {
        c.hidden = !(cat === 'tous' || (c.dataset.cat || '').split(' ').indexOf(cat) !== -1);
      });
    });
  });

  // Impression du parcours
  var imp = document.querySelector('[data-imprimer]');
  if (imp) imp.addEventListener('click', function () { window.print(); });

  // Visionneuse (par délégation : marche aussi pour les images ajoutées après le chargement, ex. la boutique)
  var dlg = document.querySelector('dialog.visionneuse');
  if (dlg) {
    var img = dlg.querySelector('img');
    var legende = dlg.querySelector('p');
    var boutons = [], courant = 0, dernierFocus = null;
    var afficher = function (i) {
      if (!boutons.length) return;
      courant = (i + boutons.length) % boutons.length;
      var b = boutons[courant];
      var vignette = b.querySelector('img');
      img.src = b.dataset.full;
      img.alt = vignette ? vignette.alt : '';
      legende.textContent = b.dataset.legende || '';
    };
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.ouvrir');
      if (!b || !b.dataset.full) return;
      boutons = Array.prototype.slice.call(document.querySelectorAll('.ouvrir')).filter(function (x) { return x.dataset.full; });
      dernierFocus = b; afficher(boutons.indexOf(b));
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    });
    dlg.querySelector('.fermer').addEventListener('click', function () { dlg.close(); });
    dlg.querySelector('.prec').addEventListener('click', function () { afficher(courant - 1); });
    dlg.querySelector('.suiv').addEventListener('click', function () { afficher(courant + 1); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.classList.contains('scene')) dlg.close(); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') afficher(courant - 1);
      if (e.key === 'ArrowRight') afficher(courant + 1);
    });
    dlg.addEventListener('close', function () { img.removeAttribute('src'); if (dernierFocus) dernierFocus.focus(); });
    var x0 = null;
    dlg.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    dlg.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) afficher(courant + (dx < 0 ? 1 : -1));
      x0 = null;
    });
  }

  // Apparitions au défilement : titres, rangées, cartes, images
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var marquer = function (sel, classe) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (el.closest('.hero')) return;
        el.classList.add(classe);
        var p = el.parentNode, i = p ? Array.prototype.indexOf.call(p.children, el) : 0;
        if (classe === 'rv') el.style.transitionDelay = (i % 6) * 70 + 'ms';
      });
    };
    marquer('main h2, .enonce .phrase, .domaines li, .vises-liste li, .etapes li, .postes li, .carte, .valeurs article, .parcours .ligne, .colonnes li, .cv-carte, .projet .texte, .panneau, .produit, .ono-groupe-texte, .citation blockquote', 'rv');
    marquer('.projet .visuel, .bandeau .ouvrir, .grille figure, .recit .portrait, .ono-groupe-images figure, .ono-mosaique figure, .ono-final figure, .ono-createur-photo', 'rv-img');
    var cibles = document.querySelectorAll('.rv, .rv-img');
    document.documentElement.classList.add('anim');
    var vue = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('vu'); vue.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    cibles.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('vu'); else vue.observe(el);
    });
  }

  // Bouton CV flottant : visible après le haut de page, masqué près des autres boutons CV et du pied
  var flottant = document.querySelector('.cv-flottant');
  if (flottant) {
    var zones = Array.prototype.slice.call(document.querySelectorAll('.appel, .pied, .cv-carte, .imprimer, .hero'));
    var visibles = 0;
    var maj = function () {
      flottant.classList.toggle('visible', visibles === 0 && window.scrollY > 240);
    };
    if ('IntersectionObserver' in window) {
      var vus = new IntersectionObserver(function (entrees) {
        entrees.forEach(function (en) { en.target.dataset.vis = en.isIntersecting ? '1' : ''; });
        visibles = zones.filter(function (z) { return z.dataset.vis === '1'; }).length;
        maj();
      });
      zones.forEach(function (z) { vus.observe(z); });
    }
    window.addEventListener('scroll', maj, { passive: true });
    maj();
  }

  // Vidéos d'ambiance (Onomiko) : lecture muette quand elles sont visibles, contrôles si le mouvement est réduit
  var videos = document.querySelectorAll('video[data-auto]');
  var calme = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  videos.forEach(function (v) {
    if (calme || !('IntersectionObserver' in window)) { v.controls = true; return; }
    var obs = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (en) {
        if (en.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () { v.controls = true; }); }
        else v.pause();
      });
    }, { threshold: 0.35 });
    obs.observe(v);
  });

  boutiqueOnomiko();

  var annee = document.getElementById('annee');
  if (annee) annee.textContent = new Date().getFullYear();
})();

// Mesure d'audience du site (sans témoin) : pages vues, téléchargements du CV, messages du formulaire.
(function () {
  try {
    var ref = document.referrer, arrivee = 1;
    try { arrivee = !ref || new URL(ref).host !== location.host ? 1 : 0; } catch (e) { arrivee = 1; }
    var utm = new URLSearchParams(location.search).get('utm_source') || '';
    var envoyer = function (o) {
      var b = JSON.stringify(o);
      if (navigator.sendBeacon) navigator.sendBeacon('/api/stats/', new Blob([b], { type: 'text/plain' }));
      else fetch('/api/stats/', { method: 'POST', body: b, keepalive: true });
    };
    envoyer({ e: 'vue', p: location.pathname, r: ref, n: arrivee, u: utm });
    var debut = Date.now();
    var signal = setInterval(function () {
      if (Date.now() - debut > 6 * 60000) return clearInterval(signal);
      if (document.visibilityState === 'visible') envoyer({ e: 'ping', p: location.pathname });
    }, 45000);
    document.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('.dl-cv');
      if (a) envoyer({ e: 'cv', p: location.pathname });
    });
    var f = document.querySelector('form.formulaire');
    if (f) f.addEventListener('submit', function () { envoyer({ e: 'contact', p: location.pathname }); });
  } catch (e) { /* la mesure ne doit jamais gêner le site */ }
})();

// Boutique Onomiko : les pièces viennent de l'admin de Sylvain (/api/boutique/). Pas de panier :
// « Réserver » ouvre un petit formulaire et la demande arrive dans l'admin de Sylvain.
function boutiqueOnomiko() {
  var EN = document.documentElement.lang.indexOf('en') === 0;
  var T = EN ? {
    reserver: 'Reserve', vendu: 'Sold', reservee: 'Reserved', surDemande: 'Price on request', tous: 'All',
    types: { kimono: 'Kimono', peignoir: 'Robe', cape: 'Cape', manteau: 'Coat', tunique: 'Tunic', robe: 'Dress', autre: 'Piece' },
    pluriels: { kimono: 'Kimonos', peignoir: 'Robes', cape: 'Capes', manteau: 'Coats', tunique: 'Tunics', robe: 'Dresses', autre: 'Other' },
    titre: 'Reserve this piece', nom: 'Your name', courriel: 'Email', tel: 'Phone (optional)', taille: 'Size or measurements (optional)', message: 'Message (optional)',
    envoyer: 'Send my request', envoi: 'Sending...', fermer: 'Close',
    note: 'No payment now. Sylvain will reply to confirm the price, size and delivery.',
    merci: 'Thank you! Your request has been sent. Sylvain will reply by email shortly.', erreur: 'The request could not be sent. Please try again, or write to info@sylvainbrochu.ca.',
    accueil: 'Home', boutique: 'Onomiko Shop', piece: 'Piece', tissu: 'Fabric', tailles: 'Sizes', etat: 'Availability', dispo: 'Available',
    retour: 'Back to the shop', autres: 'Other pieces', absente: 'This piece is no longer available.', vide: 'No pieces for the moment. Come back soon.',
    detail: 'Made to order', base: '/en/onomiko/shop/', accueilUrl: '/en/', onomikoUrl: '/en/onomiko/'
  } : {
    reserver: 'Réserver', vendu: 'Vendue', reservee: 'Réservée', surDemande: 'Prix sur demande', tous: 'Tout voir',
    types: { kimono: 'Kimono', peignoir: 'Peignoir', cape: 'Cape', manteau: 'Manteau', tunique: 'Tunique', robe: 'Robe', autre: 'Pièce' },
    pluriels: { kimono: 'Kimonos', peignoir: 'Peignoirs', cape: 'Capes', manteau: 'Manteaux', tunique: 'Tuniques', robe: 'Robes', autre: 'Autres' },
    titre: 'Réserver cette pièce', nom: 'Votre nom', courriel: 'Courriel', tel: 'Téléphone (facultatif)', taille: 'Taille ou mesures (facultatif)', message: 'Message (facultatif)',
    envoyer: 'Envoyer ma demande', envoi: 'Envoi...', fermer: 'Fermer',
    note: 'Aucun paiement maintenant. Sylvain vous répond pour confirmer le prix, la taille et la livraison.',
    merci: 'Merci ! Votre demande est envoyée. Sylvain vous répond par courriel sous peu.', erreur: "La demande n'est pas partie. Réessayez, ou écrivez à info@sylvainbrochu.ca.",
    accueil: 'Accueil', boutique: 'Boutique Onomiko', piece: 'Pièce', tissu: 'Tissu', tailles: 'Tailles', etat: 'Disponibilité', dispo: 'Disponible',
    retour: 'Retour à la boutique', autres: 'Autres pièces', absente: "Cette pièce n'est plus disponible.", vide: 'Aucune pièce pour le moment. Revenez bientôt.',
    detail: 'Fabriquée sur demande', base: '/onomiko/boutique/', accueilUrl: '/', onomikoUrl: '/onomiko/'
  };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var tr = function (p, k) { return (EN && p[k + '_en']) || p[k] || ''; };
  var prix = function (p) { return typeof p.prix === 'number' ? (EN ? '$' + p.prix.toLocaleString('en-CA') : p.prix.toLocaleString('fr-CA') + ' $') : T.surDemande; };
  var lien = function (p) { return T.base + p.slug + '/'; };

  // Restes de l'ancien panier dans les pages générées : on les retire.
  document.querySelectorAll('dialog.panier, .panier-bouton, .panier-toast').forEach(function (el) { el.parentNode.removeChild(el); });

  var grille = document.querySelector('.boutique .produits');
  var apercus = Array.prototype.slice.call(document.querySelectorAll('.ono-boutique .produits'));
  var fiche = document.querySelector('[data-piece]');
  if (!grille && !apercus.length && !fiche && !document.querySelector('.reserver')) return;

  // ---------- Formulaire de réservation ----------
  var dlg = null, courante = null;
  var formulaire = function () {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'panier reservation';
    dlg.setAttribute('aria-labelledby', 'resa-titre');
    dlg.innerHTML = '<div class="panier-tete"><h2 id="resa-titre">' + esc(T.titre) + '</h2><button type="button" class="fermer" aria-label="' + esc(T.fermer) + '">&times;</button></div>' +
      '<div class="resa-piece"></div>' +
      '<form class="formulaire panier-form resa-form" novalidate>' +
      '<div class="champ"><label for="r-nom">' + esc(T.nom) + '</label><input id="r-nom" name="nom" type="text" autocomplete="name" required maxlength="100"></div>' +
      '<div class="champ"><label for="r-courriel">' + esc(T.courriel) + '</label><input id="r-courriel" name="courriel" type="email" autocomplete="email" required maxlength="160"></div>' +
      '<div class="champ"><label for="r-tel">' + esc(T.tel) + '</label><input id="r-tel" name="telephone" type="tel" autocomplete="tel" maxlength="40"></div>' +
      '<div class="champ"><label for="r-taille">' + esc(T.taille) + '</label><input id="r-taille" name="taille" type="text" maxlength="60"></div>' +
      '<div class="champ"><label for="r-message">' + esc(T.message) + '</label><textarea id="r-message" name="message" rows="3" maxlength="2000"></textarea></div>' +
      '<input type="text" name="site" class="sr" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<button type="submit" class="bouton">' + esc(T.envoyer) + '</button>' +
      '<p class="note">' + esc(T.note) + '</p><p class="resa-etat" role="status" aria-live="polite"></p></form>';
    document.body.appendChild(dlg);
    var form = dlg.querySelector('form'), etat = dlg.querySelector('.resa-etat'), bouton = form.querySelector('[type="submit"]');
    dlg.querySelector('.fermer').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements;
      if (!f.nom.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.courriel.value.trim())) {
        etat.textContent = EN ? 'Please enter your name and a valid email.' : 'Indiquez votre nom et un courriel valide.';
        (f.nom.value.trim() ? f.courriel : f.nom).focus(); return;
      }
      bouton.disabled = true; bouton.textContent = T.envoi; etat.textContent = '';
      fetch('/api/boutique/?action=reserver', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece: courante.slug, nomPiece: courante.nom, nom: f.nom.value, courriel: f.courriel.value, telephone: f.telephone.value, taille: f.taille.value, message: f.message.value, site: f.site.value, langue: EN ? 'en' : 'fr' })
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || ''); return j; }); })
        .then(function () {
          form.hidden = true;
          dlg.querySelector('.resa-piece').insertAdjacentHTML('beforeend', '<p class="resa-merci">' + esc(T.merci) + '</p>');
          try { navigator.sendBeacon && navigator.sendBeacon('/api/stats/', new Blob([JSON.stringify({ e: 'contact', p: location.pathname })], { type: 'text/plain' })); } catch (x) {}
        })
        .catch(function (err) { etat.textContent = err.message || T.erreur; })
        .then(function () { bouton.disabled = false; bouton.textContent = T.envoyer; });
    });
    return dlg;
  };
  var ouvrir = function (slug, nom) {
    var d = formulaire(), p = (pieces || []).filter(function (x) { return x.slug === slug; })[0];
    courante = { slug: slug, nom: p ? tr(p, 'nom') : nom };
    var ph = p && p.photos[0];
    d.querySelector('.resa-piece').innerHTML = '<div class="resa-recap">' + (ph ? '<img src="' + esc(ph.petit) + '" alt="" width="72" height="90">' : '') +
      '<div><b>' + esc(courante.nom) + '</b>' + (p ? '<span>' + esc(prix(p)) + (tr(p, 'tissu') ? ' | ' + esc(tr(p, 'tissu')) : '') + '</span>' : '') + '</div></div>';
    var form = d.querySelector('form'); form.hidden = false; d.querySelector('.resa-etat').textContent = '';
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    setTimeout(function () { form.elements.nom.focus(); }, 50);
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.reserver');
    if (!b || b.disabled) return;
    e.preventDefault(); ouvrir(b.dataset.slug, b.dataset.nom);
  });

  // ---------- Affichage des pièces ----------
  var pieces = null;
  var badge = function (p) { return p.statut === 'vendu' ? '<span class="statut-piece vendu">' + esc(T.vendu) + '</span>' : p.statut === 'reserve' ? '<span class="statut-piece">' + esc(T.reservee) + '</span>' : ''; };
  var bouton = function (p, classe) {
    return p.statut === 'vendu' ? '<button type="button" class="bouton ' + classe + ' reserver" disabled>' + esc(T.vendu) + '</button>'
      : '<button type="button" class="bouton ' + classe + ' reserver" data-slug="' + esc(p.slug) + '" data-nom="' + esc(tr(p, 'nom')) + '">' + esc(T.reserver) + '</button>';
  };
  var carte = function (p, titre) {
    var ph = p.photos[0] || {};
    var type = (T.types[p.type] || T.types.autre) + (tr(p, 'tissu') ? ' | ' + tr(p, 'tissu') : '');
    return '<article class="produit" data-cat="' + esc(p.type) + '"><a class="produit-visuel" href="' + lien(p) + '" tabindex="-1" aria-hidden="true">' +
      (ph.petit ? '<img src="' + esc(ph.petit) + '" width="' + (ph.w || 800) + '" height="' + (ph.h || 1000) + '" loading="lazy" decoding="async" alt="' + esc(EN ? ph.alt_en : ph.alt) + '">' : '') + badge(p) + '</a>' +
      '<div class="produit-texte"><p class="type">' + esc(type) + '</p><' + titre + '><a href="' + lien(p) + '">' + esc(tr(p, 'nom')) + '</a></' + titre + '>' +
      '<p class="prix">' + esc(prix(p)) + '</p>' + bouton(p, 'contour') + '</div></article>';
  };
  var filtrer = function (zone) {
    var barre = document.querySelector('.filtres-boutique');
    if (!barre) return;
    var types = [];
    pieces.forEach(function (p) { if (types.indexOf(p.type) === -1) types.push(p.type); });
    barre.innerHTML = '<li><button type="button" data-f="tous" aria-pressed="true">' + esc(T.tous) + '</button></li>' +
      types.map(function (t) { return '<li><button type="button" data-f="' + esc(t) + '" aria-pressed="false">' + esc(T.pluriels[t] || T.pluriels.autre) + '</button></li>'; }).join('');
    barre.hidden = types.length < 2;
    barre.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      barre.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      zone.querySelectorAll('.produit').forEach(function (c) { c.hidden = !(b.dataset.f === 'tous' || c.dataset.cat === b.dataset.f); });
    });
  };
  var rendreFiche = function () {
    var slug = location.pathname.replace(/\/+$/, '').split('/').pop();
    var p = pieces.filter(function (x) { return x.slug === slug; })[0];
    var fil = '<nav class="fil" aria-label="' + (EN ? 'Breadcrumb' : "Fil d'Ariane") + '"><ol><li><a href="' + T.accueilUrl + '">' + esc(T.accueil) + '</a></li><li><a href="' + T.onomikoUrl + '">Onomiko</a></li><li><a href="' + T.base + '">' + esc(T.boutique) + '</a></li>' + (p ? '<li aria-current="page">' + esc(tr(p, 'nom')) + '</li>' : '') + '</ol></nav>';
    var wrap = fiche.querySelector('.wrap') || fiche;
    if (!p) { wrap.innerHTML = fil + '<div class="produit-absente"><h1>' + esc(T.absente) + '</h1><a class="bouton" href="' + T.base + '">' + esc(T.retour) + '</a></div>'; document.title = T.absente + ' | Onomiko'; return; }
    var nom = tr(p, 'nom'), n = p.photos.length;
    var galerie = p.photos.map(function (ph, i) {
      var alt = EN ? ph.alt_en : ph.alt;
      return '<figure><button type="button" class="ouvrir" data-full="' + esc(ph.grand) + '" data-legende="' + esc(alt) + '" aria-label="' + esc((EN ? 'Enlarge: ' : 'Agrandir : ') + alt) + '"><img src="' + esc(i === 0 ? ph.grand : ph.petit) + '" width="' + (ph.w || 800) + '" height="' + (ph.h || 1000) + '"' + (i ? ' loading="lazy"' : ' fetchpriority="high"') + ' decoding="async" alt="' + esc(alt) + '"></button></figure>';
    }).join('');
    var lignes = [[T.piece, T.types[p.type] || T.types.autre], [T.tissu, tr(p, 'tissu')], [T.tailles, p.tailles || T.detail], [T.etat, p.statut === 'vendu' ? T.vendu : p.statut === 'reserve' ? T.reservee : T.dispo]];
    wrap.innerHTML = fil + '<div class="produit-grille"><div class="produit-galerie n' + Math.min(n, 3) + '">' + galerie + '</div><div class="produit-infos">' +
      '<p class="surtitre">Onomiko</p><h1>' + esc(nom) + '</h1><p class="prix">' + esc(prix(p)) + '</p>' + (tr(p, 'desc') ? '<p class="desc">' + esc(tr(p, 'desc')) + '</p>' : '') +
      '<dl class="infos-produit">' + lignes.filter(function (l) { return l[1]; }).map(function (l) { return '<div><dt>' + esc(l[0]) + '</dt><dd>' + esc(l[1]) + '</dd></div>'; }).join('') + '</dl>' +
      '<div class="actions">' + bouton(p, '') + '<a class="lien" href="' + T.base + '">' + esc(T.retour) + '</a></div><p class="note">' + esc(T.note) + '</p></div></div>';
    document.title = nom + ' | ' + T.boutique + ' | Sylvain Brochu';
    var md = document.querySelector('meta[name="description"]'); if (md && tr(p, 'desc')) md.setAttribute('content', tr(p, 'desc'));
    var autres = document.querySelector('.ono-boutique .produits');
    if (autres) autres.innerHTML = pieces.filter(function (x) { return x.slug !== p.slug; }).slice(0, 4).map(function (x) { return carte(x, 'h3'); }).join('');
  };
  var afficher = function () {
    if (grille) {
      grille.innerHTML = pieces.length ? pieces.map(function (p) { return carte(p, 'h2'); }).join('') : '<p class="vide-boutique">' + esc(T.vide) + '</p>';
      filtrer(grille);
    }
    if (fiche) rendreFiche();
    else apercus.forEach(function (z) {
      var nb = z.querySelectorAll('.produit').length || 4;
      if (pieces.length) z.innerHTML = pieces.slice(0, nb).map(function (p) { return carte(p, 'h3'); }).join('');
    });
    var q = new URLSearchParams(location.search).get('reserver');
    if (q) ouvrir(q, q);
  };
  fetch('/api/boutique/').then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (j) { pieces = j.pieces || []; afficher(); })
    .catch(function () {
      pieces = [];
      if (fiche) { var w = fiche.querySelector('.wrap') || fiche; w.innerHTML = '<div class="produit-absente"><h1>' + esc(T.erreur) + '</h1><a class="bouton" href="' + T.base + '">' + esc(T.retour) + '</a></div>'; }
    });
}
