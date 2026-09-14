import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PriceUpdate = {
  sku: string;
  price: number;
};

type MiraklOffer = {
  shop_sku?: string;
  all_prices?: Array<Record<string, unknown>>;
  discount?: Record<string, unknown> | null;
  applicable_pricing?: Record<string, unknown> | null;
  [key: string]: unknown;
};

function hasActiveOrSpecialPricing(offer: MiraklOffer) {
  const allPrices = Array.isArray(offer.all_prices) ? offer.all_prices : [];
  if (allPrices.length > 1) return true;

  const pricing = offer.applicable_pricing;
  if (pricing && typeof pricing === "object") {
    const origin = Number(pricing.unit_origin_price ?? pricing.price ?? 0);
    const discount = Number(pricing.unit_discount_price ?? 0);
    if (discount > 0 && origin > 0 && discount < origin) return true;
  }

  const discount = offer.discount;
  if (discount && typeof discount === "object") {
    const price = Number(discount.price ?? 0);
    if (price > 0) return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.POURDEBON_API_KEY;
  const baseUrl = process.env.POURDEBON_BASE_URL;

  if (!apiKey || !baseUrl) {
    return NextResponse.json({ error: "Configuration Pourdebon incomplète" }, { status: 503 });
  }

  let body: { updates?: PriceUpdate[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (updates.length === 0 || updates.length > 20) {
    return NextResponse.json({ error: "Liste de mises à jour invalide" }, { status: 400 });
  }

  for (const update of updates) {
    if (!update?.sku || !Number.isFinite(update.price) || update.price <= 0) {
      return NextResponse.json({ error: "SKU ou prix invalide" }, { status: 400 });
    }
  }

  try {
    for (const update of updates) {
      const checkUrl = new URL("/api/offers", baseUrl);
      checkUrl.searchParams.set("sku", update.sku);
      checkUrl.searchParams.set("max", "10");
      checkUrl.searchParams.set("offset", "0");

      const checkResponse = await fetch(checkUrl, {
        headers: { Authorization: apiKey, Accept: "application/json" },
        cache: "no-store",
      });

      const checkPayload = await checkResponse.json().catch(() => null) as { offers?: MiraklOffer[] } | null;
      if (!checkResponse.ok) {
        return NextResponse.json({
          error: `Impossible de vérifier l'offre ${update.sku}`,
          upstreamStatus: checkResponse.status,
          details: checkPayload,
        }, { status: 502 });
      }

      const matches = (checkPayload?.offers ?? []).filter((offer) => offer.shop_sku === update.sku);
      if (matches.length !== 1) {
        return NextResponse.json({ error: `Offre ${update.sku} introuvable ou ambiguë` }, { status: 409 });
      }

      if (hasActiveOrSpecialPricing(matches[0])) {
        return NextResponse.json({
          error: `L'offre ${update.sku} possède une promotion ou une tarification spéciale. Mise à jour bloquée pour éviter d'effacer un prix existant.`
        }, { status: 409 });
      }
    }

    const header = '"offer-sku";"price";"discount-price";"discount-start-date";"discount-end-date"';
    const lines = updates.map((update) =>
      `"${update.sku.replaceAll('"', '""')}";"${update.price.toFixed(2)}";"";"";""`
    );
    const csv = [header, ...lines].join("\n");

    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv;charset=utf-8" }), "prices.csv");

    const importUrl = new URL("/api/offers/pricing/imports", baseUrl);
    const response = await fetch(importUrl, {
      method: "POST",
      headers: { Authorization: apiKey, Accept: "application/json" },
      body: form,
      cache: "no-store",
    });

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      return NextResponse.json({
        error: "L'import des prix Pourdebon a échoué",
        upstreamStatus: response.status,
        details: payload,
      }, { status: 502 });
    }

    return NextResponse.json({ ok: true, import: payload, updates });
  } catch (error) {
    return NextResponse.json({
      error: "Erreur pendant la mise à jour des prix",
      message: error instanceof Error ? error.message : "Erreur inconnue",
    }, { status: 502 });
  }
}
