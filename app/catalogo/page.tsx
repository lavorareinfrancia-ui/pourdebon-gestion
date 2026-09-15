"use client";

import { useEffect, useMemo, useState } from "react";

type Offer = {
  shop_sku: string | null;
  product_sku: string | null;
  product_title: string | null;
  price: number | null;
  quantity: number | null;
};

type WooProduct = {
  id: number | null;
  is_variation?: boolean;
  name: string | null;
  parent_name?: string | null;
  variation?: string | null;
  sku: string | null;
  price: number | null;
  categories: string[];
};

type OffersResponse = { offers?: Offer[]; error?: string };
type ShopResponse = { products?: WooProduct[]; error?: string };

type Group = "pasta" | "risotto" | "sauce";

type Row = {
  offer: Offer;
  group: Group;
  woo: WooProduct | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isPro(value: string | null | undefined) {
  return /(^|\s)pro(\s|$)/i.test(normalize(value));
}

function classify(value: string | null | undefined): Group | null {
  const t = normalize(value);
  if (t.includes("risotto") || t.includes("risotti")) return "risotto";
  if (t.includes("sauce") || t.includes("sugo") || t.includes("salsa") || t.includes("pesto") || t.includes("condiment")) return "sauce";
  if (t.includes("tagliatelle") || t.includes("pappardelle") || t.includes("tagliolini") || t.includes("tajarin")) return "pasta";
  return null;
}

function tokenScore(a: string, b: string) {
  const stop = new Set(["bio", "aux", "avec", "pour", "les", "des", "the", "and", "pasta", "piemonte", "poids", "grammes", "gramme", "frais", "fraiche", "fraiches", "seche", "sechee", "deshydratee", "deshydrates"]);
  const left = new Set(normalize(a).split(" ").filter((x) => x.length >= 4 && !stop.has(x) && !/^\d+$/.test(x)));
  const right = new Set(normalize(b).split(" ").filter((x) => x.length >= 4 && !stop.has(x) && !/^\d+$/.test(x)));
  let score = 0;
  for (const token of left) if (right.has(token)) score += 1;
  return score;
}

function wooText(p: WooProduct) {
  return `${p.parent_name ?? ""} ${p.name ?? ""} ${p.variation ?? ""} ${p.sku ?? ""} ${(p.categories ?? []).join(" ")}`;
}

function findWoo(offer: Offer, products: WooProduct[], group: Group) {
  const title = `${offer.product_title ?? ""} ${offer.shop_sku ?? ""}`;
  const candidates = products
    .filter((p) => !isPro(p.name) && !isPro(p.sku) && p.price != null && classify(wooText(p)) === group)
    .map((p) => ({ p, score: tokenScore(title, wooText(p)) }))
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0].p;
  if (candidates[0].score > 0 && candidates[0].score > candidates[1].score) return candidates[0].p;
  return null;
}

function money(value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)} €`;
}

export default function CatalogoPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<WooProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [a, b] = await Promise.all([
        fetch("/api/pourdebon/offers?max=100&offset=0", { cache: "no-store" }),
        fetch("/api/shop/products", { cache: "no-store" }),
      ]);
      const ad = (await a.json()) as OffersResponse;
      const bd = (await b.json()) as ShopResponse;
      if (!a.ok) throw new Error(ad.error || "Erreur Pourdebon");
      if (!b.ok) throw new Error(bd.error || "Erreur WooCommerce");
      setOffers(Array.isArray(ad.offers) ? ad.offers : []);
      setProducts(Array.isArray(bd.products) ? bd.products : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const rows = useMemo<Row[]>(() => {
    const result: Row[] = [];
    for (const offer of offers) {
      if (isPro(offer.product_title) || isPro(offer.shop_sku)) continue;
      const group = classify(`${offer.product_title ?? ""} ${offer.shop_sku ?? ""}`);
      if (!group) continue;
      result.push({ offer, group, woo: findWoo(offer, products, group) });
    }
    return result.sort((a, b) => (a.offer.product_title ?? "").localeCompare(b.offer.product_title ?? ""));
  }, [offers, products]);

  const groups: Array<{ key: Group; label: string }> = [
    { key: "pasta", label: "Pasta" },
    { key: "risotto", label: "Risotti" },
    { key: "sauce", label: "Sughi & condimenti" },
  ];

  return (
    <main style={{ minHeight: "100vh", background: "#f6f3ee", padding: "28px 18px 56px", fontFamily: "Arial, Helvetica, sans-serif", color: "#26231f" }}>
      <section style={{ maxWidth: 1120, margin: "0 auto 20px", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#7a6654" }}>Pasta Piemonte · Pourdebon</div>
          <h1 style={{ margin: "7px 0 0", fontSize: 36 }}>Catalogo prezzi</h1>
          <p style={{ margin: "9px 0 0", color: "#6e675f", fontSize: 14 }}>Pasta fresca e secca, risotti e sughi. Referenze PRO escluse. Il prezzo boutique arriva da WooCommerce; se il match non è certo, resta “Da associare”.</p>
        </div>
        <button onClick={load} disabled={loading} style={{ border: "1px solid #cfc7bd", borderRadius: 9, background: "white", padding: "10px 15px", fontWeight: 700 }}>{loading ? "Aggiornamento…" : "Aggiorna"}</button>
      </section>

      {error && <section style={{ maxWidth: 1120, margin: "0 auto 14px", padding: 12, borderRadius: 9, background: "#fff2f0", color: "#a33a2b", border: "1px solid #f0c8c1" }}>{error}</section>}

      {groups.map(({ key, label }) => {
        const items = rows.filter((r) => r.group === key);
        return (
          <section key={key} style={{ maxWidth: 1120, margin: "0 auto 24px" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 22 }}>{label} <span style={{ fontSize: 13, color: "#746d65", fontWeight: 500 }}>({items.length})</span></h2>
            {!items.length ? (
              <div style={{ background: "white", border: "1px solid #e5dfd7", borderRadius: 12, padding: 14, color: "#746d65" }}>Nessuna referenza Pourdebon riconosciuta in questo gruppo.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {items.map((row, i) => (
                  <article key={`${row.offer.shop_sku ?? row.offer.product_sku ?? i}`} style={{ background: "white", border: "1px solid #e5dfd7", borderRadius: 12, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{row.offer.product_title ?? "—"}</div>
                        <div style={{ marginTop: 5, fontSize: 12, color: "#6d655d" }}>SKU Pourdebon: <strong>{row.offer.shop_sku ?? "—"}</strong></div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#6d655d" }}>WooCommerce: {row.woo ? `${row.woo.parent_name ?? row.woo.name ?? "—"}${row.woo.variation ? ` · ${row.woo.variation}` : ""}${row.woo.sku ? ` · SKU ${row.woo.sku}` : ""}` : "Da associare"}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 135, background: "#faf8f5", border: "1px solid #eee8e1", borderRadius: 9, padding: 10 }}><div style={{ fontSize: 10, color: "#756d65", textTransform: "uppercase" }}>Pourdebon TTC</div><strong style={{ display: "block", marginTop: 5 }}>{money(row.offer.price)}</strong></div>
                        <div style={{ minWidth: 135, background: "#faf8f5", border: "1px solid #eee8e1", borderRadius: 9, padding: 10 }}><div style={{ fontSize: 10, color: "#756d65", textTransform: "uppercase" }}>Boutique TTC</div><strong style={{ display: "block", marginTop: 5 }}>{money(row.woo?.price ?? null)}</strong></div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
