import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SHOP_BASE = "https://shop.pastapiemonte.com/wp-json/wc/store/v1/products";
const SHOP_PRODUCTS_URL = `${SHOP_BASE}?per_page=100`;
const SHOP_VARIATIONS_URL = `${SHOP_BASE}?type=variation&per_page=100`;

type WooProduct = {
  id?: number;
  name?: string;
  slug?: string;
  variation?: string;
  sku?: string;
  permalink?: string;
  description?: string;
  short_description?: string;
  prices?: {
    price?: string;
    regular_price?: string;
    sale_price?: string;
    currency_code?: string;
    currency_minor_unit?: number;
  };
  categories?: Array<{ id?: number; name?: string; slug?: string }>;
  _links?: {
    up?: Array<{ href?: string }>;
  };
};

function toAmount(value: string | undefined, minorUnit: number | undefined) {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const divisor = 10 ** (minorUnit ?? 2);
  return numeric / divisor;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parentIdFromVariation(product: WooProduct) {
  const href = product._links?.up?.[0]?.href;
  if (!href) return null;
  const match = href.match(/\/products\/(\d+)(?:\/|\?|$)/);
  return match ? Number(match[1]) : null;
}

function isFreshPasta400(product: WooProduct, parent?: WooProduct | null) {
  const source = parent ?? product;
  const categories = Array.isArray(source.categories)
    ? source.categories.map((category) => `${category.name ?? ""} ${category.slug ?? ""}`).join(" ")
    : "";
  const text = normalize(`${source.name ?? ""} ${source.slug ?? ""} ${source.sku ?? ""} ${categories}`);
  const isFresh = text.includes("fraiche") || text.includes("frais") || text.includes("retrait");
  const isPasta = text.includes("tagliatelle") || text.includes("pappardelle") || text.includes("tagliolini") || text.includes("tajarin");
  const hasExplicitWeight = /\b(400|500|750|1000)\b/.test(text) || /\b1\s*kg\b/.test(text);
  return isFresh && isPasta && !hasExplicitWeight;
}

function normalizeProduct(product: WooProduct, parent?: WooProduct | null) {
  const minorUnit = product.prices?.currency_minor_unit ?? parent?.prices?.currency_minor_unit ?? 2;
  const variation = product.variation?.trim() || null;
  const parentName = parent?.name?.trim() || null;
  const isVariation = Boolean(variation) || Boolean(parent);
  const rawDisplayName = isVariation
    ? [parentName ?? product.name ?? null, variation].filter(Boolean).join(" – ")
    : product.name ?? null;
  const displayName = rawDisplayName && isFreshPasta400(product, parent)
    ? `${rawDisplayName} – 400 g`
    : rawDisplayName;

  const categories = Array.isArray(parent?.categories)
    ? parent!.categories!.map((category) => category.name).filter((value): value is string => Boolean(value))
    : Array.isArray(product.categories)
      ? product.categories.map((category) => category.name).filter((value): value is string => Boolean(value))
      : [];

  return {
    id: product.id ?? null,
    parent_id: parent?.id ?? null,
    is_variation: isVariation,
    name: displayName,
    parent_name: parentName,
    variation,
    slug: product.slug ?? null,
    sku: product.sku ?? null,
    permalink: product.permalink ?? parent?.permalink ?? null,
    description: product.description ?? parent?.description ?? null,
    short_description: product.short_description ?? parent?.short_description ?? null,
    price: toAmount(product.prices?.price, minorUnit),
    regular_price: toAmount(product.prices?.regular_price, minorUnit),
    sale_price: toAmount(product.prices?.sale_price, minorUnit),
    currency: product.prices?.currency_code ?? parent?.prices?.currency_code ?? "EUR",
    categories,
  };
}

export async function GET() {
  try {
    const [productsResponse, variationsResponse] = await Promise.all([
      fetch(SHOP_PRODUCTS_URL, { headers: { Accept: "application/json" }, cache: "no-store" }),
      fetch(SHOP_VARIATIONS_URL, { headers: { Accept: "application/json" }, cache: "no-store" }),
    ]);

    const productsPayload = await productsResponse.json().catch(() => null) as WooProduct[] | null;
    const variationsPayload = await variationsResponse.json().catch(() => null) as WooProduct[] | null;

    if (!productsResponse.ok || !Array.isArray(productsPayload)) {
      return NextResponse.json(
        { error: "Impossible de lire le catalogue WooCommerce", upstreamStatus: productsResponse.status },
        { status: 502 },
      );
    }

    if (!variationsResponse.ok || !Array.isArray(variationsPayload)) {
      return NextResponse.json(
        { error: "Impossible de lire les variations WooCommerce", upstreamStatus: variationsResponse.status },
        { status: 502 },
      );
    }

    const parentById = new Map<number, WooProduct>();
    for (const product of productsPayload) {
      if (typeof product.id === "number") parentById.set(product.id, product);
    }

    const parents = productsPayload.map((product) => normalizeProduct(product));
    const variations = variationsPayload.map((variation) => {
      const parentId = parentIdFromVariation(variation);
      const parent = parentId != null ? parentById.get(parentId) ?? null : null;
      return normalizeProduct(variation, parent);
    });

    const products = [...parents, ...variations];

    return NextResponse.json({
      source: "shop.pastapiemonte.com WooCommerce Store API",
      count: products.length,
      parent_count: parents.length,
      variation_count: variations.length,
      products,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Erreur pendant la lecture du catalogue WooCommerce",
        message: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 502 },
    );
  }
}
