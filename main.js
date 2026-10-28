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

  // Apparition au défilement
  var aAnimer = document.querySelectorAll('.chiffres li, .postes li, .cv-carte, .etapes li, .domaines li, .cartes.quatre .carte');
  if ('IntersectionObserver' in window && aAnimer.length && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('js');
    var obs = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('vu'); obs.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });
    aAnimer.forEach(function (el) {
      var i = Array.prototype.indexOf.call(el.parentNode.children, el);
      el.style.transitionDelay = (i % 5) * 80 + 'ms';
      el.setAttribute('data-apparait', '');
      obs.observe(el);
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
