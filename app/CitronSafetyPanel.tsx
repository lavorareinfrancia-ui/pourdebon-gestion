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
  offers?: Offer[];
  error?: string;
};

type Candidate = {
  sku: string;
  title: string;
  currentPrice: number | null;
  targetPrice: number | null;
};

function normalizeTitle(value: string | null) {
  return (value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function targetFor(offer: Offer) {
  const title = normalizeTitle(offer.product_title);
  if (!title.includes("citron")) return null;
  if (title.includes("500")) return 18;
  if (title.includes("750")) return 27;
  return null;
}

export default function CitronSafetyPanel() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pourdebon/offers?max=100&offset=0", { cache: "no-store" });
      const data = (await response.json()) as OffersResponse;
      if (!response.ok) throw new Error(data.error || "Impossible de charger les offres");
      setOffers(Array.isArray(data.offers) ? data.offers : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const candidates = useMemo<Candidate[]>(() => offers
    .filter((offer) => normalizeTitle(offer.product_title).includes("citron") && offer.shop_sku)
    .map((offer) => ({
      sku: offer.shop_sku as string,
      title: offer.product_title ?? "Sans nom",
      currentPrice: offer.price == null ? null : Number(offer.price),
      targetPrice: targetFor(offer),
    })), [offers]);

  const selectedCandidates = candidates.filter((candidate) => selected[candidate.sku] && candidate.targetPrice != null);

  async function applySelected() {
    if (!selectedCandidates.length) return;
    setUpdating(true);
    setError("");
    setMessage("");
    try {
      const updates = selectedCandidates.map((candidate) => ({ sku: candidate.sku, price: candidate.targetPrice as number }));
      const response = await fetch("/api/pourdebon/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates,
          confirmSkus: updates.map((update) => update.sku),
          source: "citron-safety-panel",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "La mise à jour a échoué");
      setMessage(`Import envoyé pour ${updates.length} offre(s) sélectionnée(s).`);
      setSelected({});
      setTimeout(() => load(), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <section style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <div style={styles.kicker}>Sécurité prix Citron</div>
          <h2 style={styles.title}>Offres Citron détectées : {candidates.length}</h2>
          <p style={styles.text}>Vérifiez le SKU avant toute nouvelle mise à jour. Rien n'est modifié tant que vous ne cochez pas explicitement une ligne.</p>
        </div>
        <button style={styles.secondaryButton} onClick={load} disabled={loading || updating}>{loading ? "Chargement…" : "Rafraîchir"}</button>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {message && <div style={styles.success}>{message}</div>}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Choisir</th>
              <th style={styles.th}>SKU</th>
              <th style={styles.th}>Produit</th>
              <th style={styles.thRight}>Prix actuel</th>
              <th style={styles.thRight}>Prix cible</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr key={candidate.sku}>
                <td style={styles.td}>
                  <input
                    type="checkbox"
                    checked={Boolean(selected[candidate.sku])}
                    disabled={candidate.targetPrice == null || updating}
                    onChange={(event) => setSelected((current) => ({ ...current, [candidate.sku]: event.target.checked }))}
                  />
                </td>
                <td style={styles.td}><strong>{candidate.sku}</strong></td>
                <td style={styles.td}>{candidate.title}</td>
                <td style={styles.tdRight}>{candidate.currentPrice == null ? "—" : `${candidate.currentPrice.toFixed(2)} €`}</td>
                <td style={styles.tdRight}>{candidate.targetPrice == null ? "À vérifier" : `${candidate.targetPrice.toFixed(2)} €`}</td>
              </tr>
            ))}
            {!loading && candidates.length === 0 && <tr><td colSpan={5} style={styles.empty}>Aucune offre Citron détectée.</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={styles.footer}>
        <strong>{selectedCandidates.length} offre(s) sélectionnée(s)</strong>
        <button style={styles.button} onClick={applySelected} disabled={updating || selectedCandidates.length === 0}>
          {updating ? "Mise à jour…" : "Appliquer uniquement la sélection"}
        </button>
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 1380, margin: "24px auto 0", background: "#fff", border: "2px solid #d8d1c8", borderRadius: 16, overflow: "hidden", fontFamily: "Arial, Helvetica, sans-serif", color: "#26231f" },
  header: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-end", padding: 18, flexWrap: "wrap" },
  kicker: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#7a6654" },
  title: { margin: "4px 0 6px", fontSize: 22 },
  text: { margin: 0, color: "#6e675f" },
  tableWrap: { overflowX: "auto", borderTop: "1px solid #ece7e1", borderBottom: "1px solid #ece7e1" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 760 },
  th: { textAlign: "left", padding: "11px 12px", fontSize: 11, textTransform: "uppercase", background: "#faf8f5", color: "#7b746c" },
  thRight: { textAlign: "right", padding: "11px 12px", fontSize: 11, textTransform: "uppercase", background: "#faf8f5", color: "#7b746c" },
  td: { padding: "12px", borderTop: "1px solid #f0ece7", fontSize: 13 },
  tdRight: { padding: "12px", borderTop: "1px solid #f0ece7", fontSize: 13, textAlign: "right" },
  footer: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: 16, flexWrap: "wrap" },
  button: { border: 0, borderRadius: 10, background: "#26231f", color: "white", padding: "11px 16px", fontWeight: 700, cursor: "pointer" },
  secondaryButton: { border: "1px solid #cfc7bd", borderRadius: 10, background: "white", color: "#26231f", padding: "10px 14px", fontWeight: 700, cursor: "pointer" },
  empty: { padding: 24, textAlign: "center", color: "#7b746c" },
  error: { margin: "0 18px 14px", padding: 12, borderRadius: 10, background: "#fff2f0", color: "#a33a2b", border: "1px solid #f0c8c1" },
  success: { margin: "0 18px 14px", padding: 12, borderRadius: 10, background: "#eef8f0", color: "#276235", border: "1px solid #cfe5d2" },
};
