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
    <div class="st-barre carte">
      <label class="st-choix"><span>Page</span><select id="st-page">${options}</select></label>
      <div class="st-liens">
        <a class="btn petit" href="${E(urlPage(s.chemin))}" target="_blank" rel="noopener">Voir en ligne</a>
        ${jumelle ? `<button class="btn petit" data-st="jumelle">${s.chemin.startsWith("en/") ? "Version française" : "Version anglaise"}</button>` : ""}
        <button class="btn petit" data-st="google">Titre et description Google</button>
      </div>
      <div class="st-etat"><span id="st-compte"></span>
        <button class="btn petit" data-st="annuler" id="st-annuler">Annuler mes changements</button>
        <button class="btn laiton" data-st="publier" id="st-publier">Publier</button>
      </div>
    </div>
    <div class="st-cadre"><iframe id="st-apercu" title="Ta page, modifiable"></iframe></div>
    <p class="aide st-aide">Entrée dans une liste ou un paragraphe : ajoute une ligne. Une ligne vidée puis Retour arrière : la supprime. Une photo d'une galerie : clique-la pour la remplacer ou la supprimer.${s.chemin.startsWith("en/") ? "" : " Pense aussi à la version anglaise de la page."}</p>`;
    $("#st-page").onchange = (e) => changerPage(e.target.value);
    construireApercu();
    majBarre();
  }

  function majBarre() {
    const n = nbModifs(), c = $("#st-compte"), p = $("#st-publier"), a = $("#st-annuler");
    if (!c) return;
    c.textContent = s.envoi ? "Publication..." : n ? `${n} changement${n > 1 ? "s" : ""} pas encore publié${n > 1 ? "s" : ""}` : (s.publieLe ? "Publié. Ton site sera à jour dans environ une minute." : "Aucun changement");
    c.className = n ? "st-attente" : s.publieLe ? "st-ok" : "";
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
    s.orig = new Map(); s.modifs = new Set(); s.nb = 0; s.photos = []; s.figs = new Set(); s.grilles = new Set(); s.locales = new Map(); s.defil = 0; s.publieLe = null;
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
    f.onload = () => brancher(f);
    f.srcdoc = s.doctype + copie.outerHTML;
  }

  function brancher(f) {
    const d = f.contentDocument; if (!d) return;
    $(".st-cadre")?.classList.remove("charge");
    d.querySelectorAll('[data-cms-t="t"]').forEach((el) => { el.contentEditable = "true"; el.spellcheck = true; });
    d.querySelectorAll('[data-cms-t="g"]').forEach((g) => ajouterBoutonGalerie(d, g));
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
    return c.innerHTML.replace(/(?:<br>\s*)+$/, "").replace(/&nbsp;(?=\s|$)|(?<=\s)&nbsp;/g, " ").replace(/^\s+|\s+$/g, (m) => (m.includes("\n") ? m : ""));
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
    let d = c.toDataURL("image/webp", 0.82), ext = "webp";
    if (!d.startsWith("data:image/webp")) { d = c.toDataURL("image/jpeg", 0.86); ext = "jpg"; }
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
      const sup = $('[data-m="supprimer"]', m);
      if (sup) sup.onclick = () => {
        if (!confirm("Supprimer cette photo de la galerie ?")) return;
        const vueFig = vue?.closest("figure"); const grille = fig.parentElement;
        fig.remove(); vueFig && vueFig.remove(); s.nb++; s.grilles = (s.grilles || new Set()).add(grille);
        fermerModale(); majBarre();
      };
    });
  }

  function choisirPhotos(gid) {
    const i = document.createElement("input"); i.type = "file"; i.accept = "image/*,.heic,.heif"; i.multiple = true; i.hidden = true;
    i.onchange = () => { ajouterPhotos(gid, [...i.files]); i.remove(); };
    document.body.append(i); i.click();
  }
  async function ajouterPhotos(gid, fichiers) {
    const grille = s.ids.get(gid), d = apercuDoc(), vueGrille = enApercu(gid);
    if (!grille || !fichiers.length || !vueGrille) return;
    const bouton = d.querySelector(`[data-cms-ajout="${gid}"]`);
    const modele = grille.querySelector("figure");
    const anglais = s.chemin.startsWith("en/");
    for (const [k, fichier] of fichiers.entries()) {
      bouton.textContent = `Préparation de la photo ${k + 1} sur ${fichiers.length}...`; bouton.disabled = true;
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
        grille.append(fig); s.figs.add(fig); s.grilles = (s.grilles || new Set()).add(grille); s.nb++;
        // Même figure dans l'aperçu, avec la photo locale
        const vueFig = d.importNode(fig, true);
        const vImg = vueFig.querySelector("img"); vImg.removeAttribute("srcset"); vImg.src = v[v.length - 1].url;
        const idImg = String(s.prochainId++); vImg.setAttribute("data-cms", idImg); vImg.setAttribute("data-cms-t", "i"); s.ids.set(idImg, img);
        const vCap = vueFig.querySelector("figcaption");
        if (vCap && cap) { const idCap = String(s.prochainId++); vCap.setAttribute("data-cms", idCap); vCap.setAttribute("data-cms-t", "t"); vCap.contentEditable = "true"; s.ids.set(idCap, cap); }
        vueGrille.append(vueFig);
        majBarre();
      } catch (err) { toast(err.message, true); }
    }
    bouton.textContent = "+ Ajouter des photos à cette galerie"; bouton.disabled = false;
    toast("Photos ajoutées. Écris une légende sous chacune si tu veux, puis clique « Publier ».");
  }

  // ---------- Titre et description Google ----------
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
      s.publieLe = Date.now();
      toast("Publié. Ton site sera à jour dans environ une minute.");
    } catch (e) {
      toast(e.code === "REFUS" ? e.message : "Pas publié : " + e.message, true);
    }
    s.envoi = false; majBarre();
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
a, button { cursor: default; }
.cms-ajout { display: block; width: 100%; margin: 18px 0 0; padding: 16px; border: 2px dashed rgba(200,162,107,.8); border-radius: 6px; background: rgba(200,162,107,.08); color: #c8a26b; font: 600 1rem/1.2 system-ui, sans-serif; cursor: pointer; }
.cms-ajout:hover { background: rgba(200,162,107,.18); }
.cms-ajout:disabled { opacity: .7; cursor: progress; }
`;
