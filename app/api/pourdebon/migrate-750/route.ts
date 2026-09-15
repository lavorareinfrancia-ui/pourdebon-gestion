import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RawOffer = Record<string, any>;

type ProductReference = {
  type?: string;
  reference_type?: string;
  product_id_type?: string;
  value?: string;
  reference?: string;
  product_id?: string;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isPro(value: unknown) {
  return /(^|\s)pro(\s|$)/i.test(normalize(value));
}

function isProSku(value: unknown) {
  const raw = String(value ?? "").toUpperCase().replace(/\s+/g, "");
  return /(?:^|[-_])PRO(?:$|[-_]|\d|1KG|1000|750)/.test(raw) || /PRO1KG|PRO1000|PRO750/.test(raw);
}

function isKnownRavioliFamily(offer: RawOffer) {
  const text = normalize(`${offer.product_title ?? ""} ${offer.shop_sku ?? ""} ${offer.product_sku ?? ""}`);
  return [
    "ravioli",
    "agnolotti",
    "piemont",
    "ricotta",
    "epinard",
    "roero",
    "noisette",
    "tome",
    "toma",
    "tradition",
  ].some((token) => text.includes(token));
}

function isEligible750(offer: RawOffer) {
  const title = normalize(offer.product_title);
  const sku = String(offer.shop_sku ?? "");
  const productSku = String(offer.product_sku ?? "");
  const allText = `${offer.product_title ?? ""} ${sku} ${productSku}`;

  return (
    /1\s*kg/i.test(sku) &&
    !title.includes("citron") &&
    !isPro(allText) &&
    !isProSku(sku) &&
    !isProSku(productSku) &&
    isKnownRavioliFamily(offer)
  );
}

function suggestedSku(oldSku: string) {
  return oldSku
    .replace(/1\s*kg/gi, "750")
    .replace(/1000/gi, "750")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "");
}

function getProductReference(offer: RawOffer) {
  const references = Array.isArray(offer.product_references)
    ? (offer.product_references as ProductReference[])
    : [];

  const priority = ["SHOP_SKU", "EAN", "GTIN", "UPC", "ISBN"];

  for (const wanted of priority) {
    const ref = references.find((item) => {
      const type = String(item.type ?? item.reference_type ?? item.product_id_type ?? "").toUpperCase();
      const value = String(item.value ?? item.reference ?? item.product_id ?? "").trim();
      return type === wanted && value.length > 0;
    });
    if (ref) {
      return {
        type: String(ref.type ?? ref.reference_type ?? ref.product_id_type).toUpperCase(),
        value: String(ref.value ?? ref.reference ?? ref.product_id),
      };
    }
  }

  const productSku = String(offer.product_sku ?? "").trim();
  if (productSku) return { type: "SHOP_SKU", value: productSku };
  return null;
}

async function miraklFetch(path: string, init?: RequestInit) {
  const apiKey = process.env.POURDEBON_API_KEY;
  const baseUrl = process.env.POURDEBON_BASE_URL;
  if (!apiKey || !baseUrl) throw new Error("Configuration Pourdebon manquante");

  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: apiKey,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { response, payload };
}

async function getAllOffers() {
  const all: RawOffer[] = [];
  const max = 100;
  let offset = 0;

  for (let page = 0; page < 50; page += 1) {
    const { response, payload } = await miraklFetch(`/api/offers?max=${max}&offset=${offset}`);
    if (!response.ok) throw new Error(`Lecture Mirakl impossible (${response.status})`);
    const batch = Array.isArray(payload?.offers) ? payload.offers as RawOffer[] : [];
    all.push(...batch);
    if (batch.length < max) break;
    offset += max;
  }

  return all;
}

async function getOfferBySku(sku: string) {
  const { response, payload } = await miraklFetch(`/api/offers?sku=${encodeURIComponent(sku)}&max=10&offset=0`);
  if (!response.ok) throw new Error(`Lecture Mirakl impossible (${response.status})`);
  const offers = Array.isArray(payload?.offers) ? payload.offers : [];
  const exact = offers.filter((offer: RawOffer) => String(offer.shop_sku ?? "") === sku);
  if (exact.length !== 1) throw new Error(`SKU source non univoque: ${sku}`);
  return exact[0] as RawOffer;
}

export async function GET() {
  try {
    const offers = await getAllOffers();
    const bySku = new Map(offers.map((offer) => [String(offer.shop_sku ?? ""), offer]));

    const candidates = offers
      .filter(isEligible750)
      .map((offer: RawOffer) => {
        const oldSku = String(offer.shop_sku ?? "");
        const newSku = suggestedSku(oldSku);
        const created = bySku.get(newSku) ?? null;
        return {
          title: offer.product_title ?? null,
          old_sku: oldSku || null,
          new_sku: newSku || null,
          product_sku: offer.product_sku ?? null,
          price: offer.price ?? null,
          quantity: offer.quantity ?? null,
          state_code: offer.state_code ?? null,
          new_exists: Boolean(created),
          new_price: created?.price ?? null,
          new_quantity: created?.quantity ?? null,
          new_state_code: created?.state_code ?? null,
        };
      });

    return NextResponse.json({ candidates, offer_count: offers.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur inconnue" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { oldSku?: string; newSku?: string } | null;
    const oldSku = String(body?.oldSku ?? "").trim();
    const newSku = String(body?.newSku ?? "").trim();

    if (!oldSku || !newSku) {
      return NextResponse.json({ error: "oldSku et newSku sont obligatoires" }, { status: 400 });
    }
    if (!/750/i.test(newSku) || /1\s*kg/i.test(newSku)) {
      return NextResponse.json({ error: "Le nouveau SKU doit clairement identifier 750 g" }, { status: 400 });
    }

    const oldOffer = await getOfferBySku(oldSku);
    if (!isEligible750(oldOffer)) {
      return NextResponse.json({ error: "Cette offre n'est pas une référence ravioli 750 g migrable" }, { status: 400 });
    }

    const existing = await miraklFetch(`/api/offers?sku=${encodeURIComponent(newSku)}&max=10&offset=0`);
    const existingOffers = Array.isArray(existing.payload?.offers) ? existing.payload.offers : [];
    if (existingOffers.some((offer: RawOffer) => String(offer.shop_sku ?? "") === newSku)) {
      return NextResponse.json({ error: `Le SKU ${newSku} existe déjà` }, { status: 409 });
    }

    const productRef = getProductReference(oldOffer);
    if (!productRef) {
      return NextResponse.json({ error: "Impossible d'identifier de façon sûre le produit Mirakl associé" }, { status: 409 });
    }

    const logisticClass = typeof oldOffer.logistic_class === "object"
      ? oldOffer.logistic_class?.code
      : oldOffer.logistic_class;

    const clone = {
      shop_sku: newSku,
      product_id: productRef.value,
      product_id_type: productRef.type,
      description: oldOffer.description ?? "",
      internal_description: oldOffer.internal_description ?? "",
      price: Number(oldOffer.price ?? 0),
      quantity: Number(oldOffer.quantity ?? 0),
      min_quantity_alert: Number(oldOffer.min_quantity_alert ?? 0),
      state_code: String(oldOffer.state_code ?? "11"),
      leadtime_to_ship: Number(oldOffer.leadtime_to_ship ?? 0),
      min_order_quantity: Number(oldOffer.min_order_quantity ?? 1),
      max_order_quantity: Number(oldOffer.max_order_quantity ?? 0),
      package_quantity: Number(oldOffer.package_quantity ?? 1),
      price_additional_info: oldOffer.price_additional_info ?? "",
      product_tax_code: oldOffer.product_tax_code ?? "",
      logistic_class: logisticClass ?? "",
      allow_quote_requests: Boolean(oldOffer.allow_quote_requests ?? false),
      update_delete: "update",
    };

    const { response, payload } = await miraklFetch("/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offers: [clone] }),
    });

    if (!response.ok) {
      return NextResponse.json({
        error: "Création de la nouvelle offre refusée par Mirakl",
        upstreamStatus: response.status,
        details: payload,
      }, { status: 502 });
    }

    return NextResponse.json({
      accepted: true,
      import_id: payload?.import_id ?? null,
      old_sku: oldSku,
      new_sku: newSku,
      title: oldOffer.product_title ?? null,
      note: "L'ancienne offre reste active. Vérifier la nouvelle offre avant toute désactivation.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur inconnue" }, { status: 500 });
  }
}
