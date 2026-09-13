"use client";

import { useEffect, useMemo, useState } from "react";

type Offer = {
  shop_sku: string | null;
  product_sku: string | null;
  price: number | null;
  quantity: number | null;
  state_code: string | null;
};

type OffersResponse = {
  total_count?: number;
  count?: number;
  offers?: Offer[];
  error?: string;
};

type ProductNameMap = Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function buildProductNameMap(payload: unknown): ProductNameMap {
  const map: ProductNameMap = {};
  const candidates: unknown[] = [];

  if (Array.isArray(payload)) {
    candidates.push(...payload);
  } else if (isRecord(payload)) {
    for (const key of ["products", "data", "items", "content"]) {
      const value = payload[key];
      if (Array.isArray(value)) candidates.push(...value);
    }
  }

  for (const item of candidates) {
    if (!isRecord(item)) continue;

    const name = firstString(item, [
      "title",
      "name",
      "label",
      "product_title",
      "product_name",
      "description",
    ]);

    if (!name) continue;

    const ids = [
      firstString(item, ["product_sku", "sku", "shop_sku", "id", "product_id"]),
    ].filter(Boolean) as string[];

    for (const id of ids) map[id] = name;
  }

  return map;
}

export default function Home() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [productNames, setProductNames] = useState<ProductNameMap>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function loadOffers() {
    setLoading(true);
    setError("");

    try {
      const [offersResponse, productsResponse] = await Promise.all([
        fetch("/api/pourdebon/offers?max=100&offset=0", { cache: "no-store" }),
        fetch("/api/pourdebon/products", { cache: "no-store" }),
      ]);

      const offersData = (await offersResponse.json()) as OffersResponse;
      const productsData = await productsResponse.json();

      if (!offersResponse.ok) {
        throw new Error(offersData.error || "Impossible de charger les offres");
      }

      const rows = Array.isArray(offersData.offers) ? offersData.offers : [];
      setOffers(rows);
      setTotal(offersData.total_count ?? rows.length);

      if (productsResponse.ok) {
        setProductNames(buildProductNameMap(productsData));
      } else {
        setProductNames({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOffers();
  }, []);

  function productName(offer: Offer) {
    return (
      (offer.product_sku && productNames[offer.product_sku]) ||
      (offer.shop_sku && productNames[offer.shop_sku]) ||
      "Nom non disponible"
    );
  }

  const filteredOffers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return offers;

    return offers.filter((offer) =>
      [offer.shop_sku, offer.state_code, productName(offer)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [offers, productNames, query]);

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Pasta Piemonte · Pourdebon</p>
          <h1 style={styles.title}>Gestion des produits</h1>
          <p style={styles.subtitle}>Lecture seule des offres Mirakl. Aucune modification de prix ou de stock n’est activée.</p>
        </div>
        <button onClick={loadOffers} disabled={loading} style={styles.button}>
          {loading ? "Actualisation…" : "Actualiser"}
        </button>
      </section>

      <section style={styles.stats}>
        <div style={styles.card}>
          <span style={styles.cardLabel}>Offres</span>
          <strong style={styles.cardValue}>{total}</strong>
        </div>
        <div style={styles.card}>
          <span style={styles.cardLabel}>Affichées</span>
          <strong style={styles.cardValue}>{filteredOffers.length}</strong>
        </div>
        <div style={styles.card}>
          <span style={styles.cardLabel}>Mode</span>
          <strong style={{ ...styles.cardValue, fontSize: 18 }}>Lecture seule</strong>
        </div>
      </section>

      <section style={styles.panel}>
        <div style={styles.toolbar}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher par nom, SKU ou état…"
            style={styles.input}
          />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {!error && (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Produit</th>
                  <th style={styles.th}>SKU</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>Prix</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>Stock</th>
                  <th style={styles.th}>État</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={styles.empty}>Chargement des produits…</td>
                  </tr>
                ) : filteredOffers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={styles.empty}>Aucun produit trouvé.</td>
                  </tr>
                ) : (
                  filteredOffers.map((offer, index) => {
                    const name = productName(offer);
                    return (
                      <tr key={`${offer.shop_sku ?? offer.product_sku ?? "offer"}-${index}`}>
                        <td style={styles.td}>
                          <strong>{name}</strong>
                        </td>
                        <td style={styles.td}>{offer.shop_sku ?? "—"}</td>
                        <td style={{ ...styles.td, textAlign: "right" }}>
                          {offer.price == null ? "—" : `${Number(offer.price).toFixed(2)} €`}
                        </td>
                        <td style={{ ...styles.td, textAlign: "right" }}>{offer.quantity ?? "—"}</td>
                        <td style={styles.td}>
                          <span style={styles.badge}>{offer.state_code ?? "—"}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f6f3ee",
    color: "#26231f",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: "40px 24px 72px",
  },
  header: {
    maxWidth: 1180,
    margin: "0 auto 24px",
    display: "flex",
    justifyContent: "space-between",
    gap: 24,
    alignItems: "flex-end",
    flexWrap: "wrap",
  },
  eyebrow: {
    margin: "0 0 8px",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#7a6654",
  },
  title: {
    margin: 0,
    fontSize: "clamp(32px, 5vw, 48px)",
    lineHeight: 1.05,
  },
  subtitle: {
    margin: "12px 0 0",
    maxWidth: 720,
    color: "#6e675f",
    lineHeight: 1.5,
  },
  button: {
    border: 0,
    borderRadius: 10,
    background: "#26231f",
    color: "white",
    padding: "12px 18px",
    fontWeight: 700,
    cursor: "pointer",
  },
  stats: {
    maxWidth: 1180,
    margin: "0 auto 18px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  card: {
    background: "white",
    border: "1px solid #e5dfd7",
    borderRadius: 14,
    padding: 18,
  },
  cardLabel: {
    display: "block",
    fontSize: 13,
    color: "#7b746c",
    marginBottom: 6,
  },
  cardValue: {
    display: "block",
    fontSize: 28,
  },
  panel: {
    maxWidth: 1180,
    margin: "0 auto",
    background: "white",
    border: "1px solid #e5dfd7",
    borderRadius: 16,
    overflow: "hidden",
  },
  toolbar: {
    padding: 16,
    borderBottom: "1px solid #ece7e1",
  },
  input: {
    width: "min(420px, 100%)",
    border: "1px solid #d8d1c8",
    borderRadius: 10,
    padding: "11px 13px",
    fontSize: 15,
    outline: "none",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 760,
  },
  th: {
    textAlign: "left",
    padding: "13px 16px",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#7b746c",
    background: "#faf8f5",
    borderBottom: "1px solid #ece7e1",
  },
  td: {
    padding: "14px 16px",
    borderBottom: "1px solid #f0ece7",
    fontSize: 14,
    verticalAlign: "middle",
  },
  badge: {
    display: "inline-block",
    padding: "5px 8px",
    borderRadius: 999,
    background: "#f1eee9",
    fontSize: 12,
    fontWeight: 700,
  },
  empty: {
    padding: 32,
    textAlign: "center",
    color: "#7b746c",
  },
  error: {
    margin: 16,
    padding: 14,
    borderRadius: 10,
    background: "#fff2f0",
    color: "#a33a2b",
    border: "1px solid #f0c8c1",
  },
};
