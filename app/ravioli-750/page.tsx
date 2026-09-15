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

  async function create(candidate: Candidate) {
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
      if (!response.ok) {
        const report = typeof data.error_report === "string" && data.error_report.trim()
          ? `\n\nRapport Mirakl:\n${data.error_report}`
          : "";
        throw new Error(`${data.error || "Création refusée"}${data.import_id ? ` (import ${data.import_id})` : ""}${report}`);
      }

      if (data.created) {
        setMessage(`${candidate.title ?? candidate.old_sku}: ${candidate.new_sku} est réellement créé dans Mirakl${data.import_id ? ` (import ${data.import_id})` : ""}.`);
      } else {
        const stats = data.import_id
          ? ` Import ${data.import_id} — statut ${data.import_status ?? "PENDING"}, succès ${data.lines_in_success ?? 0}, erreurs ${data.lines_in_error ?? 0}, insérées ${data.offer_inserted ?? 0}.`
          : "";
        setMessage(`${candidate.title ?? candidate.old_sku}: import envoyé mais ${candidate.new_sku} n'est pas encore visible dans Mirakl.${stats}`);
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
          <p style={styles.subtitle}>Création des nouveaux SKU 750 g à partir des anciennes références 1 kg. Citron et PRO sont exclus. La page n'indique “créé” que lorsque le nouveau SKU est réellement retrouvé dans Mirakl.</p>
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
            </div>
            <div style={styles.skuBox}>
              <span style={styles.label}>Ancien SKU</span>
              <strong>{item.old_sku ?? "—"}</strong>
            </div>
            <div style={styles.arrow}>→</div>
            <div style={styles.skuBox}>
              <span style={styles.label}>Nouveau SKU</span>
              <strong>{item.new_sku ?? "—"}</strong>
              {item.new_exists && <span style={styles.created}>Présent dans Mirakl</span>}
            </div>
            <div style={styles.skuBox}>
              <span style={styles.label}>Prix</span>
              <strong>{item.new_exists && item.new_price != null ? `${Number(item.new_price).toFixed(2)} €` : item.price == null ? "—" : `${Number(item.price).toFixed(2)} €`}</strong>
            </div>
            {item.new_exists ? (
              <span style={styles.badgeOk}>750 g créé</span>
            ) : (
              <button onClick={() => create(item)} disabled={busy !== null} style={styles.button}>
                {busy === item.old_sku ? "Création + contrôle…" : "Créer 750 g"}
              </button>
            )}
          </div>
        ))}
      </section>

      <section style={styles.note}><strong>Sécurité:</strong> la création utilise maintenant l'import d'offres Mirakl documenté (OF01), puis contrôle son traitement (OF02) et affiche le rapport d'erreur Mirakl (OF03) si la ligne est refusée. L'ancien SKU reste actif jusqu'à confirmation réelle du nouveau.</section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f6f3ee", color: "#26231f", fontFamily: "Arial, Helvetica, sans-serif", padding: "32px 18px 56px" },
  header: { maxWidth: 1050, margin: "0 auto 22px", display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-end", flexWrap: "wrap" },
  eyebrow: { margin: "0 0 7px", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#7a6654" },
  title: { margin: 0, fontSize: "clamp(28px,4vw,40px)" },
  subtitle: { margin: "10px 0 0", maxWidth: 760, color: "#6e675f", lineHeight: 1.45, fontSize: 14 },
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
  arrow: { color: "#9d958d", fontWeight: 800 },
  button: { border: 0, borderRadius: 9, background: "#26231f", color: "white", padding: "10px 13px", fontWeight: 800, cursor: "pointer" },
  badgeOk: { display: "inline-block", padding: "8px 10px", borderRadius: 999, background: "#e8f5ea", fontSize: 11, fontWeight: 800, color: "#276235", textAlign: "center" },
  success: { maxWidth: 1050, margin: "0 auto 14px", padding: 12, borderRadius: 9, background: "#e8f5ea", color: "#276235", border: "1px solid #bcdcc3", whiteSpace: "pre-wrap" },
  error: { maxWidth: 1050, margin: "0 auto 14px", padding: 12, borderRadius: 9, background: "#fff2f0", color: "#a33a2b", border: "1px solid #f0c8c1", whiteSpace: "pre-wrap" },
  note: { maxWidth: 1050, margin: "14px auto 0", padding: 14, borderRadius: 10, background: "#efeae3", color: "#5f574e", fontSize: 12, lineHeight: 1.5 },
};
