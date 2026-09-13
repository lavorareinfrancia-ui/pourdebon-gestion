import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type MiraklOffer = {
  shop_sku?: string;
  product_sku?: string;
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
