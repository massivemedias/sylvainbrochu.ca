// Stockage : Redis Upstash par son API REST (branché depuis l'onglet Storage de Vercel).
// En local (SB_LOCAL=1) sans Redis, un stockage en mémoire sert aux tests.

const URL_KV = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const JETON = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const kvPret = () => Boolean(URL_KV && JETON) || process.env.SB_LOCAL === "1";

// ---------- Mémoire (tests locaux seulement) ----------
const mem = globalThis.__sbMem || (globalThis.__sbMem = new Map());
function memCmd(args) {
  const [c, k, ...r] = args.map((a, i) => (i === 0 ? String(a).toUpperCase() : a));
  const get = () => mem.get(k);
  switch (c) {
    case "GET": return get() ?? null;
    case "SET": if (r.map((x) => String(x).toUpperCase()).includes("NX") && mem.has(k)) return null; mem.set(k, String(r[0])); return "OK";
    case "DEL": return mem.delete(k) ? 1 : 0;
    case "INCR": case "INCRBY": { const v = Number(get() || 0) + Number(r[0] || 1); mem.set(k, String(v)); return v; }
    case "EXPIRE": return 1;
    case "HINCRBY": { const h = get() || {}; h[r[0]] = (h[r[0]] || 0) + Number(r[1]); mem.set(k, h); return h[r[0]]; }
    case "HGETALL": { const h = get() || {}; return Object.entries(h).flat().map(String); }
    case "PFADD": { const s = get() || new Set(); r.forEach((x) => s.add(x)); mem.set(k, s); return 1; }
    case "PFCOUNT": { const u = new Set(); [k, ...r].forEach((x) => (mem.get(x) || new Set()).forEach((v) => u.add(v))); return u.size; }
    case "ZADD": { const z = get() || new Map(); z.set(r[1], Number(r[0])); mem.set(k, z); return 1; }
    case "ZREMRANGEBYSCORE": { const z = get() || new Map(); for (const [m, s] of z) if (s >= Number(r[0]) && s <= Number(r[1])) z.delete(m); return 1; }
    case "ZRANGEBYSCORE": { const z = get() || new Map(); return [...z].filter(([, s]) => s >= Number(r[0]) && s <= (r[1] === "+inf" ? Infinity : Number(r[1]))).sort((a, b) => a[1] - b[1]).map(([m]) => m); }
    case "LPUSH": { const l = get() || []; l.unshift(...r.map(String)); mem.set(k, l); return l.length; }
    case "LTRIM": { const l = get() || []; mem.set(k, l.slice(Number(r[0]), Number(r[1]) + 1)); return "OK"; }
    case "LRANGE": { const l = get() || []; return l.slice(Number(r[0]), Number(r[1]) === -1 ? undefined : Number(r[1]) + 1); }
    case "MGET": return [k, ...r].map((x) => mem.get(x) ?? null);
    default: throw new Error("Commande non simulée : " + c);
  }
}

export async function cmd(...args) {
  if (!URL_KV || !JETON) {
    if (process.env.SB_LOCAL === "1") return memCmd(args);
    throw new Error("STOCKAGE_ABSENT");
  }
  const r = await fetch(URL_KV, { method: "POST", headers: { Authorization: `Bearer ${JETON}` }, body: JSON.stringify(args) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

export async function pipe(cmds) {
  if (!cmds.length) return [];
  if (!URL_KV || !JETON) {
    if (process.env.SB_LOCAL === "1") return cmds.map(memCmd);
    throw new Error("STOCKAGE_ABSENT");
  }
  const r = await fetch(URL_KV.replace(/\/$/, "") + "/pipeline", { method: "POST", headers: { Authorization: `Bearer ${JETON}` }, body: JSON.stringify(cmds) });
  const j = await r.json();
  return j.map((x) => (x.error ? null : x.result));
}

export async function lireJSON(cle, defaut) {
  const v = await cmd("GET", cle);
  if (v == null) return defaut;
  try { return JSON.parse(v); } catch { return defaut; }
}
export const ecrireJSON = (cle, valeur) => cmd("SET", cle, JSON.stringify(valeur));
