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
      menuBtn.textContent = ouvert ? 'Fermer' : 'Menu';
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
      document.querySelectorAll('.cartes .carte').forEach(function (c) {
        c.hidden = !(cat === 'tous' || (c.dataset.cat || '').split(' ').indexOf(cat) !== -1);
      });
    });
  });

  // Impression du parcours
  var imp = document.querySelector('[data-imprimer]');
  if (imp) imp.addEventListener('click', function () { window.print(); });

  // Visionneuse
  var dlg = document.querySelector('dialog.visionneuse');
  var boutons = Array.prototype.slice.call(document.querySelectorAll('.ouvrir'));
  if (dlg && boutons.length) {
    var img = dlg.querySelector('img');
    var legende = dlg.querySelector('p');
    var courant = 0, dernierFocus = null;
    var afficher = function (i) {
      courant = (i + boutons.length) % boutons.length;
      var b = boutons[courant];
      var vignette = b.querySelector('img');
      img.src = b.dataset.full;
      img.alt = vignette ? vignette.alt : '';
      legende.textContent = b.dataset.legende || '';
    };
    boutons.forEach(function (b, i) {
      b.addEventListener('click', function () {
        dernierFocus = b; afficher(i);
        if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      });
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
    marquer('main h2, .enonce .phrase, .domaines li, .vises-liste li, .etapes li, .postes li, .carte, .valeurs article, .parcours .ligne, .colonnes li, .cv-carte, .projet .texte, .panneau', 'rv');
    marquer('.projet .visuel, .bandeau .ouvrir, .grille figure, .recit .portrait', 'rv-img');
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
