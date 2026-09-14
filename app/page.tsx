"use client";

import { useEffect, useMemo, useState } from "react";

type Offer = {
  shop_sku: string | null;
  product_sku: string | null;
  product_title: string | null;
  price: number | null;
  quantity: number | null;
  state_code: string | null;
};

type WooProduct = {
  id: number | null;
  parent_id?: number | null;
  is_variation?: boolean;
  name: string | null;
  parent_name?: string | null;
  variation?: string | null;
  sku: string | null;
  price: number | null;
  regular_price: number | null;
  sale_price: number | null;
  currency: string | null;
  categories: string[];
};

type OffersResponse = { offers?: Offer[]; error?: string };
type ShopResponse = { products?: WooProduct[]; error?: string };

type AuditInfo = {
  weightKg: number | null;
  commissionHtRate: number | null;
  vatRate: number;
  family: string | null;
  group: "ravioli" | "pasta" | "gnocchi" | null;
};

type AuditRow = {
  offer: Offer;
  info: AuditInfo;
  shopProduct: WooProduct | null;
  boutiquePackTtc: number | null;
  boutiqueTtcPerKg: number | null;
  currentPdbTtc: number | null;
  netPdbHtPack: number | null;
  netPdbHtPerKg: number | null;
  exactTargetTtc: number | null;
  targetTtc: number | null;
  differenceTtc: number | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isProName(value: string | null | undefined) {
  return /(^|\s)pro(\s|$)/i.test(normalize(value));
}

function weightFromTitle(value: string | null | undefined) {
  const t = normalize(value);
  if (/\b1\s*kg\b/.test(t) || /\b1000\s*g\b/.test(t)) return 1;
  if (t.includes("750")) return 0.75;
  if (t.includes("500")) return 0.5;
  if (t.includes("400")) return 0.4;
  return null;
}

function familyFromTitle(value: string | null | undefined) {
  const t = normalize(value);
  if (t.includes("citron")) return "citron";
  if (t.includes("ricotta") && (t.includes("epinard") || t.includes("spinaci"))) return "ricotta-epinards";
  if (t.includes("roero") || t.includes("noisette") || t.includes("tome") || t.includes("toma")) return "roero";
  if (t.includes("tradition") || t.includes("agnolotti")) return "traditionnels";
  if (t.includes("tagliatelle")) return "tagliatelle";
  if (t.includes("pappardelle")) return "pappardelle";
  if (t.includes("tagliolini") || t.includes("tajarin")) return "tagliolini";
  if (t.includes("gnocchi")) return "gnocchi";
  return null;
}

function groupFromFamily(family: string | null): AuditInfo["group"] {
  if (["ricotta-epinards", "roero", "traditionnels"].includes(family ?? "")) return "ravioli";
  if (["tagliatelle", "pappardelle", "tagliolini"].includes(family ?? "")) return "pasta";
  if (family === "gnocchi") return "gnocchi";
  return null;
}

function auditInfo(offer: Offer): AuditInfo {
  const title = normalize(offer.product_title);
  const family = familyFromTitle(offer.product_title);
  const weightKg = weightFromTitle(offer.product_title);
  let commissionHtRate: number | null = null;

  if (family === "ricotta-epinards" && title.includes("500")) commissionHtRate = 4.13 / 13.27;
  else if (family === "ricotta-epinards" && title.includes("750")) commissionHtRate = 5.99 / 19.81;
  else if (family === "roero" && title.includes("500")) commissionHtRate = 4.37 / 14.12;
  else if (family === "roero" && title.includes("750")) commissionHtRate = 6.56 / 21.8;
  else if (family === "traditionnels" && title.includes("500")) commissionHtRate = 4.91 / 16.02;
  else if (family === "traditionnels" && title.includes("750")) commissionHtRate = 7.07 / 23.6;
  else if (["tagliatelle", "pappardelle", "tagliolini"].includes(family ?? "") && title.includes("400")) commissionHtRate = 1.94 / 5.59;
  else if (family === "gnocchi" && title.includes("500")) commissionHtRate = 2.75 / 8.44;

  return { weightKg, commissionHtRate, vatRate: 0.055, family, group: groupFromFamily(family) };
}

function roundUpEuro(value: number | null) {
  return value == null || !Number.isFinite(value) ? null : Math.ceil(value);
}

function money(value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)} €`;
}

function signedMoney(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} €`;
}

function percent(value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(1)} %`;
}

function wooText(product: WooProduct) {
  return normalize(`${product.name ?? ""} ${product.parent_name ?? ""} ${product.variation ?? ""} ${(product.categories ?? []).join(" ")}`);
}

function isFreshWooProduct(product: WooProduct) {
  const t = wooText(product);
  if (t.includes("deshydrat") || t.includes("sechee") || t.includes("seche") || t.includes("epicerie")) return false;
  return t.includes("fraiche") || t.includes("frais") || t.includes("ravioli") || t.includes("gnocchi") || t.includes("retrait");
}

function matchShopProduct(offer: Offer, products: WooProduct[]) {
  const family = familyFromTitle(offer.product_title);
  const weight = weightFromTitle(offer.product_title);
  if (!family || family === "citron" || !weight || isProName(offer.product_title)) return null;

  let candidates = products.filter((product) => {
    if (isProName(product.name) || product.price == null) return false;
    return familyFromTitle(wooText(product)) === family;
  });

  const fresh = candidates.filter(isFreshWooProduct);
  if (fresh.length) candidates = fresh;

  const exactWeight = candidates.filter((product) => weightFromTitle(wooText(product)) === weight);
  if (exactWeight.length === 1) return exactWeight[0];

  const exactVariations = exactWeight.filter((product) => product.is_variation === true);
  if (exactVariations.length === 1) return exactVariations[0];

  return null;
}

const familyOrder = ["ricotta-epinards", "roero", "traditionnels", "tagliatelle", "pappardelle", "tagliolini", "gnocchi"];
const groupLabel: Record<NonNullable<AuditInfo["group"]>, string> = {
  ravioli: "Ravioli",
  pasta: "Pasta fresca",
  gnocchi: "Gnocchi",
};

export default function Home() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [shopProducts, setShopProducts] = useState<WooProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingSku, setUpdatingSku] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [offersResponse, shopResponse] = await Promise.all([
        fetch("/api/pourdebon/offers?max=100&offset=0", { cache: "no-store" }),
        fetch("/api/shop/products", { cache: "no-store" }),
      ]);
      const offersData = (await offersResponse.json()) as OffersResponse;
      const shopData = (await shopResponse.json()) as ShopResponse;
      if (!offersResponse.ok) throw new Error(offersData.error || "Impossible de charger les offres Pourdebon");
      if (!shopResponse.ok) throw new Error(shopData.error || "Impossible de charger les prix boutique");
      setOffers(Array.isArray(offersData.offers) ? offersData.offers : []);
      setShopProducts(Array.isArray(shopData.products) ? shopData.products : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const rows = useMemo<AuditRow[]>(() => offers.map((offer) => {
    if (isProName(offer.product_title)) return null;
    const info = auditInfo(offer);
    if (!info.group || info.family === "citron" || !info.weightKg) return null;

    const shopProduct = matchShopProduct(offer, shopProducts);
    const shopWeight = shopProduct ? weightFromTitle(wooText(shopProduct)) : null;
    const boutiquePackTtc = shopProduct?.price ?? null;
    const boutiqueTtcPerKg = boutiquePackTtc != null && shopWeight ? boutiquePackTtc / shopWeight : null;
    const currentPdbTtc = offer.price == null ? null : Number(offer.price);
    const saleHt = currentPdbTtc != null ? currentPdbTtc / (1 + info.vatRate) : null;
    const netPdbHtPack = saleHt != null && info.commissionHtRate != null ? saleHt * (1 - info.commissionHtRate) : null;
    const netPdbHtPerKg = netPdbHtPack != null ? netPdbHtPack / info.weightKg : null;
    const boutiqueHtPerKg = boutiqueTtcPerKg != null ? boutiqueTtcPerKg / (1 + info.vatRate) : null;
    const exactTargetTtc = boutiqueHtPerKg != null && info.commissionHtRate != null
      ? (boutiqueHtPerKg * info.weightKg / (1 - info.commissionHtRate)) * (1 + info.vatRate)
      : null;
    const targetTtc = roundUpEuro(exactTargetTtc);
    const differenceTtc = targetTtc != null && currentPdbTtc != null ? targetTtc - currentPdbTtc : null;

    return {
      offer,
      info,
      shopProduct,
      boutiquePackTtc,
      boutiqueTtcPerKg,
      currentPdbTtc,
      netPdbHtPack,
      netPdbHtPerKg,
      exactTargetTtc,
      targetTtc,
      differenceTtc,
    };
  }).filter((row): row is AuditRow => row !== null).sort((a, b) => {
    const fa = familyOrder.indexOf(a.info.family ?? "");
    const fb = familyOrder.indexOf(b.info.family ?? "");
    if (fa !== fb) return fa - fb;
    return (a.info.weightKg ?? 0) - (b.info.weightKg ?? 0);
  }), [offers, shopProducts]);

  async function applyOne(row: AuditRow) {
    const sku = row.offer.shop_sku;
    if (!sku || row.targetTtc == null) return;
    setUpdatingSku(sku);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/pourdebon/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [{ sku, price: row.targetTtc }], explicitSelection: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "La mise à jour a échoué");
      setMessage(`${row.offer.product_title ?? sku} : import envoyé à ${money(row.targetTtc)}.`);
      setTimeout(() => loadData(), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setUpdatingSku(null);
    }
  }

  const groups: Array<NonNullable<AuditInfo["group"]>> = ["ravioli", "pasta", "gnocchi"];

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Pasta Piemonte · Pourdebon</p>
          <h1 style={styles.title}>Audit des prix frais</h1>
          <p style={styles.subtitle}>Citron et références PRO exclus. Chaque valeur indique clairement si elle est TTC ou HT, par confezione ou par kg.</p>
        </div>
        <button onClick={loadData} disabled={loading || updatingSku !== null} style={styles.secondaryButton}>{loading ? "Actualisation…" : "Actualiser"}</button>
      </section>

      {message && <section style={styles.success}>{message}</section>}
      {error && <section style={styles.error}>{error}</section>}

      {groups.map((group) => {
        const groupRows = rows.filter((row) => row.info.group === group);
        if (!groupRows.length) return null;

        return <section key={group} style={styles.group}>
          <h2 style={styles.groupTitle}>{groupLabel[group]}</h2>
          <div style={styles.cards}>
            {groupRows.map((row, index) => {
              const sku = row.offer.shop_sku;
              const changed = row.differenceTtc != null && Math.abs(row.differenceTtc) > 0.001;
              const canApply = Boolean(sku && row.shopProduct && row.info.commissionHtRate != null && row.targetTtc != null && changed);
              const sourceLabel = row.shopProduct
                ? `${row.shopProduct.parent_name ?? row.shopProduct.name ?? "WooCommerce"}${row.shopProduct.variation ? ` · ${row.shopProduct.variation}` : ""}`
                : "Correspondance WooCommerce à résoudre";

              return <article key={`${sku ?? row.offer.product_sku ?? "offer"}-${index}`} style={styles.card}>
                <div style={styles.cardHeader}>
                  <div>
                    <div style={styles.productName}>{row.offer.product_title ?? "—"}</div>
                    <div style={styles.meta}>SKU Pourdebon: <strong>{sku ?? "—"}</strong> · Poids détecté: <strong>{row.info.weightKg ? `${row.info.weightKg * 1000} g` : "—"}</strong></div>
                    <div style={styles.source}>WooCommerce: {sourceLabel}</div>
                  </div>
                  <div>
                    {row.shopProduct == null ? <span style={styles.badgeNeutral}>À associer</span>
                      : row.info.commissionHtRate == null ? <span style={styles.badgeNeutral}>Commission à vérifier</span>
                      : !changed ? <span style={styles.badgeOk}>Déjà aligné</span>
                      : <button disabled={!canApply || updatingSku !== null} onClick={() => applyOne(row)} style={styles.button}>{updatingSku === sku ? "Mise à jour…" : "Appliquer le prix"}</button>}
                  </div>
                </div>

                <div style={styles.metrics}>
                  <Metric label="Boutique · confezione TTC" value={money(row.boutiquePackTtc)} />
                  <Metric label="Boutique · TTC/kg" value={money(row.boutiqueTtcPerKg)} />
                  <Metric label="Pourdebon actuel · TTC" value={money(row.currentPdbTtc)} />
                  <Metric label="Commission Pourdebon · HT" value={percent(row.info.commissionHtRate)} />
                  <Metric label="Net PDB · HT/confezione" value={money(row.netPdbHtPack)} />
                  <Metric label="Net PDB · HT/kg" value={money(row.netPdbHtPerKg)} />
                  <Metric label="Target matematico · TTC" value={money(row.exactTargetTtc)} />
                  <Metric label="Target arrotondato · TTC" value={money(row.targetTtc)} strong />
                  <Metric label="Differenza da applicare" value={signedMoney(row.differenceTtc)} strong />
                </div>
              </article>;
            })}
          </div>
        </section>;
      })}

      <section style={styles.note}><strong>Come leggere:</strong> “Boutique TTC/kg” serve solo per confrontare il prezzo al kg. “Net PDB HT/kg” è invece ciò che resta economicamente dopo IVA prodotto e commissione HT: non va confrontato direttamente con un valore TTC. Il prezzo da applicare è sempre il “Target arrotondato TTC”.</section>
    </main>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div style={styles.metric}>
    <span style={styles.metricLabel}>{label}</span>
    <strong style={{ ...styles.metricValue, ...(strong ? styles.metricStrong : {}) }}>{value}</strong>
  </div>;
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f6f3ee", color: "#26231f", fontFamily: "Arial, Helvetica, sans-serif", padding: "28px 18px 56px" },
  header: { maxWidth: 1120, margin: "0 auto 20px", display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-end", flexWrap: "wrap" },
  eyebrow: { margin: "0 0 7px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7a6654" },
  title: { margin: 0, fontSize: "clamp(28px, 4vw, 40px)", lineHeight: 1.05 },
  subtitle: { margin: "10px 0 0", maxWidth: 780, color: "#6e675f", lineHeight: 1.45, fontSize: 14 },
  secondaryButton: { border: "1px solid #cfc7bd", borderRadius: 9, background: "white", color: "#26231f", padding: "10px 15px", fontWeight: 700, cursor: "pointer" },
  group: { maxWidth: 1120, margin: "0 auto 24px" },
  groupTitle: { margin: "0 0 10px", fontSize: 22 },
  cards: { display: "grid", gap: 12 },
  card: { background: "white", border: "1px solid #e5dfd7", borderRadius: 14, padding: 16 },
  cardHeader: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap", paddingBottom: 12, borderBottom: "1px solid #eee8e1" },
  productName: { fontSize: 17, fontWeight: 800, lineHeight: 1.25 },
  meta: { marginTop: 5, fontSize: 12, color: "#6d655d" },
  source: { marginTop: 5, fontSize: 12, color: "#6d655d" },
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, paddingTop: 12 },
  metric: { background: "#faf8f5", border: "1px solid #eee8e1", borderRadius: 10, padding: "10px 11px", minHeight: 64, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 6 },
  metricLabel: { fontSize: 10, color: "#756d65", textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.25 },
  metricValue: { fontSize: 16, lineHeight: 1.1 },
  metricStrong: { fontSize: 18 },
  button: { border: 0, borderRadius: 8, background: "#26231f", color: "white", padding: "10px 13px", fontWeight: 700, fontSize: 12, cursor: "pointer" },
  badgeNeutral: { display: "inline-block", padding: "6px 9px", borderRadius: 999, background: "#f1eee9", fontSize: 11, fontWeight: 700, color: "#655e56" },
  badgeOk: { display: "inline-block", padding: "6px 9px", borderRadius: 999, background: "#e8f5ea", fontSize: 11, fontWeight: 700, color: "#276235" },
  success: { maxWidth: 1120, margin: "0 auto 14px", padding: 12, borderRadius: 9, background: "#e8f5ea", color: "#276235", border: "1px solid #bcdcc3" },
  error: { maxWidth: 1120, margin: "0 auto 14px", padding: 12, borderRadius: 9, background: "#fff2f0", color: "#a33a2b", border: "1px solid #f0c8c1" },
  note: { maxWidth: 1120, margin: "14px auto 0", padding: 14, borderRadius: 10, background: "#efeae3", color: "#5f574e", fontSize: 12, lineHeight: 1.55 },
};
