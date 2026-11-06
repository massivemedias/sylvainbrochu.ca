// Le menu du site : une seule structure, appliquée aux ~77 pages (FR et EN) d'un coup.
// Les pages restent du HTML statique : on réécrit le bloc <ul id="menu"> et la liste « Pages » du pied.
// Ce qui est propre à chaque page est conservé tel quel : le lien de langue (EN / FR) et aria-current="page".

const RE_NAV = /(<ul id="menu">)([\s\S]*?)(<\/ul>)/;
const RE_PIED = /(<h2>Pages<\/h2>\s*<ul>)([\s\S]*?)(<\/ul>)/;
const RE_LI = /<li\b([^>]*)>\s*<a\b([^>]*)>([\s\S]*?)<\/a>\s*<\/li>/g;

const attr = (s, n) => { const m = new RegExp(`(?:^|\\s)${n}="([^"]*)"`).exec(s || ""); return m ? m[1] : ""; };
const ech = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const texte = (s) => String(s).replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
export const estAnglais = (chemin) => chemin === "en/index.html" || chemin.startsWith("en/");

// ---------- Lecture ----------
// Renvoie les <li> du menu d'une page : [{ classe, href, libelle, courant, brut }]
function lireLis(html) {
  const bloc = RE_NAV.exec(html);
  if (!bloc) return null;
  const out = [];
  for (const m of bloc[2].matchAll(RE_LI)) {
    out.push({
      classe: attr(m[1], "class"),
      href: attr(m[2], "href"),
      libelle: texte(m[3]),
      courant: /aria-current="page"/.test(m[2]),
      brut: m[0],
    });
  }
  return out;
}
const estLangue = (li) => /\blangue\b/.test(li.classe);

// Construit la structure du menu à partir des deux pages d'accueil.
// Les deux menus sont appariés dans l'ordre : FR et EN ont toujours les mêmes entrées.
export function entreesDepuisHtml(htmlFr, htmlEn) {
  const fr = (lireLis(htmlFr) || []).filter((l) => !estLangue(l));
  const en = (lireLis(htmlEn) || []).filter((l) => !estLangue(l));
  return fr.map((l, i) => ({
    classe: l.classe || "",
    cache: false,
    fr: { href: l.href, libelle: l.libelle },
    en: { href: (en[i] || l).href, libelle: (en[i] || l).libelle },
  }));
}

// Tous les href connus du menu (sert à refuser une adresse inventée).
export const hrefsConnus = (entrees) => new Set(entrees.flatMap((e) => [e.fr.href, e.en.href]));

// Fusionne une structure enregistrée avec ce que les pages contiennent vraiment :
// une page ajoutée au menu dans le code apparaît ici, une entrée disparue s'en va.
export function fusionner(enregistre, duSite) {
  if (!Array.isArray(enregistre) || !enregistre.length) return duSite;
  const parHref = new Map(duSite.map((e) => [e.fr.href, e]));
  const gardees = [];
  for (const e of enregistre) {
    const vrai = parHref.get(e?.fr?.href);
    if (!vrai) continue;
    gardees.push({ classe: vrai.classe, cache: !!e.cache, fr: { href: vrai.fr.href, libelle: e.fr?.libelle || vrai.fr.libelle }, en: { href: vrai.en.href, libelle: e.en?.libelle || vrai.en.libelle } });
    parHref.delete(e.fr.href);
  }
  return [...gardees, ...parHref.values()];
}

// ---------- Écriture ----------
export function reecrirePage(html, chemin, entrees) {
  const anglais = estAnglais(chemin);
  const lis = lireLis(html);
  if (!lis) return html;

  const courants = new Set(lis.filter((l) => l.courant).map((l) => l.href));
  const langue = lis.filter(estLangue).map((l) => l.brut);
  const visibles = entrees.filter((e) => !e.cache);

  const nav = visibles.map((e) => {
    const c = anglais ? e.en : e.fr;
    const cl = e.classe ? ` class="${ech(e.classe)}"` : "";
    const ac = courants.has(c.href) ? ' aria-current="page"' : "";
    return `<li${cl}><a href="${ech(c.href)}"${ac}>${ech(c.libelle)}</a></li>`;
  }).join("") + langue.join("");

  let sortie = html.replace(RE_NAV, (_, a, __, b) => `${a}\n    ${nav}\n  ${b}`);

  // Pied de page : la liste « Pages » suit le même ordre ; ce qui n'est pas une entrée du menu
  // (le lien de téléchargement du CV) reste à la fin.
  const tous = new Set(entrees.flatMap((e) => [e.fr.href, e.en.href]));
  sortie = sortie.replace(RE_PIED, (bloc, a, dedans, b) => {
    const anciens = [...dedans.matchAll(RE_LI)].map((m) => ({ href: attr(m[2], "href"), brut: m[0] }));
    if (!anciens.length) return bloc;
    const connus = anciens.filter((l) => tous.has(l.href));
    if (!connus.length) return bloc;
    const lignes = [
      ...visibles.map((e) => { const c = anglais ? e.en : e.fr; return `<li><a href="${ech(c.href)}">${ech(c.libelle)}</a></li>`; }),
      ...anciens.filter((l) => !tous.has(l.href)).map((l) => l.brut),
    ];
    return `${a}\n          ${lignes.join("\n          ")}\n        ${b}`;
  });
  return sortie;
}

// Validation du menu reçu de l'admin.
export function verifier(entrees, reference) {
  if (!Array.isArray(entrees) || entrees.length !== reference.length) throw new Error("Le menu reçu ne correspond pas au site. Recharge la page, puis refais ton changement.");
  const attendus = new Set(reference.map((e) => e.fr.href));
  const vus = new Set();
  for (const e of entrees) {
    const h = e?.fr?.href;
    if (!attendus.has(h) || vus.has(h)) throw new Error("Entrée de menu inconnue ou en double.");
    vus.add(h);
    for (const l of [e.fr?.libelle, e.en?.libelle]) {
      if (typeof l !== "string" || !l.trim() || l.length > 40 || /[<>]/.test(l)) throw new Error("Un nom d'onglet est vide, trop long ou contient un caractère interdit.");
    }
  }
  if (entrees.every((e) => e.cache)) throw new Error("Il faut garder au moins un onglet visible dans le menu.");
  const parHref = new Map(reference.map((e) => [e.fr.href, e]));
  return entrees.map((e) => {
    const r = parHref.get(e.fr.href);
    return { classe: r.classe, cache: !!e.cache, fr: { href: r.fr.href, libelle: e.fr.libelle.trim() }, en: { href: r.en.href, libelle: e.en.libelle.trim() } };
  });
}
