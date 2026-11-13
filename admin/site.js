// Mon site : Sylvain corrige ses pages directement (textes, photos), puis clique « Publier ».
// La page est chargée depuis le dépôt, modifiée ici (aperçu cliquable), puis renvoyée telle quelle
// à /api/site, qui la publie sur GitHub ; Vercel remet le site en ligne tout seul.

const NOMS = {
  "index.html": "Accueil", "a-propos/index.html": "À propos", "parcours/index.html": "Parcours", "expertise/index.html": "Expertise",
  "projets/index.html": "Tous les projets", "contact/index.html": "Contact", "merci/index.html": "Merci (après un message)",
  "onomiko/index.html": "Onomiko", "onomiko/boutique/index.html": "Onomiko : la boutique",
  "en/index.html": "Home", "en/about/index.html": "About", "en/career/index.html": "Career", "en/expertise/index.html": "Expertise",
  "en/projects/index.html": "All projects", "en/contact/index.html": "Contact", "en/thank-you/index.html": "Thank you",
  "en/onomiko/index.html": "Onomiko", "en/onomiko/shop/index.html": "Onomiko: the shop",
};
const PROPRES = [[/cirque du soleil/i, "Cirque du Soleil"], [/never apart/i, "Never Apart"], [/grand prix/i, "Grand Prix"], [/formule 1/i, "Formule 1"], [/formula 1/i, "Formula 1"], [/even even/i, "Even Even"], [/\bluzia\b/i, "Luzia"], [/\bbaricaut\b/i, "Baricaut"]];
const joli = (s) => { let t = s.replace(/-/g, " "); t = t.charAt(0).toUpperCase() + t.slice(1); PROPRES.forEach(([r, v]) => { t = t.replace(r, v); }); return t; };
export function nomPage(c) {
  if (NOMS[c]) return NOMS[c];
  const seg = c.replace(/\/index\.html$/, "").split("/");
  return joli(seg[seg.length - 1]);
}
function groupe(c) {
  if (c.startsWith("en/")) return c.startsWith("en/projects/") && c !== "en/projects/index.html" ? "English : projects" : "English";
  if (c.startsWith("projets/") && c !== "projets/index.html") return "Mes projets";
  return "Pages principales";
}
const urlPage = (c) => "/" + c.replace(/index\.html$/, "");

// Blocs de texte modifiables : seulement des « feuilles » (pas de bloc dans un bloc), hors menus, formulaires et doublons cachés.
const TEXTE = "h1,h2,h3,h4,h5,h6,p,li,dt,dd,th,td,figcaption,blockquote";
const HORS = "template, form, nav, script, style, button, select, svg, [aria-hidden='true'], .sr, .sr-only, .compte";
const NON_TEXTE = "img, picture, svg, video, iframe, button, input, select, textarea, ul, ol, table, div, section, figure, " + TEXTE;
const EN_LIGNE = new Set(["A", "STRONG", "EM", "B", "I", "BR", "SMALL", "ABBR", "SUP", "SUB", "TIME", "CODE", "SPAN", "Q", "MARK"]);

export function creerSite(ctx) {
  const { etat, E, $, api, toast, ouvrirModale, fermerModale, entete } = ctx;
  const s = (etat.site = etat.site || { pret: null, pages: null, chemin: "index.html", doc: null });

  const nbModifs = () => (s.doc ? s.modifs.size + s.nb : 0);
  const guideVu = () => { try { return localStorage.getItem("sb-site-guide") === "vu"; } catch { return false; } };
  if (s.zones === undefined) s.zones = !!(window.matchMedia && matchMedia("(hover: none)").matches);
  const sale = () => nbModifs() > 0 || (s.photos && s.photos.length > 0);
  window.addEventListener("beforeunload", (e) => { if (sale()) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- Page de l'admin ----------
  async function page() {
    $("#page").innerHTML = entete("Mon site", "Clique un texte pour le corriger, clique une photo pour la changer. Rien ne change sur ton site tant que tu n'as pas cliqué « Publier ».", "") +
      `<div class="carte st-vide"><p class="vide"><span class="tourne"></span> Chargement...</p></div>`;
    try {
      if (s.pret === null) { const r = await api("/api/site/?action=etat"); s.pret = r.pret; }
      if (!s.pret) {
        $("#page").innerHTML = entete("Mon site", "Corriger les textes et les photos de ton site, directement ici.", "") +
          `<div class="carte"><p class="vide">L'éditeur du site n'est pas encore branché. Mika s'en occupe : dès que c'est fait, tu pourras modifier tes pages ici.</p></div>`;
        return;
      }
      if (!s.pages) s.pages = (await api("/api/site/?action=pages")).pages;
      if (!s.doc) await charger(s.chemin, false);
      dessiner();
    } catch (e) {
      $("#page").innerHTML = entete("Mon site", "", "") + `<div class="carte"><p class="vide">Impossible d'ouvrir l'éditeur : ${E(e.message)}</p></div>`;
    }
  }

  function dessiner() {
    const groupes = {};
    s.pages.forEach((c) => { (groupes[groupe(c)] = groupes[groupe(c)] || []).push(c); });
    const ordre = ["Pages principales", "Mes projets", "English", "English : projects"];
    const options = ordre.filter((g) => groupes[g]).map((g) => `<optgroup label="${E(g)}">${groupes[g]
      .sort((a, b) => (a.split("/").length - b.split("/").length) || nomPage(a).localeCompare(nomPage(b), "fr"))
      .map((c) => `<option value="${E(c)}" ${c === s.chemin ? "selected" : ""}>${E(nomPage(c))}</option>`).join("")}</optgroup>`).join("");
    const jumelle = cheminJumeau();
    $("#page").innerHTML = entete("Mon site", "Clique un texte pour le corriger, clique une photo pour la changer. Rien ne change sur ton site tant que tu n'as pas cliqué « Publier ».", "") + `
    ${guideVu() ? "" : `<div class="carte st-guide"><div>
      <h2>Comment ça marche</h2>
      <ol>
        <li>Choisis la page à corriger dans la liste « Page ».</li>
        <li>Clique un texte sur la page et écris directement, comme dans un courriel. Dans une liste, Entrée ajoute une ligne.</li>
        <li>Clique une photo pour la remplacer, la déplacer ou la supprimer.</li>
        <li>Pour ajouter des photos, clique « + Ajouter des photos » en haut : tu choisis d'abord la page et l'endroit exact où elles doivent apparaître, puis tu les sélectionnes, plusieurs d'un coup si tu veux.</li>
        <li>Une photo au mauvais endroit ? « Déplacer des photos » : tu coches celles à bouger et tu choisis la page d'arrivée.</li>
        <li>Clique « Publier ». Ta page est en ligne environ une minute plus tard, un message te le confirme.</li>
      </ol>
      <p class="aide">Un texte qui revient sur plusieurs pages (par exemple le titre d'un projet sur l'accueil) se corrige sur chaque page. Le site en anglais se corrige à part, avec le bouton « Version anglaise ».</p>
    </div><button class="btn petit" data-st="compris">Compris</button></div>`}
    <div class="st-barre carte">
      <label class="st-choix"><span>Page</span><select id="st-page">${options}</select></label>
      <div class="st-liens">
        <a class="btn petit" href="${E(urlPage(s.chemin))}" target="_blank" rel="noopener">Voir en ligne</a>
        ${jumelle ? `<button class="btn petit" data-st="jumelle">${s.chemin.startsWith("en/") ? "Version française" : "Version anglaise"}</button>` : ""}
        <button class="btn petit laiton" data-st="photos">+ Ajouter des photos</button>
        <button class="btn petit" data-st="deplacer">Déplacer des photos</button>
        <button class="btn petit" data-st="menu">Ordre du menu</button>
        <button class="btn petit" data-st="blocs">Organiser les sections</button>
        <button class="btn petit" data-st="google">Titre et description Google</button>
        <button class="btn petit" data-st="zones" aria-pressed="${s.zones ? "true" : "false"}">${s.zones ? "Cacher les zones modifiables" : "Montrer ce qui se modifie"}</button>
      </div>
      <div class="st-etat"><span id="st-compte"></span>
        <button class="btn petit" data-st="annuler" id="st-annuler">Annuler mes changements</button>
        <button class="btn laiton" data-st="publier" id="st-publier">Publier</button>
      </div>
    </div>
    <div class="st-cadre"><iframe id="st-apercu" title="Ta page, modifiable"></iframe></div>
    <p class="aide st-aide">Entrée dans une liste ou un paragraphe : ajoute une ligne. Une ligne vidée puis Retour arrière : la supprime. Une photo d'une galerie : clique-la pour la remplacer ou la supprimer.${s.chemin.startsWith("en/") ? "" : " Pense aussi à la version anglaise de la page."}</p>`;
    $("#st-page").onchange = (e) => changerPage(e.target.value);
    const pret = construireApercu();
    majBarre();
    return pret;
  }

  function majBarre() {
    const n = nbModifs(), c = $("#st-compte"), p = $("#st-publier"), a = $("#st-annuler");
    if (!c) return;
    c.textContent = s.envoi ? "Publication..." : n ? `${n} changement${n > 1 ? "s" : ""} pas encore publié${n > 1 ? "s" : ""}` : s.enLigne ? "En ligne sur ton site." : s.publieLe ? "Publié. Mise en ligne en cours, environ une minute..." : "Aucun changement";
    c.className = n ? "st-attente" : s.enLigne ? "st-ok" : s.publieLe ? "st-encours" : "";
    p.disabled = !n || s.envoi; a.disabled = !n || s.envoi;
  }

  async function changerPage(c) {
    if (c === s.chemin) return;
    if (sale() && !confirm("Tes changements sur cette page ne sont pas publiés. Les abandonner ?")) { $("#st-page").value = s.chemin; return; }
    try { await charger(c, true); dessiner(); } catch (e) { toast(e.message, true); $("#st-page").value = s.chemin; }
  }

  async function charger(c, avecMessage) {
    if (avecMessage) { const cadre = $(".st-cadre"); cadre && cadre.classList.add("charge"); }
    const r = await api(`/api/site/?action=page&chemin=${encodeURIComponent(c)}`);
    s.chemin = c; s.sha = r.sha;
    s.doctype = (r.contenu.match(/^\s*<!doctype[^>]*>/i) || ["<!doctype html>"])[0].trim();
    s.doc = new DOMParser().parseFromString(r.contenu, "text/html");
    s.orig = new Map(); s.modifs = new Set(); s.nb = 0; s.photos = []; s.figs = new Set(); s.grilles = new Set(); s.locales = new Map(); s.defil = 0; s.publieLe = null; s.enLigne = false;
  }

  function cheminJumeau() {
    if (!s.doc) return "";
    const fr = s.chemin.startsWith("en/");
    const l = s.doc.querySelector(`link[rel="alternate"][hreflang^="${fr ? "fr" : "en"}"]`);
    if (!l) return "";
    try {
      const p = new URL(l.getAttribute("href"), location.origin).pathname.replace(/^\//, "");
      const c = (p.endsWith("/") || !p ? p : p + "/") + "index.html";
      return s.pages.includes(c) ? c : "";
    } catch { return ""; }
  }

  // ---------- Aperçu modifiable ----------
  function zone(doc) { return doc.querySelector("main") || doc.body; }
  function blocsTexte(doc) {
    const z = zone(doc);
    const feuilles = [...z.querySelectorAll(TEXTE)].filter((el) => !el.closest(HORS) && !el.querySelector(NON_TEXTE) && el.textContent.trim());
    // Liens seuls (boutons, exemples) qui ne sont pas déjà dans un bloc de texte
    const liens = [...z.querySelectorAll("a")].filter((a) => !a.closest(HORS) && !a.closest(TEXTE) && !a.querySelector(NON_TEXTE) && a.textContent.trim());
    return [...feuilles, ...liens];
  }
  const images = (doc) => [...zone(doc).querySelectorAll("img")].filter((i) => !i.closest("template"));

  function construireApercu() {
    const doc = s.doc;
    s.ids = new Map(); let n = 0;
    const marquer = (el, t) => { const id = String(++n); el.setAttribute("data-cms", id); el.setAttribute("data-cms-t", t); s.ids.set(id, el); };
    blocsTexte(doc).forEach((el) => { if (!s.orig.has(el)) s.orig.set(el, el.innerHTML); marquer(el, "t"); });
    images(doc).forEach((el) => marquer(el, "i"));
    zone(doc).querySelectorAll(".galerie .grille").forEach((el) => marquer(el, "g"));
    s.prochainId = n + 1;
    const copie = doc.documentElement.cloneNode(true);
    s.ids.forEach((el) => { el.removeAttribute("data-cms"); el.removeAttribute("data-cms-t"); });
    copie.querySelectorAll("script").forEach((x) => x.remove());
    // Photos ajoutées mais pas encore publiées : montrées depuis la copie locale
    copie.querySelectorAll("img").forEach((i) => { const u = s.locales.get(i.getAttribute("src")); if (u) { i.setAttribute("src", u); i.removeAttribute("srcset"); } });
    const tete = copie.querySelector("head");
    const base = doc.createElement("base"); base.setAttribute("href", location.origin + "/"); tete.prepend(base);
    const st = doc.createElement("style"); st.textContent = STYLE_APERCU; tete.append(st);
    const f = $("#st-apercu");
    return new Promise((pret) => {
      f.onload = () => { brancher(f); pret(); };
      f.srcdoc = s.doctype + copie.outerHTML;
    });
  }

  function brancher(f) {
    const d = f.contentDocument; if (!d) return;
    $(".st-cadre")?.classList.remove("charge");
    d.querySelectorAll('[data-cms-t="t"]').forEach((el) => { el.contentEditable = "true"; el.spellcheck = true; });
    d.documentElement.classList.toggle("cms-zones", !!s.zones);
    d.querySelectorAll('[data-cms-t="g"]').forEach((g) => ajouterBoutonGalerie(d, g));
    fidele(d, f);
    d.addEventListener("click", (e) => {
      const ajout = e.target.closest("[data-cms-ajout]");
      if (ajout) { e.preventDefault(); return choisirPhotos(ajout.getAttribute("data-cms-ajout")); }
      const img = e.target.closest('[data-cms-t="i"]') || e.target.closest("button.ouvrir, .vignette, a")?.querySelector('[data-cms-t="i"]');
      const dansTexte = e.target.closest('[data-cms-t="t"]');
      if (img && !dansTexte) { e.preventDefault(); return ouvrirPhoto(img.getAttribute("data-cms")); }
      if (e.target.closest("a, button")) e.preventDefault();
    });
    d.addEventListener("submit", (e) => e.preventDefault());
    d.addEventListener("input", (e) => { const el = e.target.closest?.('[data-cms-t="t"]'); if (el) majTexte(el); });
    d.addEventListener("keydown", (e) => clavier(e, d));
    d.addEventListener("paste", (e) => {
      if (!e.target.closest?.('[data-cms-t="t"]')) return;
      e.preventDefault();
      const t = (e.clipboardData.getData("text/plain") || "").replace(/\s*\n\s*/g, " ");
      d.execCommand("insertText", false, t);
    });
    d.addEventListener("dragstart", (e) => e.preventDefault());
    const w = f.contentWindow;
    w.scrollTo(0, s.defil || 0);
    w.addEventListener("scroll", () => { s.defil = w.scrollY; }, { passive: true });
  }

  // L'aperçu est servi sans les scripts du site : on remet à la main les classes
  // que main.js pose, pour que ce que Sylvain voit ici soit son site, à l'identique.
  function fidele(d, f) {
    const hero = d.querySelector(".hero");
    if (hero) hero.classList.add("lit");
    const nav = d.querySelector(".nav");
    if (nav) {
      const w = f.contentWindow;
      const solide = () => nav.classList.toggle("solid", !hero || w.scrollY > w.innerHeight * 0.6);
      solide();
      w.addEventListener("scroll", solide, { passive: true });
    }
    d.documentElement.classList.add("anim");
    d.querySelectorAll(".rv, .rv-img").forEach((el) => el.classList.add("vu"));
  }

  function ajouterBoutonGalerie(d, g) {
    const b = d.createElement("button");
    b.type = "button"; b.className = "cms-ajout"; b.setAttribute("data-cms-ajout", g.getAttribute("data-cms"));
    b.textContent = "+ Ajouter des photos à cette galerie";
    g.after(b);
  }

  function nettoyer(el) {
    const d = el.ownerDocument, c = el.cloneNode(true);
    for (const x of [...c.querySelectorAll("*")].reverse()) {
      ["style", "contenteditable", "data-cms", "data-cms-t", "spellcheck"].forEach((a) => x.removeAttribute(a));
      if (!EN_LIGNE.has(x.tagName)) {
        if (/^(DIV|P)$/.test(x.tagName) && x.previousSibling) x.before(d.createElement("br"));
        x.replaceWith(...x.childNodes);
      } else if (x.tagName === "SPAN" && !x.attributes.length) x.replaceWith(...x.childNodes);
    }
    return c.innerHTML.replace(/(?:<br>\s*)+$/, "").replace(/&nbsp;(?=\s|$)/g, " ").replace(/(\s)&nbsp;/g, "$1 ").replace(/^\s+|\s+$/g, (m) => (m.includes("\n") ? m : ""));
  }

  function majTexte(el) {
    const brut = s.ids.get(el.getAttribute("data-cms")); if (!brut) return;
    brut.innerHTML = nettoyer(el);
    if (brut.innerHTML === s.orig.get(brut)) s.modifs.delete(brut); else s.modifs.add(brut);
    const fig = brut.closest("figure"); if (fig && brut.tagName === "FIGCAPTION") s.figs.add(fig);
    majBarre();
  }

  function clavier(e, d) {
    const el = e.target.closest?.('[data-cms-t="t"]'); if (!el) return;
    const bloc = /^(LI|P)$/.test(el.tagName);
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey && bloc) { d.execCommand("insertLineBreak"); return; }
      if (bloc) return nouveauBloc(el, d);
      el.blur(); return;
    }
    if (e.key === "Backspace" && bloc && !el.textContent.trim()) {
      const freres = [...el.parentElement.children].filter((x) => x.tagName === el.tagName);
      if (freres.length < 2) return;
      e.preventDefault();
      const prec = el.previousElementSibling && el.previousElementSibling.matches('[data-cms-t="t"]') ? el.previousElementSibling : null;
      const brut = s.ids.get(el.getAttribute("data-cms"));
      if (brut) { if (s.orig.get(brut) !== null) s.nb++; s.modifs.delete(brut); brut.remove(); }
      el.remove(); majBarre();
      if (prec) { prec.focus(); placerFin(prec, d); }
      return;
    }
    if (e.key === "Escape") el.blur();
  }

  function nouveauBloc(el, d) {
    const brut = s.ids.get(el.getAttribute("data-cms")); if (!brut) return;
    const sel = d.getSelection(); if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0), reste = d.createRange();
    reste.setStart(r.endContainer, r.endOffset); reste.setEnd(el, el.childNodes.length);
    const fragment = reste.extractContents();
    const nouvel = el.cloneNode(false); nouvel.appendChild(fragment); el.after(nouvel);
    const brutNouvel = brut.cloneNode(false); brut.after(brutNouvel);
    const id = String(s.prochainId++); nouvel.setAttribute("data-cms", id); s.ids.set(id, brutNouvel);
    nouvel.contentEditable = "true";
    s.orig.set(brutNouvel, null); s.modifs.add(brutNouvel);
    majTexte(el); brutNouvel.innerHTML = nettoyer(nouvel);
    nouvel.focus(); const debut = d.createRange(); debut.setStart(nouvel, 0); debut.collapse(true); sel.removeAllRanges(); sel.addRange(debut);
    majBarre();
  }
  function placerFin(el, d) { const r = d.createRange(); r.selectNodeContents(el); r.collapse(false); const sel = d.getSelection(); sel.removeAllRanges(); sel.addRange(r); }

  // ---------- Photos ----------
  const apercuDoc = () => $("#st-apercu")?.contentDocument;
  const enApercu = (id) => apercuDoc()?.querySelector(`[data-cms="${id}"]`);
  const titrePage = () => (s.doc.querySelector("main h1") || s.doc.querySelector("h1"))?.textContent.replace(/\s+/g, " ").trim() || "Sylvain Brochu";
  const slug = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "photo";

  async function decoder(fichier) {
    if (window.createImageBitmap) { try { return await createImageBitmap(fichier, { imageOrientation: "from-image" }); } catch { /* essai suivant */ } }
    const url = URL.createObjectURL(fichier);
    try { return await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; }); }
    catch { throw new Error(`« ${fichier.name} » ne s'ouvre pas dans ton navigateur. Enregistre la photo en JPG, puis réessaie.`); }
  }
  function encoder(src, largeur) {
    const k = Math.min(1, largeur / src.width);
    const c = document.createElement("canvas"); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, c.width, c.height);
    let q = 0.82, d = c.toDataURL("image/webp", q), ext = "webp";
    if (!d.startsWith("data:image/webp")) { q = 0.86; d = c.toDataURL("image/jpeg", q); ext = "jpg"; }
    while (d.length > 2_800_000 && q > 0.5) { q -= 0.08; d = c.toDataURL(ext === "webp" ? "image/webp" : "image/jpeg", q); }
    return { d, ext, w: c.width, h: c.height };
  }
  // Prépare 3 ou 4 tailles de la photo et les envoie ; renvoie les variantes prêtes à publier.
  async function preparer(fichier, nom) {
    if (!/^image\//.test(fichier.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(fichier.name)) throw new Error(`« ${fichier.name} » n'est pas une photo.`);
    const src = await decoder(fichier);
    const base = `${slug(nom || fichier.name.replace(/\.[^.]+$/, ""))}-${Date.now().toString(36)}`;
    const largeurs = [...new Set([600, 1000, 1600, 2400].map((l) => Math.min(l, src.width)))];
    const variantes = [];
    for (const l of largeurs) {
      const v = encoder(src, l);
      const chemin = `img/cms/${base}-${v.w}x${v.h}.${v.ext}`;
      const r = await api("/api/site/?action=photo", { method: "POST", body: { chemin, donnees: v.d } });
      variantes.push({ chemin, sha: r.sha, w: v.w, h: v.h, url: v.d });
    }
    s.photos.push(...variantes.map(({ chemin, sha }) => ({ chemin, sha })));
    const apercu = variantes[variantes.length - 1].url;
    variantes.forEach((v) => s.locales.set("/" + v.chemin, apercu));
    return variantes;
  }
  function appliquer(brut, vue, variantes) {
    const moyen = variantes.find((v) => v.w >= 1000) || variantes[variantes.length - 1], grand = variantes[variantes.length - 1];
    brut.setAttribute("src", "/" + moyen.chemin);
    if (variantes.length > 1) brut.setAttribute("srcset", variantes.map((v) => `/${v.chemin} ${v.w}w`).join(", ")); else brut.removeAttribute("srcset");
    if (variantes.length > 1 && !brut.getAttribute("sizes")) brut.setAttribute("sizes", "(max-width: 900px) 100vw, 60vw");
    brut.setAttribute("width", moyen.w); brut.setAttribute("height", moyen.h);
    const bouton = brut.closest("button.ouvrir"); if (bouton) bouton.setAttribute("data-full", "/" + grand.chemin);
    if (vue) { vue.removeAttribute("srcset"); vue.src = grand.url; vue.setAttribute("width", moyen.w); vue.setAttribute("height", moyen.h); }
  }

  function ouvrirPhoto(id) {
    const brut = s.ids.get(id), vue = enApercu(id); if (!brut) return;
    const fig = brut.closest("figure"), enGalerie = !!(fig && brut.closest(".galerie .grille"));
    let enCours = false;
    ouvrirModale("Photo", `
      <div class="st-photo"><img src="${E(vue?.currentSrc || vue?.src || brut.getAttribute("src") || "")}" alt=""></div>
      <label class="champ large"><span>Description de la photo (lue par Google et par les personnes aveugles)</span><textarea name="alt" rows="2">${E(brut.getAttribute("alt") || "")}</textarea></label>
      ${fig && fig.querySelector("figcaption") ? `<p class="aide">La légende sous la photo se corrige directement sur la page.</p>` : ""}
      ${enGalerie ? `<div class="st-ordre"><span>Place dans la galerie</span><button type="button" class="btn petit" data-m="avant">Déplacer avant</button><button type="button" class="btn petit" data-m="apres">Déplacer après</button></div>` : ""}
      <p class="aide st-envoi" hidden><span class="tourne"></span> Préparation de la photo...</p>`,
    `${enGalerie ? `<button class="btn danger" data-m="supprimer">Supprimer la photo</button>` : "<span></span>"}
     <div class="actions"><label class="btn">Remplacer la photo<input type="file" accept="image/*,.heic,.heif" hidden></label><button class="btn laiton" data-m="ok">OK</button></div>`,
    (m) => {
      const champAlt = $("textarea[name=alt]", m);
      $("input[type=file]", m).onchange = async (e) => {
        const fichier = e.target.files[0]; if (!fichier || enCours) return;
        enCours = true; $(".st-envoi", m).hidden = false;
        try {
          const v = await preparer(fichier, champAlt.value || titrePage());
          appliquer(brut, vue, v); s.nb++; if (fig) s.figs.add(fig);
          $(".st-photo img", m).src = v[v.length - 1].url; majBarre();
          toast("Photo remplacée. Clique « Publier » pour la mettre en ligne.");
        } catch (err) { toast(err.message, true); }
        enCours = false; $(".st-envoi", m).hidden = true;
      };
      $('[data-m="ok"]', m).onclick = () => {
        const alt = champAlt.value.replace(/\s+/g, " ").trim();
        if (alt !== (brut.getAttribute("alt") || "")) { brut.setAttribute("alt", alt); vue && vue.setAttribute("alt", alt); s.nb++; if (fig) s.figs.add(fig); majBarre(); }
        fermerModale();
      };
      const ordre = () => {
        const av = $('[data-m="avant"]', m), ap = $('[data-m="apres"]', m); if (!av) return;
        av.disabled = !fig.previousElementSibling; ap.disabled = !fig.nextElementSibling;
      };
      const deplacer = (sens) => {
        const vueFig = vue?.closest("figure");
        if (sens < 0 && fig.previousElementSibling) { fig.previousElementSibling.before(fig); vueFig?.previousElementSibling && vueFig.previousElementSibling.before(vueFig); }
        else if (sens > 0 && fig.nextElementSibling) { fig.nextElementSibling.after(fig); vueFig?.nextElementSibling && vueFig.nextElementSibling.after(vueFig); }
        else return;
        s.nb++; majBarre(); ordre(); vueFig?.scrollIntoView({ block: "center", behavior: "smooth" });
      };
      if ($('[data-m="avant"]', m)) { $('[data-m="avant"]', m).onclick = () => deplacer(-1); $('[data-m="apres"]', m).onclick = () => deplacer(1); ordre(); }
      const sup = $('[data-m="supprimer"]', m);
      if (sup) sup.onclick = () => {
        if (!confirm("Supprimer cette photo de la galerie ?")) return;
        const vueFig = vue?.closest("figure"); const grille = fig.parentElement;
        fig.remove(); vueFig && vueFig.remove(); s.nb++; s.grilles = (s.grilles || new Set()).add(grille);
        fermerModale(); majBarre();
      };
    });
  }

  // Retrouve l'identifiant d'aperçu d'un élément de la page
  const idDe = (el) => { for (const [id, x] of s.ids) if (x === el) return id; return null; };

  // Une page sans galerie : on lui en crée une, au même format que les autres pages du site.
  function nouvelleGalerie(doc, anglais, apres) {
    const main = doc.querySelector("main") || doc.body;
    const sec = doc.createElement("section");
    sec.className = "galerie";
    const id = main.querySelector("#t-galerie") ? "t-galerie-" + Date.now().toString(36) : "t-galerie";
    sec.setAttribute("aria-labelledby", id);
    sec.innerHTML = `<div class="wrap"><h2 id="${id}">${anglais ? "Gallery" : "Images"}</h2><div class="grille"></div></div>`;
    // Placée juste après la section choisie ; sinon à la fin, avant « Autres projets ».
    if (apres && apres.parentElement === main) apres.after(sec);
    else { const voisins = main.querySelector("nav.voisins"); if (voisins) voisins.before(sec); else main.append(sec); }
    return sec.querySelector(".grille");
  }
  function creerGalerie(apres) { const g = nouvelleGalerie(s.doc, s.chemin.startsWith("en/"), apres); s.nb++; return g; }

  // Nombre de photos annoncé au-dessus d'une galerie (« 12 images »)
  function majCompte(sec) {
    const compte = sec?.querySelector(".compte"), g = sec?.querySelector(".grille");
    if (!compte || !g) return;
    const n = g.querySelectorAll("figure").length;
    compte.textContent = compte.textContent.replace(/\d+/, n).replace(/\bimages?\b/, n > 1 ? "images" : "image");
  }

  function choisirFichiers() {
    return new Promise((ok) => {
      const i = document.createElement("input");
      i.type = "file"; i.accept = "image/*,.heic,.heif"; i.multiple = true; i.hidden = true;
      i.onchange = () => { ok([...i.files]); i.remove(); };
      i.oncancel = () => { ok([]); i.remove(); };
      document.body.append(i); i.click();
    });
  }

  // ---------- Bouton « Ajouter des photos » de la barre ----------
  // Avant, les photos tombaient dans la première galerie de la page ouverte, ou dans une
  // nouvelle galerie créée tout en bas. Maintenant on demande d'abord OÙ : la page, puis
  // la galerie exacte (ou une nouvelle, placée après la section de son choix).
  function titreSection(el) {
    if (!el) return "Section";
    const net = (t) => String(t || "").replace(/\s+/g, " ").trim();
    const a = net(el.querySelector(".surtitre")?.textContent).slice(0, 45);
    const b = net(el.querySelector("h1, h2, h3, h4")?.textContent).slice(0, 55);
    if (a && b) return `${a} : ${b}`;
    if (b) return b;
    if (a) return a;
    const aria = net(el.getAttribute("aria-label"));
    if (aria) return aria.slice(0, 55);
    const t = net(el.textContent).slice(0, 55);
    return t || net(el.className).split(" ")[0].replace(/-/g, " ") || el.tagName.toLowerCase();
  }
  // Les galeries de photos de la page ouverte (une galerie = une grille de figures).
  const galeriesDe = (doc) => [...zone(doc).querySelectorAll(".grille")]
    .filter((g) => !g.closest(".produit-page"))
    .map((g) => ({ el: g, titre: titreSection(g.closest("section") || g.parentElement), nb: g.querySelectorAll("figure").length }));
  const galeriesDoc = () => galeriesDe(s.doc);
  // Les grandes sections de la page, pour placer une nouvelle galerie.
  const sectionsDoc = () => [...zone(s.doc).children].filter((el) => !/^(SCRIPT|TEMPLATE|STYLE|LINK)$/.test(el.tagName));

  async function ajouterPhotosPage() {
    const groupes = {};
    s.pages.forEach((c) => { (groupes[groupe(c)] = groupes[groupe(c)] || []).push(c); });
    const ordreG = ["Pages principales", "Mes projets", "English", "English : projects"];
    const optionsPages = () => ordreG.filter((g) => groupes[g]).map((g) => `<optgroup label="${E(g)}">${groupes[g]
      .slice().sort((a, b) => (a.split("/").length - b.split("/").length) || nomPage(a).localeCompare(nomPage(b), "fr"))
      .map((c) => `<option value="${E(c)}" ${c === s.chemin ? "selected" : ""}>${E(nomPage(c))}</option>`).join("")}</optgroup>`).join("");

    ouvrirModale("Ajouter des photos", `
      <p class="aide">Choisis la page, puis l'endroit exact où les photos doivent apparaître. Rien ne bouge sur ton site tant que tu n'as pas cliqué « Publier ».</p>
      <label class="champ ph-champ"><span>Page</span><select id="ph-page">${optionsPages()}</select></label>
      <div class="ph-ou" id="ph-ou"></div>
      <p class="aide ph-attente" hidden><span class="tourne"></span> Ouverture de la page...</p>`,
    `<button class="btn" data-ph="annuler">Annuler</button>
     <button class="btn laiton" data-ph="choisir">Choisir les photos...</button>`,
    (m) => {
      const dessinerOu = () => {
        const gals = galeriesDoc(), secs = sectionsDoc();
        const opts = gals.map((g, i) => `<option value="${i}">${gals.length > 1 ? `${i + 1}. ` : ""}${E(g.titre)} (${g.nb} photo${g.nb > 1 ? "s" : ""})</option>`).join("");
        $("#ph-ou", m).innerHTML = `
          <label class="champ ph-champ"><span>Endroit</span>
            <select id="ph-dest">${opts}<option value="neuve" ${gals.length ? "" : "selected"}>Créer une nouvelle galerie sur cette page</option></select>
          </label>
          <label class="champ ph-champ" id="ph-pos" ${gals.length ? "" : "hidden"}><span>Position dans la galerie</span>
            <select id="ph-pos-sel"><option value="fin">à la fin, après les photos déjà là</option><option value="debut">au début, avant les autres</option></select>
          </label>
          <label class="champ ph-champ" id="ph-apres" ${gals.length ? "hidden" : ""}><span>Placer la nouvelle galerie</span>
            <select id="ph-apres-sel">${secs.map((el, i) => `<option value="${i}" ${i === secs.length - 1 ? "selected" : ""}>après « ${E(titreSection(el))} »</option>`).join("")}</select>
          </label>
          <p class="aide">${gals.length ? "Tu peux aussi déplacer cette galerie plus tard avec « Organiser les sections »." : "Cette page n'a pas encore de galerie : on en crée une à l'endroit que tu choisis."}</p>`;
        $("#ph-dest", m).onchange = (e) => {
          const neuve = e.target.value === "neuve";
          $("#ph-pos", m).hidden = neuve;
          $("#ph-apres", m).hidden = !neuve;
        };
      };
      dessinerOu();

      $("#ph-page", m).onchange = async (e) => {
        const c = e.target.value;
        if (c === s.chemin) return;
        if (sale()) { e.target.value = s.chemin; return toast("Publie ou annule d'abord tes changements sur cette page.", true); }
        const att = $(".ph-attente", m); att.hidden = false; e.target.disabled = true;
        try { await charger(c, true); await dessiner(); }
        catch (err) { e.target.value = s.chemin; toast(err.message, true); }
        att.hidden = true; e.target.disabled = false;
        dessinerOu();
      };

      m.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-ph]"); if (!b) return;
        e.preventDefault();
        if (b.getAttribute("data-ph") === "annuler") return fermerModale();
        // On lit les choix AVANT d'ouvrir le sélecteur de fichiers : la fenêtre se ferme ensuite.
        const dest = $("#ph-dest", m).value;
        const position = $("#ph-pos-sel", m)?.value || "fin";
        const iApres = +($("#ph-apres-sel", m)?.value ?? -1);
        const fichiers = await choisirFichiers();
        if (!fichiers.length) return;
        fermerModale();
        let grille;
        if (dest === "neuve") { grille = creerGalerie(sectionsDoc()[iApres]); await construireApercu(); }
        else grille = galeriesDoc()[+dest]?.el;
        if (!grille) return toast("Cette galerie n'existe plus. Rouvre « + Ajouter des photos ».", true);
        const gid = idDe(grille);
        if (!gid) return toast("Impossible d'ajouter une photo à cet endroit.", true);
        enApercu(gid)?.closest("section")?.scrollIntoView({ block: "start", behavior: "smooth" });
        await ajouterPhotos(gid, fichiers, dest === "neuve" ? "fin" : position);
      });
    });
  }

  function choisirPhotos(gid) {
    const i = document.createElement("input"); i.type = "file"; i.accept = "image/*,.heic,.heif"; i.multiple = true; i.hidden = true;
    i.onchange = () => { ajouterPhotos(gid, [...i.files]); i.remove(); };
    document.body.append(i); i.click();
  }
  async function ajouterPhotos(gid, fichiers, position) {
    const grille = s.ids.get(gid), d = apercuDoc(), vueGrille = enApercu(gid);
    if (!grille || !fichiers.length || !vueGrille) return;
    // « au début » : on insère chaque photo devant la première, l'ordre choisi est gardé.
    const ancre = position === "debut" ? grille.firstElementChild : null;
    const vAncre = position === "debut" ? vueGrille.firstElementChild : null;
    // Le bouton de la galerie sert de barre de progression ; il n'existe pas toujours.
    const bouton = d.querySelector(`[data-cms-ajout="${gid}"]`);
    const etape = (t) => { if (bouton) { bouton.textContent = t; bouton.disabled = t !== null && !/^\+/.test(t); } };
    const modele = grille.querySelector("figure");
    const anglais = s.chemin.startsWith("en/");
    for (const [k, fichier] of fichiers.entries()) {
      etape(`Préparation de la photo ${k + 1} sur ${fichiers.length}...`);
      try {
        const v = await preparer(fichier, titrePage());
        let fig;
        if (modele) {
          fig = modele.cloneNode(true);
          fig.querySelectorAll("source").forEach((x) => x.remove());
        } else {
          fig = s.doc.createElement("figure");
          fig.innerHTML = `<button type="button" class="ouvrir"><img loading="lazy" decoding="async" sizes="(max-width: 560px) 50vw, (max-width: 1000px) 50vw, 33vw"></button><figcaption></figcaption>`;
        }
        const img = fig.querySelector("img"); const cap = fig.querySelector("figcaption"); const btn = fig.querySelector("button.ouvrir");
        img.setAttribute("alt", titrePage()); img.setAttribute("loading", "lazy");
        if (cap) cap.textContent = "";
        if (btn) { btn.setAttribute("data-legende", ""); btn.setAttribute("aria-label", (anglais ? "Enlarge: " : "Agrandir : ") + titrePage()); }
        appliquer(img, null, v);
        if (ancre) grille.insertBefore(fig, ancre); else grille.append(fig);
        s.figs.add(fig); s.grilles = (s.grilles || new Set()).add(grille); s.nb++;
        // Même figure dans l'aperçu, avec la photo locale
        const vueFig = d.importNode(fig, true);
        const vImg = vueFig.querySelector("img"); vImg.removeAttribute("srcset"); vImg.src = v[v.length - 1].url;
        const idImg = String(s.prochainId++); vImg.setAttribute("data-cms", idImg); vImg.setAttribute("data-cms-t", "i"); s.ids.set(idImg, img);
        const vCap = vueFig.querySelector("figcaption");
        if (vCap && cap) { const idCap = String(s.prochainId++); vCap.setAttribute("data-cms", idCap); vCap.setAttribute("data-cms-t", "t"); vCap.contentEditable = "true"; s.ids.set(idCap, cap); }
        if (vAncre) vueGrille.insertBefore(vueFig, vAncre); else vueGrille.append(vueFig);
        majBarre();
      } catch (err) { toast(err.message, true); }
    }
    etape("+ Ajouter des photos à cette galerie");
    toast("Photos ajoutées. Écris une légende sous chacune si tu veux, puis clique « Publier ».");
  }

  // ---------- Déplacer des photos vers une autre page ----------
  // Les photos ajoutées au fil du temps se sont accumulées au bas de l'accueil.
  // Ici Sylvain en coche plusieurs d'un coup et les envoie dans la galerie d'une autre
  // page : les deux pages sont publiées ensemble, en une seule fois.
  async function deplacerPhotos() {
    if (sale()) return toast("Publie ou annule d'abord tes changements sur cette page.", true);
    const figs = [];
    galeriesDoc().forEach((g) => [...g.el.children].filter((x) => x.tagName === "FIGURE").forEach((f) => figs.push(f)));
    if (!figs.length) return toast("Cette page n'a pas encore de photos à déplacer.", true);

    const en = s.chemin.startsWith("en/");
    const dest = s.pages.filter((c) => c !== s.chemin && c.startsWith("en/") === en && !/\/(merci|thank-you)\//.test("/" + c));
    if (!dest.length) return toast("Aucune autre page où envoyer ces photos.", true);
    let cible = null, envoi = false;

    const vignette = (f) => {
      const img = f.querySelector("img");
      const leg = (f.querySelector("figcaption")?.textContent || img?.getAttribute("alt") || "").replace(/\s+/g, " ").trim();
      return { src: img?.getAttribute("src") || "", leg };
    };

    ouvrirModale("Déplacer des photos", `
      <p class="aide">Coche les photos à déplacer, choisis la page où elles doivent aller, puis clique « Déplacer ». Les deux pages sont mises en ligne d'un coup.</p>
      <div class="dp-barre">
        <button type="button" class="btn petit" data-dp="tout">Tout cocher</button>
        <button type="button" class="btn petit" data-dp="rien">Tout décocher</button>
        <span class="dp-compte" id="dp-compte"></span>
      </div>
      <div class="dp-grille" id="dp-grille">${figs.map((f, i) => {
        const v = vignette(f);
        return `<label class="dp-case"><input type="checkbox" data-i="${i}"><img src="${E(v.src)}" alt="" loading="lazy"><span>${E(v.leg || "Sans légende")}</span></label>`;
      }).join("")}</div>
      <label class="champ ph-champ"><span>Page d'arrivée</span>
        <select id="dp-page"><option value="">Choisis une page...</option>${dest.map((c) => `<option value="${E(c)}">${E(nomPage(c))}</option>`).join("")}</select>
      </label>
      <div class="dp-ou" id="dp-ou"></div>
      <p class="aide dp-envoi" hidden><span class="tourne"></span> Déplacement et mise en ligne des deux pages...</p>`,
    `<button class="btn" data-dp="annuler">Annuler</button>
     <button class="btn laiton" data-dp="faire" disabled>Déplacer</button>`,
    (m) => {
      const cases = () => [...m.querySelectorAll("#dp-grille input")];
      const choisies = () => cases().filter((c) => c.checked).map((c) => figs[+c.getAttribute("data-i")]);
      const majEtat = () => {
        const n = choisies().length;
        $("#dp-compte", m).textContent = n ? `${n} photo${n > 1 ? "s" : ""} cochée${n > 1 ? "s" : ""} sur ${figs.length}` : `Aucune photo cochée sur ${figs.length}`;
        $('[data-dp="faire"]', m).disabled = !n || !cible || envoi;
      };
      $("#dp-grille", m).addEventListener("change", majEtat);
      majEtat();

      $("#dp-page", m).onchange = async (e) => {
        const c = e.target.value; cible = null; $("#dp-ou", m).innerHTML = ""; majEtat();
        if (!c) return;
        e.target.disabled = true;
        $("#dp-ou", m).innerHTML = `<p class="aide"><span class="tourne"></span> Lecture de la page...</p>`;
        try {
          const r = await api(`/api/site/?action=page&chemin=${encodeURIComponent(c)}`);
          const doc = new DOMParser().parseFromString(r.contenu, "text/html");
          cible = { chemin: c, sha: r.sha, doc, doctype: (r.contenu.match(/^\s*<!doctype[^>]*>/i) || ["<!doctype html>"])[0].trim() };
          const gals = galeriesDe(doc);
          $("#dp-ou", m).innerHTML = `
            <label class="champ ph-champ"><span>Dans quelle galerie de « ${E(nomPage(c))} »</span>
              <select id="dp-dest">${gals.map((g, i) => `<option value="${i}">${gals.length > 1 ? `${i + 1}. ` : ""}${E(g.titre)} (${g.nb} photo${g.nb > 1 ? "s" : ""})</option>`).join("")}<option value="neuve" ${gals.length ? "" : "selected"}>Créer une nouvelle galerie à la fin de la page</option></select>
            </label>
            <label class="champ ph-champ"><span>Position</span>
              <select id="dp-pos"><option value="fin">à la fin, après les photos déjà là</option><option value="debut">au début, avant les autres</option></select>
            </label>`;
        } catch (err) { $("#dp-ou", m).innerHTML = `<p class="aide">Page impossible à lire : ${E(err.message)}</p>`; }
        e.target.disabled = false; majEtat();
      };

      m.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-dp]"); if (!b) return;
        e.preventDefault();
        const a = b.getAttribute("data-dp");
        if (a === "annuler") return envoi ? null : fermerModale();
        if (a === "tout" || a === "rien") { cases().forEach((c) => { c.checked = a === "tout"; }); return majEtat(); }
        if (a !== "faire" || envoi) return;
        const liste = choisies();
        if (!liste.length || !cible) return;
        envoi = true; majEtat(); $(".dp-envoi", m).hidden = false;
        try {
          // Page d'arrivée : on y copie les figures telles quelles (les photos sont déjà en ligne).
          const choixDest = $("#dp-dest", m).value, pos = $("#dp-pos", m).value;
          const grilleCible = choixDest === "neuve"
            ? nouvelleGalerie(cible.doc, cible.chemin.startsWith("en/"))
            : galeriesDe(cible.doc)[+choixDest]?.el;
          if (!grilleCible) throw new Error("Galerie d'arrivée introuvable.");
          const ancre = pos === "debut" ? grilleCible.firstElementChild : null;
          for (const f of liste) {
            const copie = cible.doc.importNode(f, true);
            if (ancre) grilleCible.insertBefore(copie, ancre); else grilleCible.append(copie);
          }
          majCompte(grilleCible.closest("section.galerie"));

          // Page de départ : on retire les figures, on remet les compteurs, on enlève une galerie vidée.
          const secs = new Set();
          liste.forEach((f) => { const sec = f.closest("section.galerie"); if (sec) secs.add(sec); f.remove(); });
          secs.forEach(majCompte);
          s.doc.querySelectorAll("section.galerie").forEach((sec) => { if (!sec.querySelector(".grille figure")) sec.remove(); });

          const n = liste.length;
          const r = await api("/api/site/?action=publier", { method: "POST", body: {
            fichiers: [
              { chemin: s.chemin, contenu: s.doctype + "\n" + s.doc.documentElement.outerHTML + "\n", sha: s.sha },
              { chemin: cible.chemin, contenu: cible.doctype + "\n" + cible.doc.documentElement.outerHTML + "\n", sha: cible.sha },
            ],
            message: `Mon site : ${n} photo${n > 1 ? "s" : ""} de ${nomPage(s.chemin)} vers ${nomPage(cible.chemin)}`,
          } });
          s.sha = r.shas?.[s.chemin] || s.sha;
          s.orig = new Map(); s.modifs = new Set(); s.nb = 0; s.photos = []; s.figs = new Set(); s.grilles = new Set();
          s.publieLe = Date.now(); s.enLigne = false;
          fermerModale();
          await dessiner();
          toast(`${n} photo${n > 1 ? "s déplacées" : " déplacée"} vers ${nomPage(cible.chemin)}. En ligne dans environ une minute.`);
          verifierEnLigne(s.chemin, s.sha);
        } catch (err) {
          envoi = false; $(".dp-envoi", m).hidden = true; majEtat();
          toast(err.code === "REFUS" ? err.message : "Pas déplacé : " + err.message, true);
          // Rien n'a été publié : on remet la page dans l'état du site pour repartir propre.
          try { fermerModale(); await charger(s.chemin, true); await dessiner(); } catch { /* on laisse l'écran tel quel */ }
        }
      });
    });
  }

  // ---------- Titre et description Google ----------
  // ---------- Ordre du menu ----------
  // Le menu est le même sur les ~77 pages du site. Ici on le réorganise une fois,
  // et « Publier le menu » l'applique partout, en français et en anglais d'un coup.
  async function ordreMenu() {
    let entrees;
    try { entrees = (await api("/api/site/?action=menu")).entrees; }
    catch (e) { return toast("Menu impossible à ouvrir : " + e.message, true); }
    const depart = JSON.stringify(entrees);
    let envoi = false;

    ouvrirModale("Ordre du menu", `
      <p class="aide">Glisse une ligne, ou utilise les flèches, pour changer l'ordre des onglets. Le même ordre est appliqué au menu français et au menu anglais, sur toutes les pages de ton site.</p>
      <div class="mn-apercu" id="mn-apercu"></div>
      <ul class="mn-liste" id="mn-liste"></ul>
      <p class="aide">Un onglet masqué disparaît du menu et du bas de page, mais la page reste en ligne et garde son adresse.</p>
      <p class="aide mn-envoi" hidden><span class="tourne"></span> Mise à jour de toutes les pages du site...</p>`,
    `<button class="btn" data-mn="annuler">Annuler</button>
     <button class="btn laiton" data-mn="publier">Publier le menu</button>`,
    (m) => {
      const liste = $("#mn-liste", m);

      const dessinerApercu = () => {
        $("#mn-apercu", m).innerHTML = `<span class="mn-mark">Sylvain Brochu</span>` +
          entrees.filter((e) => !e.cache).map((e) => `<span>${E(e.fr.libelle)}</span>`).join("") +
          `<span class="mn-lang">EN</span>`;
      };

      const dessiner = () => {
        liste.innerHTML = entrees.map((e, i) => `
          <li class="mn-ligne${e.cache ? " cache" : ""}" draggable="true" data-i="${i}">
            <span class="mn-prise" aria-hidden="true">&#10303;</span>
            <div class="mn-flex">
              <div class="mn-noms">
                <label><span>Français</span><input type="text" maxlength="40" data-mn-fr="${i}" value="${E(e.fr.libelle)}"></label>
                <label><span>Anglais</span><input type="text" maxlength="40" data-mn-en="${i}" value="${E(e.en.libelle)}"></label>
              </div>
              <span class="mn-url">${E(e.fr.href)}</span>
            </div>
            <div class="mn-boutons">
              <button type="button" class="btn petit" data-mn-haut="${i}" ${i === 0 ? "disabled" : ""} aria-label="Monter cet onglet">&uarr;</button>
              <button type="button" class="btn petit" data-mn-bas="${i}" ${i === entrees.length - 1 ? "disabled" : ""} aria-label="Descendre cet onglet">&darr;</button>
              <button type="button" class="btn petit" data-mn-voir="${i}">${e.cache ? "Afficher" : "Masquer"}</button>
            </div>
          </li>`).join("");
        dessinerApercu();
      };

      const bouger = (de, vers) => {
        if (vers < 0 || vers >= entrees.length || de === vers) return;
        entrees.splice(vers, 0, entrees.splice(de, 1)[0]);
        dessiner();
      };

      liste.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-mn-haut], button[data-mn-bas], button[data-mn-voir]");
        if (!b) return;
        e.preventDefault();
        if (b.hasAttribute("data-mn-haut")) { const i = +b.getAttribute("data-mn-haut"); return bouger(i, i - 1); }
        if (b.hasAttribute("data-mn-bas")) { const i = +b.getAttribute("data-mn-bas"); return bouger(i, i + 1); }
        const i = +b.getAttribute("data-mn-voir");
        if (!entrees[i].cache && entrees.filter((x) => !x.cache).length <= 1) return toast("Garde au moins un onglet visible.", true);
        entrees[i].cache = !entrees[i].cache; dessiner();
      });

      liste.addEventListener("input", (e) => {
        const c = e.target;
        if (c.hasAttribute("data-mn-fr")) entrees[+c.getAttribute("data-mn-fr")].fr.libelle = c.value;
        else if (c.hasAttribute("data-mn-en")) entrees[+c.getAttribute("data-mn-en")].en.libelle = c.value;
        else return;
        dessinerApercu();
      });

      // Glisser-déposer à la souris ; les flèches font le même travail au doigt.
      let tire = null;
      liste.addEventListener("dragstart", (e) => {
        const li = e.target.closest(".mn-ligne"); if (!li) return;
        tire = +li.getAttribute("data-i"); li.classList.add("tire");
        e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(tire));
      });
      liste.addEventListener("dragover", (e) => {
        if (tire === null) return;
        e.preventDefault();
        const li = e.target.closest(".mn-ligne"); if (!li) return;
        liste.querySelectorAll(".survol").forEach((x) => x.classList.remove("survol"));
        li.classList.add("survol");
      });
      liste.addEventListener("drop", (e) => {
        if (tire === null) return;
        e.preventDefault();
        const li = e.target.closest(".mn-ligne");
        const vers = li ? +li.getAttribute("data-i") : null;
        const de = tire; tire = null;
        if (vers === null || vers === de) return dessiner();
        bouger(de, vers);
      });
      liste.addEventListener("dragend", () => { if (tire !== null) { tire = null; dessiner(); } });

      $('[data-mn="annuler"]', m).onclick = () => fermerModale();
      $('[data-mn="publier"]', m).onclick = async () => {
        if (envoi) return;
        if (entrees.some((e) => !e.fr.libelle.trim() || !e.en.libelle.trim())) return toast("Un nom d'onglet est vide.", true);
        if (JSON.stringify(entrees) === depart) { fermerModale(); return toast("Rien n'a changé dans le menu."); }
        envoi = true;
        $(".mn-envoi", m).hidden = false;
        $('[data-mn="publier"]', m).disabled = true; $('[data-mn="annuler"]', m).disabled = true;
        try {
          const r = await api("/api/site/?action=menu", { method: "POST", body: { entrees } });
          fermerModale();
          toast(r.rien ? "Le menu était déjà comme ça." : `Menu publié sur ${r.pages} page${r.pages > 1 ? "s" : ""}. Ton site sera à jour dans environ une minute.`);
          if (!r.rien) { s.pages = null; s.doc = null; page(); }
        } catch (e) {
          toast(e.code === "REFUS" ? e.message : "Menu pas publié : " + e.message, true);
          envoi = false; $(".mn-envoi", m).hidden = true;
          $('[data-mn="publier"]', m).disabled = false; $('[data-mn="annuler"]', m).disabled = false;
        }
      };

      dessiner();
    });
  }


  // ---------- Organiser les sections d'une page ----------
  async function organiserBlocs() {
    if (sale()) return toast("Publie ou annule d'abord tes changements de texte sur cette page.", true);
    let r;
    try { r = await api(`/api/site/?action=blocs&chemin=${encodeURIComponent(s.chemin)}`); }
    catch (e) { return toast("Sections impossibles à ouvrir : " + e.message, true); }

    const items = r.blocs.map((b) => ({ ...b, vers: "", position: "fin" }));
    const depart = JSON.stringify(items);
    const anglais = r.jumelle && r.jumelle.alignee;
    let aussiEn = !!anglais;
    let envoi = false;

    // Pages de destination : celles de la même langue, sauf la page ouverte.
    const en = s.chemin.startsWith("en/");
    const dest = s.pages.filter((c) => c !== s.chemin && c.startsWith("en/") === en && !/\/(merci|thank-you)\//.test("/" + c));

    ouvrirModale("Organiser les sections", `
      <p class="aide">Chaque ligne est une grande section de la page <strong>${E(nomPage(s.chemin))}</strong>. Glisse-la, ou utilise les flèches, pour la monter ou la descendre. Tu peux aussi la masquer, ou l'envoyer sur une autre page.</p>
      <ul class="bl-liste" id="bl-liste"></ul>
      ${anglais ? `<label class="bl-en"><input type="checkbox" id="bl-en" checked> Appliquer la même organisation à la version anglaise (${E(nomPage(r.jumelle.chemin))})</label>`
        : r.jumelle ? `<p class="aide">La version anglaise de cette page n'a pas le même nombre de sections : elle ne sera pas touchée, pense à l'organiser à part.</p>` : ""}
      <p class="aide">Une section masquée disparaît de la page mais rien n'est perdu : tu peux la réafficher quand tu veux.</p>
      <p class="aide bl-envoi" hidden><span class="tourne"></span> Mise à jour des pages...</p>`,
    `<button class="btn" data-bl="annuler">Annuler</button>
     <button class="btn laiton" data-bl="publier">Publier l'organisation</button>`,
    (m) => {
      const liste = $("#bl-liste", m);
      const restants = () => items.filter((x) => !x.vers && !x.masque).length;

      const dessiner = () => {
        const places = items.filter((x) => !x.vers);
        liste.innerHTML = items.map((b, i) => {
          const rang = places.indexOf(b);
          const options = dest.map((c) => `<option value="${E(c)}" ${b.vers === c ? "selected" : ""}>${E(nomPage(c))}</option>`).join("");
          return `
          <li class="bl-ligne${b.masque ? " cache" : ""}${b.vers ? " part" : ""}" draggable="${b.vers ? "false" : "true"}" data-i="${i}">
            <span class="bl-prise" aria-hidden="true">&#10303;</span>
            <div class="bl-flex">
              <p class="bl-titre">${E(b.titre)}${b.masque ? ' <span class="bl-tag">masquée</span>' : ""}${b.vers ? ` <span class="bl-tag">part vers ${E(nomPage(b.vers))}</span>` : ""}</p>
              ${b.resume ? `<p class="bl-resume">${E(b.resume)}</p>` : ""}
              <p class="bl-info">${b.photos ? `${b.photos} photo${b.photos > 1 ? "s" : ""}` : "sans photo"}${b.ancre ? ` &middot; ancre #${E(b.ancre)}` : ""}</p>
              <div class="bl-vers">
                <label><span>Déplacer vers</span>
                  <select data-bl-vers="${i}"><option value="">rester sur cette page</option>${options}</select>
                </label>
                <label class="bl-pos"${b.vers ? "" : " hidden"}><span>Position</span>
                  <select data-bl-pos="${i}"><option value="fin" ${b.position === "fin" ? "selected" : ""}>à la fin</option><option value="debut" ${b.position === "debut" ? "selected" : ""}>au début</option></select>
                </label>
              </div>
            </div>
            <div class="bl-boutons">
              <button type="button" class="btn petit" data-bl-haut="${i}" ${b.vers || rang <= 0 ? "disabled" : ""} aria-label="Monter cette section">&uarr;</button>
              <button type="button" class="btn petit" data-bl-bas="${i}" ${b.vers || rang < 0 || rang === places.length - 1 ? "disabled" : ""} aria-label="Descendre cette section">&darr;</button>
              <button type="button" class="btn petit" data-bl-voir="${i}" ${b.vers ? "disabled" : ""}>${b.masque ? "Afficher" : "Masquer"}</button>
            </div>
          </li>`;
        }).join("");
      };

      // Déplace l'élément i d'un cran parmi les sections restées sur la page.
      const bouger = (i, sens) => {
        const places = items.filter((x) => !x.vers);
        const n = places.indexOf(items[i]);
        const voisin = places[n + sens];
        if (!voisin) return;
        const j = items.indexOf(voisin);
        items.splice(j, 0, items.splice(i, 1)[0]);
        dessiner();
      };

      liste.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-bl-haut], button[data-bl-bas], button[data-bl-voir]");
        if (!b) return;
        e.preventDefault();
        if (b.hasAttribute("data-bl-haut")) return bouger(+b.getAttribute("data-bl-haut"), -1);
        if (b.hasAttribute("data-bl-bas")) return bouger(+b.getAttribute("data-bl-bas"), 1);
        const i = +b.getAttribute("data-bl-voir");
        if (!items[i].masque && restants() <= 1) return toast("Garde au moins une section visible sur la page.", true);
        items[i].masque = !items[i].masque; dessiner();
      });

      liste.addEventListener("change", (e) => {
        const c = e.target;
        if (c.hasAttribute("data-bl-vers")) {
          const i = +c.getAttribute("data-bl-vers");
          if (c.value && restants() <= 1 && !items[i].masque) { c.value = ""; return toast("Garde au moins une section visible sur la page.", true); }
          items[i].vers = c.value;
          if (c.value) items[i].masque = false;
          dessiner();
        } else if (c.hasAttribute("data-bl-pos")) items[+c.getAttribute("data-bl-pos")].position = c.value;
      });

      let tire = null;
      liste.addEventListener("dragstart", (e) => {
        const li = e.target.closest(".bl-ligne"); if (!li || li.classList.contains("part")) return;
        tire = +li.getAttribute("data-i"); li.classList.add("tire");
        e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(tire));
      });
      liste.addEventListener("dragover", (e) => {
        if (tire === null) return;
        e.preventDefault();
        const li = e.target.closest(".bl-ligne"); if (!li) return;
        liste.querySelectorAll(".survol").forEach((x) => x.classList.remove("survol"));
        li.classList.add("survol");
      });
      liste.addEventListener("drop", (e) => {
        if (tire === null) return;
        e.preventDefault();
        const li = e.target.closest(".bl-ligne");
        const de = tire; tire = null;
        if (!li) return dessiner();
        const vers = +li.getAttribute("data-i");
        if (vers === de || items[vers].vers) return dessiner();
        items.splice(vers, 0, items.splice(de, 1)[0]);
        dessiner();
      });
      liste.addEventListener("dragend", () => { if (tire !== null) { tire = null; dessiner(); } });

      const caseEn = $("#bl-en", m);
      if (caseEn) caseEn.onchange = () => { aussiEn = caseEn.checked; };

      $('[data-bl="annuler"]', m).onclick = () => fermerModale();
      $('[data-bl="publier"]', m).onclick = async () => {
        if (envoi) return;
        if (JSON.stringify(items) === depart) { fermerModale(); return toast("Rien n'a changé dans l'organisation."); }
        envoi = true;
        $(".bl-envoi", m).hidden = false;
        $('[data-bl="publier"]', m).disabled = true; $('[data-bl="annuler"]', m).disabled = true;
        try {
          const rep = await api("/api/site/?action=blocs", { method: "POST", body: {
            chemin: s.chemin,
            ordre: items.map((x) => x.id),
            masques: items.filter((x) => x.masque && !x.vers).map((x) => x.id),
            sorties: items.filter((x) => x.vers).map((x) => ({ id: x.id, vers: x.vers, position: x.position })),
            aussiEn,
          } });
          fermerModale();
          const note = rep.anglais && !rep.anglais.fait && rep.anglais.raison ? " " + rep.anglais.raison : "";
          toast(rep.rien ? "L'organisation était déjà comme ça." : `Organisation publiée sur ${rep.pages} page${rep.pages > 1 ? "s" : ""}. Ton site sera à jour dans environ une minute.${note}`);
          if (!rep.rien) { s.doc = null; page(); }
        } catch (e) {
          toast(e.code === "REFUS" ? e.message : "Organisation pas publiée : " + e.message, true);
          envoi = false; $(".bl-envoi", m).hidden = true;
          $('[data-bl="publier"]', m).disabled = false; $('[data-bl="annuler"]', m).disabled = false;
        }
      };

      dessiner();
    });
  }

  function reglagesGoogle() {
    const doc = s.doc;
    const titre = doc.querySelector("title"), desc = doc.querySelector('meta[name="description"]');
    ouvrirModale("Titre et description Google", `
      <p class="aide">C'est ce qui s'affiche dans les résultats de Google et quand on partage la page.</p>
      <label class="champ large"><span>Titre</span><input name="titre" value="${E(titre?.textContent || "")}"></label>
      <label class="champ large"><span>Description <small id="st-nb"></small></span><textarea name="desc" rows="3">${E(desc?.getAttribute("content") || "")}</textarea></label>`,
    `<span></span><div class="actions"><button class="btn" data-m="annuler">Annuler</button><button class="btn laiton" data-m="ok">OK</button></div>`,
    (m) => {
      const ta = $("textarea", m), nb = $("#st-nb", m);
      const compter = () => { const n = ta.value.length; nb.textContent = `(${n} caractères${n > 160 ? ", un peu long : Google coupe vers 160" : ""})`; };
      ta.oninput = compter; compter();
      $('[data-m="annuler"]', m).onclick = fermerModale;
      $('[data-m="ok"]', m).onclick = () => {
        const t = $("input", m).value.replace(/\s+/g, " ").trim(), de = ta.value.replace(/\s+/g, " ").trim();
        const ancienT = titre?.textContent || "", ancienD = desc?.getAttribute("content") || "";
        if (t && t !== ancienT) {
          titre.textContent = t;
          doc.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]').forEach((x) => { if (x.getAttribute("content") === ancienT) x.setAttribute("content", t); });
          s.nb++;
        }
        if (de && de !== ancienD) {
          desc.setAttribute("content", de);
          doc.querySelectorAll('meta[property="og:description"], meta[name="twitter:description"]').forEach((x) => { if (x.getAttribute("content") === ancienD) x.setAttribute("content", de); });
          s.nb++;
        }
        fermerModale(); majBarre();
      };
    });
  }

  // ---------- Publication ----------
  function finaliser() {
    // Légendes et boutons « Agrandir » des photos touchées
    const anglais = s.chemin.startsWith("en/");
    (s.figs || new Set()).forEach((fig) => {
      if (!fig.isConnected) return;
      const cap = fig.querySelector("figcaption"), btn = fig.querySelector("button.ouvrir"), img = fig.querySelector("img");
      const legende = cap ? cap.textContent.replace(/\s+/g, " ").trim() : "";
      if (cap && !legende) cap.remove();
      if (btn) {
        const texte = legende || img?.getAttribute("alt") || titrePage();
        btn.setAttribute("data-legende", legende || texte);
        btn.setAttribute("aria-label", (anglais ? "Enlarge: " : "Agrandir : ") + texte);
      }
    });
    // Nombre de photos affiché au-dessus des galeries
    (s.grilles || new Set()).forEach((g) => {
      const compte = g.closest(".galerie")?.querySelector(".compte");
      if (compte) { const n = g.querySelectorAll("figure").length; compte.textContent = compte.textContent.replace(/\d+/, n).replace(/\bimages?\b/, n > 1 ? "images" : "image"); }
    });
    // Une galerie créée puis laissée vide ne part pas sur le site
    s.doc.querySelectorAll("section.galerie").forEach((sec) => {
      if (!sec.querySelector(".grille figure")) sec.remove();
    });
    return s.doctype + "\n" + s.doc.documentElement.outerHTML + "\n";
  }

  async function publier() {
    if (!nbModifs() || s.envoi) return;
    s.envoi = true; majBarre();
    try {
      const contenu = finaliser();
      const r = await api("/api/site/?action=publier", { method: "POST", body: {
        fichiers: [{ chemin: s.chemin, contenu, sha: s.sha }],
        photos: s.photos,
        message: `Mon site : ${nomPage(s.chemin)} (${s.chemin})`,
      } });
      s.sha = r.shas?.[s.chemin] || s.sha;
      s.orig = new Map(); s.modifs = new Set(); s.nb = 0; s.photos = []; s.figs = new Set(); s.grilles = new Set();
      blocsTexte(s.doc).forEach((el) => s.orig.set(el, el.innerHTML));
      s.publieLe = Date.now(); s.enLigne = false;
      const anglaise = !s.chemin.startsWith("en/") && cheminJumeau();
      toast(anglaise ? "Publié. Pense à faire la même correction sur la version anglaise (bouton « Version anglaise »)." : "Publié. Ta page sera à jour dans environ une minute.");
      verifierEnLigne(s.chemin, s.sha);
    } catch (e) {
      toast(e.code === "REFUS" ? e.message : "Pas publié : " + e.message, true);
    }
    s.envoi = false; majBarre();
  }

  // La page en ligne est-elle la version publiée ? (même empreinte que le fichier envoyé)
  async function empreinte(buf) {
    const tete = new TextEncoder().encode(`blob ${buf.byteLength}\0`);
    const tout = new Uint8Array(tete.length + buf.byteLength); tout.set(tete); tout.set(new Uint8Array(buf), tete.length);
    const h = await crypto.subtle.digest("SHA-1", tout);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function verifierEnLigne(chemin, sha) {
    const jeton = (s.verif = {});
    for (let i = 0; i < 40; i++) {
      await new Promise((ok) => setTimeout(ok, 6000));
      if (s.verif !== jeton) return;
      try {
        const r = await fetch(urlPage(chemin) + "?apercu=" + Date.now(), { cache: "no-store" });
        if (r.ok && (await empreinte(await r.arrayBuffer())) === sha) {
          if (s.chemin === chemin && !nbModifs()) { s.enLigne = true; majBarre(); }
          toast(`C'est en ligne : « ${nomPage(chemin)} » est à jour sur ton site.`);
          return;
        }
      } catch { /* réessai */ }
    }
  }

  async function annuler() {
    if (!nbModifs() || !confirm("Annuler tous tes changements sur cette page ?")) return;
    try { await charger(s.chemin, true); dessiner(); } catch (e) { toast(e.message, true); }
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-st]"); if (!t || etat.page !== "site") return;
    e.preventDefault();
    const a = t.getAttribute("data-st");
    if (a === "publier") publier();
    if (a === "annuler") annuler();
    if (a === "google") reglagesGoogle();
    if (a === "menu") ordreMenu();
    if (a === "photos") ajouterPhotosPage();
    if (a === "deplacer") deplacerPhotos();
    if (a === "blocs") organiserBlocs();
    if (a === "compris") { try { localStorage.setItem("sb-site-guide", "vu"); } catch { /* sans mémoire */ } t.closest(".st-guide")?.remove(); }
    if (a === "zones") {
      s.zones = !s.zones;
      t.setAttribute("aria-pressed", s.zones ? "true" : "false"); t.textContent = s.zones ? "Cacher les zones modifiables" : "Montrer ce qui se modifie";
      apercuDoc()?.documentElement.classList.toggle("cms-zones", s.zones);
    }
    if (a === "jumelle") { const c = cheminJumeau(); if (c) { $("#st-page").value = c; changerPage(c); } }
  });

  return { page, sale };
}

const STYLE_APERCU = `
html { scroll-behavior: auto !important; }
.hero .reveal, .anim .rv, .rv, .reveal { opacity: 1 !important; transform: none !important; animation: none !important; }
[data-cms-t="t"] { outline: 1px dashed transparent; outline-offset: 4px; cursor: text; transition: outline-color .15s; border-radius: 2px; }
[data-cms-t="t"]:hover { outline-color: rgba(200,162,107,.95); }
[data-cms-t="t"]:focus { outline: 2px solid #c8a26b; outline-offset: 4px; }
figcaption[data-cms-t="t"]:empty::before { content: "Écris une légende (facultatif)"; opacity: .55; font-style: italic; }
[data-cms-t="i"] { cursor: pointer; }
[data-cms-t="i"]:hover { outline: 3px solid #c8a26b; outline-offset: -3px; filter: brightness(1.05); }
.cms-zones [data-cms-t="t"] { outline-color: rgba(200,162,107,.5); }
.cms-zones [data-cms-t="i"] { outline: 2px dashed rgba(200,162,107,.75); outline-offset: -2px; }
.hero.lit img.hero-img { animation: none !important; }
a, button { cursor: default; }
.cms-ajout { display: block; width: 100%; margin: 18px 0 0; padding: 16px; border: 2px dashed rgba(200,162,107,.8); border-radius: 6px; background: rgba(200,162,107,.08); color: #c8a26b; font: 600 1rem/1.2 system-ui, sans-serif; cursor: pointer; }
.cms-ajout:hover { background: rgba(200,162,107,.18); }
.cms-ajout:disabled { opacity: .7; cursor: progress; }
`;
