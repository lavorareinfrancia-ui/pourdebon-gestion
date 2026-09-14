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
  name: string | null;
  sku: string | null;
  price: number | null;
  regular_price: number | null;
  sale_price: number | null;
  currency: string | null;
  categories: string[];
};

type OffersResponse = { total_count?: number; offers?: Offer[]; error?: string };
type ShopResponse = { count?: number; products?: WooProduct[]; error?: string };

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
  boutiqueTtcPerKg: number | null;
  targetTtc: number | null;
  netHtPerKg: number | null;
  boutiqueHtPerKg: number | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
  if (t.includes("noisette") || t.includes("tome") || t.includes("toma") || t.includes("roero")) return "roero";
  if (t.includes("tradition") || t.includes("piemont")) return "traditionnels";
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

function percent(value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(1)} %`;
}

function matchShopProduct(offer: Offer, products: WooProduct[]) {
  const family = familyFromTitle(offer.product_title);
  const weight = weightFromTitle(offer.product_title);
  if (!family || family === "citron") return null;
  const candidates = products.filter((product) => familyFromTitle(product.name) === family && product.price != null);
  const exact = candidates.find((product) => weight != null && weightFromTitle(product.name) === weight);
  if (exact) return exact;
  return candidates.length === 1 ? candidates[0] : null;
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
    const info = auditInfo(offer);
    if (!info.group || info.family === "citron" || !info.weightKg) return null;
    const shopProduct = matchShopProduct(offer, shopProducts);
    const shopWeight = weightFromTitle(shopProduct?.name);
    const boutiqueTtcPerKg = shopProduct?.price != null && shopWeight ? shopProduct.price / shopWeight : null;
    const currentTtc = offer.price == null ? null : Number(offer.price);
    const saleHt = currentTtc != null ? currentTtc / (1 + info.vatRate) : null;
    const netHt = saleHt != null && info.commissionHtRate != null ? saleHt * (1 - info.commissionHtRate) : null;
    const netHtPerKg = netHt != null ? netHt / info.weightKg : null;
    const boutiqueHtPerKg = boutiqueTtcPerKg != null ? boutiqueTtcPerKg / (1 + info.vatRate) : null;
    const exactTargetTtc = boutiqueHtPerKg != null && info.commissionHtRate != null
      ? (boutiqueHtPerKg * info.weightKg / (1 - info.commissionHtRate)) * (1 + info.vatRate)
      : null;
    return { offer, info, shopProduct, boutiqueTtcPerKg, targetTtc: roundUpEuro(exactTargetTtc), netHtPerKg, boutiqueHtPerKg };
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
          <h1 style={styles.title}>Correction des prix frais</h1>
          <p style={styles.subtitle}>Le Citron est exclu. On avance dans l’ordre : ravioli, pasta fraîche, gnocchi. Une seule référence est modifiée à la fois.</p>
        </div>
        <button onClick={loadData} disabled={loading || updatingSku !== null} style={styles.secondaryButton}>{loading ? "Actualisation…" : "Actualiser"}</button>
      </section>

      {message && <section style={styles.success}>{message}</section>}
      {error && <section style={styles.error}>{error}</section>}

      {groups.map((group) => {
        const groupRows = rows.filter((row) => row.info.group === group);
        if (!groupRows.length) return null;
        return <section key={group} style={styles.panel}>
          <div style={styles.sectionTitle}>{groupLabel[group]}</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>Produit</th><th style={styles.th}>SKU</th><th style={styles.thRight}>Prix PDB</th><th style={styles.thRight}>Commission HT</th><th style={styles.th}>Référence boutique live</th><th style={styles.thRight}>Boutique €/kg</th><th style={styles.thRight}>Net PDB HT/kg</th><th style={styles.thRight}>Cible</th><th style={styles.th}>Action</th>
              </tr></thead>
              <tbody>{groupRows.map((row, index) => {
                const sku = row.offer.shop_sku;
                const current = row.offer.price == null ? null : Number(row.offer.price);
                const changed = current != null && row.targetTtc != null && Math.abs(current - row.targetTtc) > 0.001;
                const canApply = Boolean(sku && row.shopProduct && row.info.commissionHtRate != null && row.targetTtc != null && changed);
                return <tr key={`${sku ?? row.offer.product_sku ?? "offer"}-${index}`}>
                  <td style={styles.td}><strong>{row.offer.product_title ?? "—"}</strong></td>
                  <td style={styles.td}>{sku ?? "—"}</td>
                  <td style={styles.tdRight}>{money(current)}</td>
                  <td style={styles.tdRight}>{percent(row.info.commissionHtRate)}</td>
                  <td style={styles.td}>{row.shopProduct?.name ?? "Non presente su WooCommerce"}{row.shopProduct?.price != null ? ` · ${money(row.shopProduct.price)}` : ""}</td>
                  <td style={styles.tdRight}>{money(row.boutiqueTtcPerKg)}</td>
                  <td style={styles.tdRight}>{money(row.netHtPerKg)}</td>
                  <td style={{ ...styles.tdRight, fontWeight: 800 }}>{money(row.targetTtc)}</td>
                  <td style={styles.td}>
                    {row.shopProduct == null ? <span style={styles.badgeNeutral}>Ignoré</span> : row.info.commissionHtRate == null ? <span style={styles.badgeNeutral}>Commission à vérifier</span> : !changed ? <span style={styles.badgeOk}>Déjà aligné</span> : <button disabled={!canApply || updatingSku !== null} onClick={() => applyOne(row)} style={styles.button}>{updatingSku === sku ? "Mise à jour…" : "Appliquer"}</button>}
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </section>;
      })}

      <section style={styles.note}><strong>Regola:</strong> il prezzo boutique arriva dal catalogo WooCommerce live. Il target considera la commissione HT osservata, l’IVA sulla commissione recuperabile e viene arrotondato sempre all’euro superiore. I prodotti assenti da WooCommerce sono semplicemente ignorati.</section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f6f3ee", color: "#26231f", fontFamily: "Arial, Helvetica, sans-serif", padding: "28px 18px 56px", overflowX: "hidden" },
  header: { maxWidth: 1180, margin: "0 auto 20px", display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-end", flexWrap: "wrap" },
  eyebrow: { margin: "0 0 7px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7a6654" },
  title: { margin: 0, fontSize: "clamp(28px, 4vw, 40px)", lineHeight: 1.05 },
  subtitle: { margin: "10px 0 0", maxWidth: 820, color: "#6e675f", lineHeight: 1.45, fontSize: 14 },
  button: { border: 0, borderRadius: 8, background: "#26231f", color: "white", padding: "8px 11px", fontWeight: 700, fontSize: 12, cursor: "pointer" },
  secondaryButton: { border: "1px solid #cfc7bd", borderRadius: 9, background: "white", color: "#26231f", padding: "10px 15px", fontWeight: 700, cursor: "pointer" },
  panel: { maxWidth: 1180, margin: "0 auto 16px", background: "white", border: "1px solid #e5dfd7", borderRadius: 14, overflow: "hidden" },
  sectionTitle: { padding: "13px 15px", fontSize: 18, fontWeight: 800, borderBottom: "1px solid #ece7e1", background: "#faf8f5" },
  tableWrap: { width: "100%", overflowX: "hidden" },
  table: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" },
  th: { textAlign: "left", padding: "10px 7px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.03em", color: "#7b746c", background: "#faf8f5", borderBottom: "1px solid #ece7e1", whiteSpace: "normal", wordBreak: "break-word" },
  thRight: { textAlign: "right", padding: "10px 7px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.03em", color: "#7b746c", background: "#faf8f5", borderBottom: "1px solid #ece7e1", whiteSpace: "normal", wordBreak: "break-word" },
  td: { padding: "10px 7px", borderBottom: "1px solid #f0ece7", fontSize: 12, verticalAlign: "middle", overflowWrap: "anywhere" },
  tdRight: { padding: "10px 7px", borderBottom: "1px solid #f0ece7", fontSize: 12, verticalAlign: "middle", textAlign: "right", whiteSpace: "normal", overflowWrap: "anywhere" },
  badgeNeutral: { display: "inline-block", padding: "4px 7px", borderRadius: 999, background: "#f1eee9", fontSize: 10, fontWeight: 700, color: "#655e56" },
  badgeOk: { display: "inline-block", padding: "4px 7px", borderRadius: 999, background: "#e8f5ea", fontSize: 10, fontWeight: 700, color: "#276235" },
  success: { maxWidth: 1180, margin: "0 auto 14px", padding: 12, borderRadius: 9, background: "#e8f5ea", color: "#276235", border: "1px solid #bcdcc3" },
  error: { maxWidth: 1180, margin: "0 auto 14px", padding: 12, borderRadius: 9, background: "#fff2f0", color: "#a33a2b", border: "1px solid #f0c8c1" },
  note: { maxWidth: 1180, margin: "14px auto 0", padding: 14, borderRadius: 10, background: "#efeae3", color: "#5f574e", fontSize: 12, lineHeight: 1.5 },
};
