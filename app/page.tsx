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

type OffersResponse = {
  total_count?: number;
  offers?: Offer[];
  error?: string;
};

type AuditInfo = {
  weightKg: number | null;
  commissionHtRate: number | null;
  boutiqueTtcPerKg: number | null;
  vatRate: number | null;
};

const CITRON_500_TARGET = 17.9;
const CITRON_750_TARGET = 26.5;

function normalizeTitle(value: string | null) {
  return (value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function auditInfo(offer: Offer): AuditInfo {
  const title = normalizeTitle(offer.product_title);
  const weightKg = title.includes("1 kg") ? 1 : title.includes("750") ? 0.75 : title.includes("500") ? 0.5 : title.includes("400") ? 0.4 : null;

  let commissionHtRate: number | null = null;
  let boutiqueTtcPerKg: number | null = null;
  let vatRate: number | null = null;

  if (title.includes("citron") && title.includes("500")) {
    commissionHtRate = 4.53 / 14.69;
    boutiqueTtcPerKg = 24.5;
    vatRate = 0.055;
  } else if (title.includes("citron") && title.includes("750")) {
    commissionHtRate = 6.8 / 22.65;
    boutiqueTtcPerKg = 24.5;
    vatRate = 0.055;
  } else if (title.includes("ricotta") && title.includes("500")) commissionHtRate = 4.13 / 13.27;
  else if (title.includes("ricotta") && title.includes("750")) commissionHtRate = 5.99 / 19.81;
  else if ((title.includes("noisette") || title.includes("tome") || title.includes("toma")) && title.includes("500")) commissionHtRate = 4.37 / 14.12;
  else if ((title.includes("noisette") || title.includes("tome") || title.includes("toma")) && title.includes("750")) commissionHtRate = 6.56 / 21.8;
  else if (title.includes("tradition") && title.includes("500")) commissionHtRate = 4.91 / 16.02;
  else if (title.includes("tradition") && title.includes("750")) commissionHtRate = 7.07 / 23.6;
  else if ((title.includes("tagliatelle") || title.includes("pappardelle") || title.includes("tagliolini")) && title.includes("400")) commissionHtRate = 1.94 / 5.59;
  else if (title.includes("gnocchi") && title.includes("500")) commissionHtRate = 2.75 / 8.44;

  return { weightKg, commissionHtRate, boutiqueTtcPerKg, vatRate };
}

function money(value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)} €`;
}

function percent(value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(1)} %`;
}

export default function Home() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  async function loadOffers() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pourdebon/offers?max=100&offset=0", { cache: "no-store" });
      const data = (await response.json()) as OffersResponse;
      if (!response.ok) throw new Error(data.error || "Impossible de charger les offres");
      const rows = Array.isArray(data.offers) ? data.offers : [];
      setOffers(rows);
      setTotal(data.total_count ?? rows.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadOffers(); }, []);

  const filteredOffers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return offers;
    return offers.filter((offer) => [offer.product_title, offer.shop_sku, offer.state_code].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)));
  }, [offers, query]);

  const citronUpdates = useMemo(() => {
    const updates: Array<{ sku: string; price: number }> = [];
    for (const offer of offers) {
      const title = normalizeTitle(offer.product_title);
      if (!title.includes("citron") || !offer.shop_sku) continue;
      if (title.includes("500") && Math.abs(Number(offer.price) - CITRON_500_TARGET) > 0.001) updates.push({ sku: offer.shop_sku, price: CITRON_500_TARGET });
      if (title.includes("750") && Math.abs(Number(offer.price) - CITRON_750_TARGET) > 0.001) updates.push({ sku: offer.shop_sku, price: CITRON_750_TARGET });
    }
    return updates;
  }, [offers]);

  async function applyCitronPrices() {
    if (citronUpdates.length === 0) return;
    setUpdating(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/pourdebon/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: citronUpdates }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "La mise à jour a échoué");
      setMessage("Import prix envoyé à Pourdebon. Actualisez dans quelques instants pour vérifier les nouveaux montants.");
      setTimeout(() => loadOffers(), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setUpdating(false);
    }
  }

  const citronAlerts = useMemo(() => offers.filter((offer) => {
    const info = auditInfo(offer);
    if (offer.price == null || info.weightKg == null || info.commissionHtRate == null || info.boutiqueTtcPerKg == null || info.vatRate == null) return false;
    const saleHt = Number(offer.price) / (1 + info.vatRate);
    const netHtPerKg = (saleHt * (1 - info.commissionHtRate)) / info.weightKg;
    const boutiqueHtPerKg = info.boutiqueTtcPerKg / (1 + info.vatRate);
    return netHtPerKg < boutiqueHtPerKg;
  }).length, [offers]);

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Pasta Piemonte · Pourdebon</p>
          <h1 style={styles.title}>Gestion des produits</h1>
          <p style={styles.subtitle}>Audit catalogue et prix. Comparaison économique HT : la TVA sur la commission Pourdebon est considérée récupérable.</p>
        </div>
        <div style={styles.actions}>
          <button onClick={loadOffers} disabled={loading || updating} style={styles.secondaryButton}>{loading ? "Actualisation…" : "Actualiser"}</button>
          <button onClick={applyCitronPrices} disabled={loading || updating || citronUpdates.length === 0} style={styles.button}>
            {updating ? "Mise à jour…" : citronUpdates.length ? `Appliquer prix Citron (${citronUpdates.length})` : "Prix Citron à jour"}
          </button>
        </div>
      </section>

      <section style={styles.stats}>
        <div style={styles.card}><span style={styles.cardLabel}>Offres</span><strong style={styles.cardValue}>{total}</strong></div>
        <div style={styles.card}><span style={styles.cardLabel}>Alertes prix Citron</span><strong style={styles.cardValue}>{citronAlerts}</strong></div>
        <div style={styles.card}><span style={styles.cardLabel}>Référence boutique Citron</span><strong style={{ ...styles.cardValue, fontSize: 20 }}>24,50 €/kg TTC</strong></div>
        <div style={styles.card}><span style={styles.cardLabel}>Cibles Pourdebon arrondies</span><strong style={{ ...styles.cardValue, fontSize: 18 }}>500 g: 17,90 € · 750 g: 26,50 €</strong></div>
      </section>

      {message && <section style={styles.success}>{message}</section>}
      {error && <section style={styles.error}>{error}</section>}

      <section style={styles.panel}>
        <div style={styles.toolbar}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher par nom, SKU ou état…" style={styles.input} /></div>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead><tr>
              <th style={styles.th}>Produit</th><th style={styles.th}>SKU</th><th style={styles.thRight}>Prix PDB TTC</th><th style={styles.thRight}>€/kg TTC</th><th style={styles.thRight}>Commission HT</th><th style={styles.thRight}>Net économique HT</th><th style={styles.thRight}>Net HT/kg</th><th style={styles.thRight}>Boutique TTC/kg</th><th style={styles.thRight}>Cible PDB TTC</th><th style={styles.th}>Audit</th><th style={styles.thRight}>Stock</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={11} style={styles.empty}>Chargement…</td></tr> : filteredOffers.map((offer, index) => {
                const info = auditInfo(offer);
                const priceTtc = offer.price == null ? null : Number(offer.price);
                const pricePerKgTtc = priceTtc != null && info.weightKg ? priceTtc / info.weightKg : null;
                const saleHt = priceTtc != null && info.vatRate != null ? priceTtc / (1 + info.vatRate) : null;
                const netHt = saleHt != null && info.commissionHtRate != null ? saleHt * (1 - info.commissionHtRate) : null;
                const netHtPerKg = netHt != null && info.weightKg ? netHt / info.weightKg : null;
                const boutiqueHtPerKg = info.boutiqueTtcPerKg != null && info.vatRate != null ? info.boutiqueTtcPerKg / (1 + info.vatRate) : null;
                const exactTargetTtc = boutiqueHtPerKg != null && info.weightKg != null && info.commissionHtRate != null && info.vatRate != null
                  ? (boutiqueHtPerKg * info.weightKg / (1 - info.commissionHtRate)) * (1 + info.vatRate)
                  : null;
                const displayTarget = normalizeTitle(offer.product_title).includes("citron") && normalizeTitle(offer.product_title).includes("500") ? CITRON_500_TARGET
                  : normalizeTitle(offer.product_title).includes("citron") && normalizeTitle(offer.product_title).includes("750") ? CITRON_750_TARGET
                  : exactTargetTtc;
                const gapHtKg = netHtPerKg != null && boutiqueHtPerKg != null ? netHtPerKg - boutiqueHtPerKg : null;
                let auditLabel = "Référence boutique à renseigner";
                let auditStyle = styles.badgeNeutral;
                if (gapHtKg != null) {
                  if (gapHtKg >= 0) { auditLabel = "Aligné"; auditStyle = styles.badgeOk; }
                  else if (gapHtKg >= -1.5) { auditLabel = `${gapHtKg.toFixed(2)} €/kg HT`; auditStyle = styles.badgeWarn; }
                  else { auditLabel = `${gapHtKg.toFixed(2)} €/kg HT`; auditStyle = styles.badgeBad; }
                } else if (info.commissionHtRate == null) auditLabel = "Commission à vérifier";

                return <tr key={`${offer.shop_sku ?? offer.product_sku ?? "offer"}-${index}`}>
                  <td style={styles.td}><strong>{offer.product_title ?? "Nom non disponible"}</strong></td>
                  <td style={styles.td}>{offer.shop_sku ?? "—"}</td>
                  <td style={styles.tdRight}>{money(priceTtc)}</td><td style={styles.tdRight}>{money(pricePerKgTtc)}</td><td style={styles.tdRight}>{percent(info.commissionHtRate)}</td><td style={styles.tdRight}>{money(netHt)}</td><td style={styles.tdRight}>{money(netHtPerKg)}</td><td style={styles.tdRight}>{money(info.boutiqueTtcPerKg)}</td><td style={{ ...styles.tdRight, fontWeight: displayTarget != null ? 700 : 400 }}>{money(displayTarget)}</td><td style={styles.td}><span style={auditStyle}>{auditLabel}</span></td><td style={styles.tdRight}>{offer.quantity ?? "—"}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.note}><strong>Méthode :</strong> les commissions sont comparées en HT. La TVA de 20 % facturée par Pourdebon sur sa commission n’est pas traitée comme un coût puisqu’elle est récupérable. Pour les produits frais Citron, la vente est ramenée en HT à partir du taux de TVA de 5,5 % observé sur les transactions. Les cibles exactes ressortent à environ 17,71 € (500 g) et 26,26 € (750 g) TTC ; elles sont arrondies à 17,90 € et 26,50 €.</section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f6f3ee", color: "#26231f", fontFamily: "Arial, Helvetica, sans-serif", padding: "40px 24px 72px" },
  header: { maxWidth: 1380, margin: "0 auto 24px", display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-end", flexWrap: "wrap" },
  actions: { display: "flex", gap: 10, flexWrap: "wrap" },
  eyebrow: { margin: "0 0 8px", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7a6654" },
  title: { margin: 0, fontSize: "clamp(32px, 5vw, 48px)", lineHeight: 1.05 },
  subtitle: { margin: "12px 0 0", maxWidth: 840, color: "#6e675f", lineHeight: 1.5 },
  button: { border: 0, borderRadius: 10, background: "#26231f", color: "white", padding: "12px 18px", fontWeight: 700, cursor: "pointer" },
  secondaryButton: { border: "1px solid #cfc7bd", borderRadius: 10, background: "white", color: "#26231f", padding: "12px 18px", fontWeight: 700, cursor: "pointer" },
  stats: { maxWidth: 1380, margin: "0 auto 18px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 },
  card: { background: "white", border: "1px solid #e5dfd7", borderRadius: 14, padding: 18 },
  cardLabel: { display: "block", fontSize: 13, color: "#7b746c", marginBottom: 6 },
  cardValue: { display: "block", fontSize: 28 },
  panel: { maxWidth: 1380, margin: "0 auto", background: "white", border: "1px solid #e5dfd7", borderRadius: 16, overflow: "hidden" },
  toolbar: { padding: 16, borderBottom: "1px solid #ece7e1" },
  input: { width: "min(420px, 100%)", border: "1px solid #d8d1c8", borderRadius: 10, padding: "11px 13px", fontSize: 15, outline: "none" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 1500 },
  th: { textAlign: "left", padding: "13px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "#7b746c", background: "#faf8f5", borderBottom: "1px solid #ece7e1", whiteSpace: "nowrap" },
  thRight: { textAlign: "right", padding: "13px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "#7b746c", background: "#faf8f5", borderBottom: "1px solid #ece7e1", whiteSpace: "nowrap" },
  td: { padding: "13px 12px", borderBottom: "1px solid #f0ece7", fontSize: 13, verticalAlign: "middle", whiteSpace: "nowrap" },
  tdRight: { padding: "13px 12px", borderBottom: "1px solid #f0ece7", fontSize: 13, verticalAlign: "middle", whiteSpace: "nowrap", textAlign: "right" },
  badgeNeutral: { display: "inline-block", padding: "5px 8px", borderRadius: 999, background: "#f1eee9", fontSize: 11, fontWeight: 700, color: "#655e56" },
  badgeOk: { display: "inline-block", padding: "5px 8px", borderRadius: 999, background: "#e8f5ea", fontSize: 11, fontWeight: 700, color: "#276235" },
  badgeWarn: { display: "inline-block", padding: "5px 8px", borderRadius: 999, background: "#fff3d6", fontSize: 11, fontWeight: 700, color: "#8a6500" },
  badgeBad: { display: "inline-block", padding: "5px 8px", borderRadius: 999, background: "#fde8e5", fontSize: 11, fontWeight: 700, color: "#a33a2b" },
  empty: { padding: 32, textAlign: "center", color: "#7b746c" },
  note: { maxWidth: 1380, margin: "18px auto 0", padding: 16, borderRadius: 12, background: "#fffaf0", border: "1px solid #eadfc6", color: "#655e56", lineHeight: 1.5 },
  error: { maxWidth: 1380, margin: "0 auto 18px", padding: 14, borderRadius: 10, background: "#fff2f0", color: "#a33a2b", border: "1px solid #f0c8c1" },
  success: { maxWidth: 1380, margin: "0 auto 18px", padding: 14, borderRadius: 10, background: "#eef8ef", color: "#276235", border: "1px solid #cde5d1" },
};
