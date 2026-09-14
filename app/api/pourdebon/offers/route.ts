import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type MiraklOffer = {
  shop_sku?: string;
  product_sku?: string;
  product_title?: string;
  product_brand?: string;
  product_description?: string;
  price?: number;
  quantity?: number;
  state_code?: string;
  [key: string]: unknown;
};

type MiraklOffersResponse = {
  offers?: MiraklOffer[];
  total_count?: number;
  [key: string]: unknown;
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function auditTitle(offer: MiraklOffer) {
  const title = offer.product_title ?? null;
  if (!title) return null;

  const combined = normalize(`${title} ${offer.shop_sku ?? ""} ${offer.product_sku ?? ""}`);
  const hasWeight = /\b(?:400|500|750|1000)\b/.test(combined) || /\b1\s*kg\b/.test(combined);
  const freshLongPasta = combined.includes("tagliatelle") || combined.includes("pappardelle") || combined.includes("tagliolini") || combined.includes("tajarin");

  // Retail long fresh pasta is sold in 400 g packs. Some legacy Mirakl titles/SKUs omit the weight,
  // which caused the pricing audit to hide those offers entirely. This only enriches the local audit
  // label; it does not modify the Mirakl product itself.
  if (freshLongPasta && !hasWeight) return `${title} - 400 g`;
  return title;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.POURDEBON_API_KEY;
  const baseUrl = process.env.POURDEBON_BASE_URL;

  if (!apiKey) {
    return NextResponse.json(
      { error: "POURDEBON_API_KEY is not configured" },
      { status: 503 }
    );
  }

  if (!baseUrl) {
    return NextResponse.json(
      { error: "POURDEBON_BASE_URL is not configured" },
      { status: 503 }
    );
  }

  const requestedMax = Number(request.nextUrl.searchParams.get("max") ?? "100");
  const requestedOffset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
  const max = Number.isFinite(requestedMax) ? Math.min(Math.max(requestedMax, 1), 100) : 100;
  const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

  const url = new URL("/api/offers", baseUrl);
  url.searchParams.set("max", String(max));
  url.searchParams.set("offset", String(offset));

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: apiKey,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    const text = await response.text();
    let payload: unknown;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Pourdebon/Mirakl request failed",
          upstreamStatus: response.status,
          upstreamStatusText: response.statusText,
          details: payload
        },
        { status: 502 }
      );
    }

    const data = (payload ?? {}) as MiraklOffersResponse;
    const offers = Array.isArray(data.offers) ? data.offers : [];

    return NextResponse.json({
      source: "Pourdebon Mirakl OF21",
      total_count: data.total_count ?? offers.length,
      count: offers.length,
      max,
      offset,
      offers: offers.map((offer) => ({
        shop_sku: offer.shop_sku ?? null,
        product_sku: offer.product_sku ?? null,
        product_title: auditTitle(offer),
        product_brand: offer.product_brand ?? null,
        product_description: offer.product_description ?? null,
        price: offer.price ?? null,
        quantity: offer.quantity ?? null,
        state_code: offer.state_code ?? null
      }))
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to contact Pourdebon/Mirakl",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 502 }
    );
  }
}
