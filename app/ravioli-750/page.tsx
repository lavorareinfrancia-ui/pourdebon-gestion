"use client";

import { useEffect, useState } from "react";

type Candidate = {
  title: string | null;
  old_sku: string | null;
  new_sku: string | null;
  product_sku: string | null;
  price: number | null;
  quantity: number | null;
  state_code: string | null;
  new_exists?: boolean;
  new_present?: boolean;
  new_active?: boolean;
  new_channels?: string[];
  old_channels?: string[];
  inactivity_reasons?: string[];
  new_price?: number | null;
  new_quantity?: number | null;
  new_state_code?: string | null;
};

export default function Ravioli750Page() {
  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pourdebon/migrate-750", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Lecture impossible");
      setItems(Array.isArray(data.candidates) ? data.candidates : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createOrRepair(candidate: Candidate) {
    if (!candidate.old_sku || !candidate.new_sku) return;
    setBusy(candidate.old_sku);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/pourdebon/migrate-750", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldSku: candidate.old_sku, newSku: candidate.new_sku }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(`${data.error || "Opération refusée"}${data.import_id ? ` (import ${data.import_id})` : ""}`);

      if (data.ready) {
        setMessage(`${candidate.title ?? candidate.old_sku}: ${candidate.new_sku} est maintenant active et synchronisée sur les mêmes canaux que l'ancienne référence${data.import_id ? ` (import ${data.import_id})` : ""}.`);
      } else {
        const reasons = Array.isArray(data.inactivity_reasons) && data.inactivity_reasons.length ? ` Motif(s): ${data.inactivity_reasons.join(", ")}.` : "";
        setMessage(`${candidate.title ?? candidate.old_sku}: ${data.mode === "repair" ? "réparation" : "création"} envoyée. La référence existe mais n'est pas encore confirmée active sur les mêmes canaux.${reasons}`);
      }
      setTimeout(load, 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Pasta Piemonte · Pourdebon</p>
          <h1 style={styles.title}>Migration ravioli 750 g</h1>
          <p style={styles.subtitle}>Les références 750 g sont considérées comme terminées uniquement si elles existent, sont actives et portent les mêmes canaux de vente que l'ancienne offre. Citron et PRO sont exclus.</p>
        </div>
        <a href="/" style={styles.link}>← Prix</a>
      </section>

      {message && <div style={styles.success}>{message}</div>}
      {error && <div style={styles.error}>{error}</div>}

      <section style={styles.panel}>
        <div style={styles.panelTitle}>Références détectées</div>
        {loading ? <p style={styles.pad}>Chargement…</p> : items.length === 0 ? <p style={styles.pad}>Aucune ancienne référence ravioli 1 kg à migrer détectée.</p> : items.map((item) => (
          <div key={item.old_sku ?? item.title ?? Math.random()} style={styles.row}>
            <div style={styles.product}>
              <strong>{item.title ?? "—"}</strong>
              <span style={styles.meta}>Produit Mirakl: {item.product_sku ?? "—"}</span>
              {item.new_present && !item.new_exists && <span style={styles.warn}>Présent via API mais pas encore actif/synchronisé</span>}
              {item.inactivity_reasons && item.inactivity_reasons.length > 0 && <span style={styles.warn}>Blocage Mirakl: {item.inactivity_reasons.join(", ")}</span>}
            </div>
            <div style={styles.skuBox}>
              <span style={styles.label}>Ancien SKU</span>
              <strong>{item.old_sku ?? "—"}</strong>
            </div>
            <div style={styles.arrow}>→</div>
            <div style={styles.skuBox}>
              <span style={styles.label}>Nouveau SKU</span>
              <strong>{item.new_sku ?? "—"}</strong>
              {item.new_exists && <span style={styles.created}>Actif dans Mirakl</span>}
            </div>
            <div style={styles.skuBox}>
              <span style={styles.label}>Prix</span>
              <strong>{item.new_present && item.new_price != null ? `${Number(item.new_price).toFixed(2)} €` : item.price == null ? "—" : `${Number(item.price).toFixed(2)} €`}</strong>
            </div>
            {item.new_exists ? (
              <span style={styles.badgeOk}>750 g actif</span>
            ) : (
              <button onClick={() => createOrRepair(item)} disabled={busy !== null} style={styles.button}>
                {busy === item.old_sku ? "Synchronisation…" : item.new_present ? "Réparer / synchroniser" : "Créer 750 g"}
              </button>
            )}
          </div>
        ))}
      </section>

      <section style={styles.note}><strong>Sécurité:</strong> la synchronisation utilise l'API Mirakl OF24 et recopie l'offre complète: prix par canal, champs additionnels, stock, état, dates, logistique, quantités minimum/maximum et paramètres disponibles. L'ancien SKU reste inchangé tant que le 750 g n'est pas confirmé actif.</section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f6f3ee", color: "#26231f", fontFamily: "Arial, Helvetica, sans-serif", padding: "32px 18px 56px" },
  header: { maxWidth: 1050, margin: "0 auto 22px", display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-end", flexWrap: "wrap" },
  eyebrow: { margin: "0 0 7px", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#7a6654" },
  title: { margin: 0, fontSize: "clamp(28px,4vw,40px)" },
  subtitle: { margin: "10px 0 0", maxWidth: 800, color: "#6e675f", lineHeight: 1.45, fontSize: 14 },
  link: { color: "#26231f", fontWeight: 700, textDecoration: "none" },
  panel: { maxWidth: 1050, margin: "0 auto", background: "white", border: "1px solid #e5dfd7", borderRadius: 14, overflow: "hidden" },
  panelTitle: { padding: "14px 16px", fontWeight: 800, fontSize: 18, background: "#faf8f5", borderBottom: "1px solid #ece7e1" },
  pad: { padding: 16 },
  row: { display: "grid", gridTemplateColumns: "2fr 1fr auto 1fr .8fr auto", gap: 12, alignItems: "center", padding: 14, borderBottom: "1px solid #eee8e1" },
  product: { display: "flex", flexDirection: "column", gap: 4, fontSize: 13 },
  meta: { color: "#797169", fontSize: 11 },
  skuBox: { display: "flex", flexDirection: "column", gap: 3, fontSize: 12 },
  label: { color: "#7b746c", textTransform: "uppercase", fontSize: 9, letterSpacing: ".04em" },
  created: { marginTop: 3, fontSize: 10, fontWeight: 700, color: "#276235" },
  warn: { color: "#9a5a16", fontSize: 10, fontWeight: 700 },
  arrow: { color: "#9d958d", fontWeight: 800 },
  button: { border: 0, borderRadius: 9, background: "#26231f", color: "white", padding: "10px 13px", fontWeight: 800, cursor: "pointer" },
  badgeOk: { display: "inline-block", padding: "8px 10px", borderRadius: 999, background: "#e8f5ea", fontSize: 11, fontWeight: 800, color: "#276235", textAlign: "center" },
  success: { maxWidth: 1050, margin: "0 auto 14px", padding: 12, borderRadius: 9, background: "#e8f5ea", color: "#276235", border: "1px solid #bcdcc3", whiteSpace: "pre-wrap" },
  error: { maxWidth: 1050, margin: "0 auto 14px", padding: 12, borderRadius: 9, background: "#fff2f0", color: "#a33a2b", border: "1px solid #f0c8c1", whiteSpace: "pre-wrap" },
  note: { maxWidth: 1050, margin: "14px auto 0", padding: 14, borderRadius: 10, background: "#efeae3", color: "#5f574e", fontSize: 12, lineHeight: 1.5 },
};
