(function () {
  // Hero : la lampe s'allume au chargement
  var hero = document.querySelector('.hero');
  var heroImg = hero && hero.querySelector('img');
  function allumer() { hero.classList.add('lit'); }
  if (heroImg) {
    if (heroImg.complete) allumer();
    else { heroImg.addEventListener('load', allumer); setTimeout(allumer, 2500); }
  }

  // Barre de navigation opaque après le hero
  var nav = document.querySelector('.nav');
  function surDefilement() {
    nav.classList.toggle('solid', window.scrollY > window.innerHeight * 0.6);
  }
  window.addEventListener('scroll', surDefilement, { passive: true });
  surDefilement();

  // Portfolio : construit à partir des données de la page
  function wix(u, w, h, q) {
    return 'https://static.wixstatic.com/media/58c60e_' + u + '/v1/fit/w_' + w + ',h_' + h + ',al_c,q_' + (q || 82) + ',enc_auto/sylvain-brochu.jpg';
  }
  function taille(W, H, max) { return W > max ? [max, Math.round(H * max / W)] : [W, H]; }
  var donnees = JSON.parse(document.getElementById('galerie').textContent);
  Array.prototype.forEach.call(document.querySelectorAll('.grille'), function (grille) {
    (donnees[grille.dataset.groupe] || []).forEach(function (d) {
      var u = d[0], W = d[1], H = d[2];
      var set = [480, 800, 1200].filter(function (w) { return w <= W; });
      if (!set.length || set[set.length - 1] < Math.min(W, 1200)) set.push(Math.min(W, 1200));
      var fig = document.createElement('figure');
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Agrandir : ' + d[3]);
      var f = taille(W, H, 2000);
      b.dataset.full = wix(u, f[0], f[1], 85);
      b.dataset.alt = d[4];
      b.dataset.legende = d[3];
      var im = document.createElement('img');
      var m = taille(W, H, 800);
      im.src = wix(u, m[0], m[1]);
      im.width = m[0]; im.height = m[1];
      im.srcset = set.map(function (w) { var t = taille(W, H, w); return wix(u, t[0], t[1]) + ' ' + t[0] + 'w'; }).join(', ');
      im.sizes = '(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 400px';
      im.loading = 'lazy'; im.decoding = 'async'; im.alt = d[4];
      b.appendChild(im);
      var cap = document.createElement('figcaption');
      cap.textContent = d[3];
      fig.appendChild(b); fig.appendChild(cap);
      grille.appendChild(fig);
    });
  });

  // Visionneuse
  var dlg = document.querySelector('dialog.visionneuse');
  var img = dlg.querySelector('img');
  var legende = dlg.querySelector('p');
  var boutons = Array.prototype.slice.call(document.querySelectorAll('.grille button'));
  var courant = 0;
  var dernierFocus = null;

  function afficher(i) {
    courant = (i + boutons.length) % boutons.length;
    var b = boutons[courant];
    img.src = b.dataset.full;
    img.alt = b.dataset.alt || '';
    legende.textContent = b.dataset.legende || '';
  }
  boutons.forEach(function (b, i) {
    b.addEventListener('click', function () {
      dernierFocus = b;
      afficher(i);
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

  // Balayage tactile
  var x0 = null;
  dlg.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  dlg.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) afficher(courant + (dx < 0 ? 1 : -1));
    x0 = null;
  });

  var annee = document.getElementById('annee');
  if (annee) annee.textContent = new Date().getFullYear();
})();
