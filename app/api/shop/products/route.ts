import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SHOP_PRODUCTS_URL = "https://shop.pastapiemonte.com/wp-json/wc/store/v1/products?per_page=100";

type WooProduct = {
  id?: number;
  name?: string;
  slug?: string;
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
};

function toAmount(value: string | undefined, minorUnit: number | undefined) {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const divisor = 10 ** (minorUnit ?? 2);
  return numeric / divisor;
}

export async function GET() {
  try {
    const response = await fetch(SHOP_PRODUCTS_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null) as WooProduct[] | null;

    if (!response.ok || !Array.isArray(payload)) {
      return NextResponse.json(
        {
          error: "Impossible de lire le catalogue WooCommerce",
          upstreamStatus: response.status,
        },
        { status: 502 },
      );
    }

    const products = payload.map((product) => {
      const minorUnit = product.prices?.currency_minor_unit ?? 2;
      return {
        id: product.id ?? null,
        name: product.name ?? null,
        slug: product.slug ?? null,
        sku: product.sku ?? null,
        permalink: product.permalink ?? null,
        description: product.description ?? null,
        short_description: product.short_description ?? null,
        price: toAmount(product.prices?.price, minorUnit),
        regular_price: toAmount(product.prices?.regular_price, minorUnit),
        sale_price: toAmount(product.prices?.sale_price, minorUnit),
        currency: product.prices?.currency_code ?? "EUR",
        categories: Array.isArray(product.categories)
          ? product.categories.map((category) => category.name).filter(Boolean)
          : [],
      };
    });

    return NextResponse.json({
      source: "shop.pastapiemonte.com WooCommerce Store API",
      count: products.length,
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
