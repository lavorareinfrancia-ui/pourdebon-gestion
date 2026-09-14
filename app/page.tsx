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
  vatRate: number | null;
  family: string | null;
};

type AuditRow = {
  offer: Offer;
  info: AuditInfo;
  shopProduct: WooProduct | null;
  boutiqueTtcPerKg: number | null;
  exactTargetTtc: number | null;
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
  const title = normalize(value);
  if (/\b1\s*kg\b/.test(title) || /\b1000\s*g\b/.test(title)) return 1;
  if (/\b750\s*g?r?\b/.test(title) || title.includes("750")) return 0.75;
  if (/\b500\s*g?r?\b/.test(title) || title.includes("500")) return 0.5;
  if (/\b400\s*g?r?\b/.test(title) || title.includes("400")) return 0.4;
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

function auditInfo(offer: Offer): AuditInfo {
  const title = normalize(offer.product_title);
  const weightKg = weightFromTitle(offer.product_title);
  const family = familyFromTitle(offer.product_title);
  let commissionHtRate: number | null = null;

  if (family === "citron" && title.includes("500")) commissionHtRate = 4.53 / 14.69;
  else if (family === "citron" && title.includes("750")) commissionHtRate = 6.8 / 22.65;
  else if (family === "ricotta-epinards" && title.includes("500")) commissionHtRate = 4.13 / 13.27;
  else if (family === "ricotta-epinards" && title.includes("750")) commissionHtRate = 5.99 / 19.81;
  else if (family === "roero" && title.includes("500")) commissionHtRate = 4.37 / 14.12;
  else if (family === "roero" && title.includes("750")) commissionHtRate = 6.56 / 21.8;
  else if (family === "traditionnels" && title.includes("500")) commissionHtRate = 4.91 / 16.02;
  else if (family === "traditionnels" && title.includes("750")) commissionHtRate = 7.07 / 23.6;
  else if (["tagliatelle", "pappardelle", "tagliolini"].includes(family ?? "") && title.includes("400")) commissionHtRate = 1.94 / 5.59;
  else if (family === "gnocchi" && title.includes("500")) commissionHtRate = 2.75 / 8.44;

  return { weightKg, commissionHtRate, vatRate: 0.055, family };
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
  if (!family) return null;

  const candidates = products.filter((product) => familyFromTitle(product.name) === family && product.price != null);
  if (!candidates.length) return null;

  const exactWeight = candidates.find((product) => weight != null && weightFromTitle(product.name) === weight);
  if (exactWeight) return exactWeight;
  if (candidates.length === 1) return candidates[0];
  return null;
}

export default function Home() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [shopProducts, setShopProducts] = useState<WooProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());

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

      const rows = Array.isArray(offersData.offers) ? offersData.offers : [];
      setOffers(rows);
      setShopProducts(Array.isArray(shopData.products) ? shopData.products : []);
      setTotal(offersData.total_count ?? rows.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const auditRows = useMemo<AuditRow[]>(() => {
    return offers.map((offer) => {
      const info = auditInfo(offer);
      const shopProduct = matchShopProduct(offer, shopProducts);
      const shopWeight = weightFromTitle(shopProduct?.name);
      const boutiqueTtcPerKg = shopProduct?.price != null && shopWeight ? shopProduct.price / shopWeight : null;
      const priceTtc = offer.price == null ? null : Number(offer.price);
      const saleHt = priceTtc != null ? priceTtc / (1 + info.vatRate) : null;
      const netHt = saleHt != null && info.commissionHtRate != null ? saleHt * (1 - info.commissionHtRate) : null;
      const netHtPerKg = netHt != null && info.weightKg ? netHt / info.weightKg : null;
      const boutiqueHtPerKg = boutiqueTtcPerKg != null ? boutiqueTtcPerKg / (1 + info.vatRate) : null;
      const exactTargetTtc = boutiqueHtPerKg != null && info.weightKg != null && info.commissionHtRate != null
        ? (boutiqueHtPerKg * info.weightKg / (1 - info.commissionHtRate)) * (1 + info.vatRate)
        : null;
      return { offer, info, shopProduct, boutiqueTtcPerKg, exactTargetTtc, targetTtc: roundUpEuro(exactTargetTtc), netHtPerKg, boutiqueHtPerKg };
    });
  }, [offers, shopProducts]);

  const freshRows = useMemo(() => auditRows.filter((row) => row.info.family != null && row.info.weightKg != null), [auditRows]);

  const filteredRows = useMemo(() => {
    const q = normalize(query);
    if (!q) return freshRows;
    return freshRows.filter((row) => normalize(`${row.offer.product_title} ${row.offer.shop_sku}`).includes(q));
  }, [freshRows, query]);

  const updateCandidates = useMemo(() => freshRows.filter((row) => {
    if (!row.offer.shop_sku || row.targetTtc == null || row.offer.price == null) return false;
    return Math.abs(Number(row.offer.price) - row.targetTtc) > 0.001;
  }), [freshRows]);

  const selectedUpdates = useMemo(() => updateCandidates
    .filter((row) => row.offer.shop_sku && selectedSkus.has(row.offer.shop_sku))
    .map((row) => ({ sku: row.offer.shop_sku as string, price: row.targetTtc as number })),
  [updateCandidates, selectedSkus]);

  function toggleSku(sku: string) {
    setSelectedSkus((current) => {
      const next = new Set(current);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
  }

  async function applySelectedPrices() {
    if (!selectedUpdates.length) return;
    setUpdating(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/pourdebon/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: selectedUpdates, explicitSelection: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "La mise à jour a échoué");
      setMessage(`Import envoyé pour ${selectedUpdates.length} offre(s). Actualisez dans quelques instants pour contrôler les nouveaux prix.`);
      setSelectedSkus(new Set());
      setTimeout(() => loadData(), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setUpdating(false);
    }
  }

  const matchedCount = freshRows.filter((row) => row.shopProduct && row.targetTtc != null).length;

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Pasta Piemonte · Pourdebon</p>
          <h1 style={styles.title}>Gestion des prix frais</h1>
          <p style={styles.subtitle}>Comparaison automatique entre Pourdebon et le catalogue live de shop.pastapiemonte.com. Calcul économique en HT avec TVA sur commission récupérable. Toute cible est arrondie à l’euro supérieur.</p>
        </div>
        <div style={styles.actions}>
          <button onClick={loadData} disabled={loading || updating} style={styles.secondaryButton}>{loading ? "Actualisation…" : "Actualiser"}</button>
          <button onClick={applySelectedPrices} disabled={loading || updating || selectedUpdates.length === 0} style={styles.button}>
            {updating ? "Mise à jour…" : `Appliquer sélection (${selectedUpdates.length})`}
          </button>
        </div>
      </section>

      <section style={styles.stats}>
        <div style={styles.card}><span style={styles.cardLabel}>Offres Pourdebon</span><strong style={styles.cardValue}>{total}</strong></div>
        <div style={styles.card}><span style={styles.cardLabel}>Produits frais audités</span><strong style={styles.cardValue}>{freshRows.length}</strong></div>
        <div style={styles.card}><span style={styles.cardLabel}>Correspondances boutique</span><strong style={styles.cardValue}>{matchedCount}</strong></div>
        <div style={styles.card}><span style={styles.cardLabel}>Prix à corriger</span><strong style={styles.cardValue}>{updateCandidates.length}</strong></div>
      </section>

      {message && <section style={styles.success}>{message}</section>}
      {error && <section style={styles.error}>{error}</section>}

      <section style={styles.panel}>
        <div style={styles.toolbar}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher ravioli, pasta, gnocchi ou SKU…" style={styles.input} />
          <span style={styles.help}>Coche uniquement les lignes que tu veux réellement modifier.</span>
        </div>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead><tr>
              <th style={styles.th}>OK</th><th style={styles.th}>Produit Pourdebon</th><th style={styles.th}>SKU</th><th style={styles.thRight}>Prix PDB</th><th style={styles.thRight}>Commission HT</th><th style={styles.th}>Référence boutique live</th><th style={styles.thRight}>Boutique €/kg</th><th style={styles.thRight}>Net PDB HT/kg</th><th style={styles.thRight}>Cible PDB</th><th style={styles.th}>Audit</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={10} style={styles.empty}>Chargement des catalogues…</td></tr> : filteredRows.length === 0 ? <tr><td colSpan={10} style={styles.empty}>Aucun produit frais trouvé.</td></tr> : filteredRows.map((row, index) => {
                const sku = row.offer.shop_sku;
                const current = row.offer.price == null ? null : Number(row.offer.price);
                const canUpdate = Boolean(sku && row.targetTtc != null && current != null && Math.abs(current - row.targetTtc) > 0.001);
                const gap = row.netHtPerKg != null && row.boutiqueHtPerKg != null ? row.netHtPerKg - row.boutiqueHtPerKg : null;
                let label = "À vérifier";
                let badge = styles.badgeNeutral;
                if (!row.shopProduct) label = "Pas de correspondance boutique";
                else if (row.info.commissionHtRate == null) label = "Commission à confirmer";
                else if (gap != null && gap >= 0) { label = "Aligné"; badge = styles.badgeOk; }
                else if (row.targetTtc != null) { label = `Cible ${money(row.targetTtc)}`; badge = styles.badgeWarn; }

                return <tr key={`${sku ?? row.offer.product_sku ?? "offer"}-${index}`}>
                  <td style={styles.td}><input type="checkbox" disabled={!canUpdate} checked={Boolean(sku && selectedSkus.has(sku))} onChange={() => sku && toggleSku(sku)} /></td>
                  <td style={styles.td}><strong>{row.offer.product_title ?? "—"}</strong></td>
                  <td style={styles.td}>{sku ?? "—"}</td>
                  <td style={styles.tdRight}>{money(current)}</td>
                  <td style={styles.tdRight}>{percent(row.info.commissionHtRate)}</td>
                  <td style={styles.td}>{row.shopProduct?.name ?? "—"}{row.shopProduct?.price != null ? ` · ${money(row.shopProduct.price)}` : ""}</td>
                  <td style={styles.tdRight}>{money(row.boutiqueTtcPerKg)}</td>
                  <td style={styles.tdRight}>{money(row.netHtPerKg)}</td>
                  <td style={{ ...styles.tdRight, fontWeight: 800 }}>{money(row.targetTtc)}</td>
                  <td style={styles.td}><span style={badge}>{label}</span></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.note}><strong>Regola:</strong> il prezzo boutique arriva direttamente da WooCommerce. Il target Pourdebon usa la commissione HT osservata sulle transazioni 31/08–10/09/2026, considera recuperabile l’IVA sulla commissione e viene sempre arrotondato all’euro intero superiore per lasciare margine a cartoni, etichette e preparazione. Nessun prezzo viene modificato senza selezione esplicita della riga.</section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f6f3ee", color: "#26231f", fontFamily: "Arial, Helvetica, sans-serif", padding: "40px 24px 72px" },
  header: { maxWidth: 1500, margin: "0 auto 24px", display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-end", flexWrap: "wrap" },
  actions: { display: "flex", gap: 10, flexWrap: "wrap" },
  eyebrow: { margin: "0 0 8px", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7a6654" },
  title: { margin: 0, fontSize: "clamp(32px, 5vw, 48px)", lineHeight: 1.05 },
  subtitle: { margin: "12px 0 0", maxWidth: 950, color: "#6e675f", lineHeight: 1.5 },
  button: { border: 0, borderRadius: 10, background: "#26231f", color: "white", padding: "12px 18px", fontWeight: 700, cursor: "pointer" },
  secondaryButton: { border: "1px solid #cfc7bd", borderRadius: 10, background: "white", color: "#26231f", padding: "12px 18px", fontWeight: 700, cursor: "pointer" },
  stats: { maxWidth: 1500, margin: "0 auto 18px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 },
  card: { background: "white", border: "1px solid #e5dfd7", borderRadius: 14, padding: 18 },
  cardLabel: { display: "block", fontSize: 13, color: "#7b746c", marginBottom: 6 },
  cardValue: { display: "block", fontSize: 28 },
  panel: { maxWidth: 1500, margin: "0 auto", background: "white", border: "1px solid #e5dfd7", borderRadius: 16, overflow: "hidden" },
  toolbar: { padding: 16, borderBottom: "1px solid #ece7e1", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" },
  input: { width: "min(430px, 100%)", border: "1px solid #d8d1c8", borderRadius: 10, padding: "11px 13px", fontSize: 15, outline: "none" },
  help: { fontSize: 13, color: "#7b746c" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 1500 },
  th: { textAlign: "left", padding: "13px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "#7b746c", background: "#faf8f5", borderBottom: "1px solid #ece7e1", whiteSpace: "nowrap" },
  thRight: { textAlign: "right", padding: "13px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "#7b746c", background: "#faf8f5", borderBottom: "1px solid #ece7e1", whiteSpace: "nowrap" },
  td: { padding: "13px 10px", borderBottom: "1px solid #f0ece7", fontSize: 13, verticalAlign: "middle" },
  tdRight: { padding: "13px 10px", borderBottom: "1px solid #f0ece7", fontSize: 13, verticalAlign: "middle", textAlign: "right", whiteSpace: "nowrap" },
  badgeNeutral: { display: "inline-block", padding: "5px 8px", borderRadius: 999, background: "#f1eee9", fontSize: 11, fontWeight: 700, color: "#655e56" },
  badgeOk: { display: "inline-block", padding: "5px 8px", borderRadius: 999, background: "#e8f5ea", fontSize: 11, fontWeight: 700, color: "#276235" },
  badgeWarn: { display: "inline-block", padding: "5px 8px", borderRadius: 999, background: "#fff3d6", fontSize: 11, fontWeight: 700, color: "#8a6500" },
  empty: { padding: 32, textAlign: "center", color: "#7b746c" },
  success: { maxWidth: 1500, margin: "0 auto 16px", padding: 14, borderRadius: 10, background: "#e8f5ea", color: "#276235", border: "1px solid #bcdcc3" },
  error: { maxWidth: 1500, margin: "0 auto 16px", padding: 14, borderRadius: 10, background: "#fff2f0", color: "#a33a2b", border: "1px solid #f0c8c1" },
  note: { maxWidth: 1500, margin: "16px auto 0", padding: 16, borderRadius: 12, background: "#efeae3", color: "#5f574e", fontSize: 13, lineHeight: 1.55 },
};
