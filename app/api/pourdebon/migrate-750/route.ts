import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RawOffer = Record<string, any>;
type ProductReference = { type?: string; reference_type?: string; product_id_type?: string; value?: string; reference?: string; product_id?: string };

function normalize(value: unknown) {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function isPro(value: unknown) { return /(^|\s)pro(\s|$)/i.test(normalize(value)); }
function isProSku(value: unknown) {
  const raw = String(value ?? "").toUpperCase().replace(/\s+/g, "");
  return /(?:^|[-_])PRO(?:$|[-_]|\d|1KG|1000|750)/.test(raw) || /PRO1KG|PRO1000|PRO750/.test(raw);
}
function isKnownRavioliFamily(offer: RawOffer) {
  const text = normalize(`${offer.product_title ?? ""} ${offer.shop_sku ?? ""} ${offer.product_sku ?? ""}`);
  return ["ravioli","agnolotti","piemont","ricotta","epinard","roero","noisette","tome","toma","tradition"].some((token) => text.includes(token));
}
function isEligible750(offer: RawOffer) {
  const title = normalize(offer.product_title);
  const sku = String(offer.shop_sku ?? "");
  const productSku = String(offer.product_sku ?? "");
  const allText = `${offer.product_title ?? ""} ${sku} ${productSku}`;
  return /1\s*kg/i.test(sku) && !title.includes("citron") && !isPro(allText) && !isProSku(sku) && !isProSku(productSku) && isKnownRavioliFamily(offer);
}
function suggestedSku(oldSku: string) {
  return oldSku.replace(/1\s*kg/gi, "750").replace(/1000/gi, "750").replace(/--+/g, "-").replace(/^-|-$/g, "");
}
function getProductReference(offer: RawOffer) {
  const references = Array.isArray(offer.product_references) ? offer.product_references as ProductReference[] : [];
  for (const wanted of ["EAN","GTIN","UPC","ISBN","SHOP_SKU","SKU"]) {
    const ref = references.find((item) => {
      const type = String(item.type ?? item.reference_type ?? item.product_id_type ?? "").toUpperCase();
      const value = String(item.value ?? item.reference ?? item.product_id ?? "").trim();
      return type === wanted && value.length > 0;
    });
    if (ref) return { type: String(ref.type ?? ref.reference_type ?? ref.product_id_type).toUpperCase(), value: String(ref.value ?? ref.reference ?? ref.product_id) };
  }
  const productSku = String(offer.product_sku ?? "").trim();
  return productSku ? { type: "SKU", value: productSku } : null;
}

async function miraklFetch(path: string, init?: RequestInit) {
  const apiKey = process.env.POURDEBON_API_KEY;
  const baseUrl = process.env.POURDEBON_BASE_URL;
  if (!apiKey || !baseUrl) throw new Error("Configuration Pourdebon manquante");
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: { Authorization: apiKey, Accept: "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { response, payload };
}

async function getAllOffers() {
  const all: RawOffer[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const { response, payload } = await miraklFetch(`/api/offers?max=100&offset=${offset}`);
    if (!response.ok) throw new Error(`Lecture Mirakl impossible (${response.status})`);
    const batch = Array.isArray(payload?.offers) ? payload.offers as RawOffer[] : [];
    all.push(...batch);
    if (batch.length < 100) break;
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
async function findOfferBySku(sku: string) {
  const { response, payload } = await miraklFetch(`/api/offers?sku=${encodeURIComponent(sku)}&max=10&offset=0`);
  if (!response.ok) return null;
  const offers = Array.isArray(payload?.offers) ? payload.offers : [];
  return offers.find((offer: RawOffer) => String(offer.shop_sku ?? "") === sku) ?? null;
}

function channelSet(value: unknown) { return new Set(Array.isArray(value) ? value.map(String) : []); }
function sameChannels(a: unknown, b: unknown) {
  const left = channelSet(a), right = channelSet(b);
  return left.size === right.size && [...left].every((x) => right.has(x));
}
function logisticCode(offer: RawOffer) {
  return String(typeof offer.logistic_class === "object" ? offer.logistic_class?.code ?? "" : offer.logistic_class ?? "");
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).sort().join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
function configurationIssues(oldOffer: RawOffer, newOffer: RawOffer | null) {
  const issues: string[] = [];
  if (!newOffer) return ["nouvelle offre absente"];
  if (newOffer.active !== true) issues.push("active=false");
  if (!sameChannels(oldOffer.channels, newOffer.channels)) issues.push("canaux différents");
  if (Array.isArray(newOffer.inactivity_reasons) && newOffer.inactivity_reasons.length > 0) issues.push(`blocage: ${newOffer.inactivity_reasons.join(", ")}`);
  if (Number(oldOffer.quantity ?? 0) > 0 && Number(newOffer.quantity ?? 0) <= 0) issues.push("stock nul");
  if (String(oldOffer.state_code ?? "") !== String(newOffer.state_code ?? "")) issues.push("état différent");
  if (logisticCode(oldOffer) !== logisticCode(newOffer)) issues.push("classe logistique différente");
  if (stable(oldOffer.all_prices ?? []) !== stable(newOffer.all_prices ?? [])) issues.push("prix/canaux incomplets");
  if (stable(oldOffer.offer_additional_fields ?? []) !== stable(newOffer.offer_additional_fields ?? [])) issues.push("champs additionnels différents");
  if (Number(oldOffer.min_order_quantity ?? 1) !== Number(newOffer.min_order_quantity ?? 1)) issues.push("quantité minimum différente");
  if (Number(oldOffer.max_order_quantity ?? 0) !== Number(newOffer.max_order_quantity ?? 0)) issues.push("quantité maximum différente");
  if (Number(oldOffer.package_quantity ?? 1) !== Number(newOffer.package_quantity ?? 1)) issues.push("conditionnement différent");
  return issues;
}

function fullClone(oldOffer: RawOffer, newSku: string, productRef: { type: string; value: string }, quantityOverride?: number) {
  return {
    all_prices: Array.isArray(oldOffer.all_prices) ? oldOffer.all_prices : [],
    allow_quote_requests: Boolean(oldOffer.allow_quote_requests ?? false),
    available_ended: oldOffer.available_end_date ?? oldOffer.available_ended ?? null,
    available_started: oldOffer.available_start_date ?? oldOffer.available_started ?? null,
    description: oldOffer.description ?? "",
    discount: oldOffer.discount ?? null,
    eco_contributions: Array.isArray(oldOffer.eco_contributions) ? oldOffer.eco_contributions : [],
    internal_description: oldOffer.internal_description ?? "",
    leadtime_to_ship: Number(oldOffer.leadtime_to_ship ?? 0),
    logistic_class: logisticCode(oldOffer),
    max_order_quantity: Number(oldOffer.max_order_quantity ?? 0),
    min_order_quantity: Number(oldOffer.min_order_quantity ?? 1),
    min_quantity_alert: Number(oldOffer.min_quantity_alert ?? 0),
    offer_additional_fields: Array.isArray(oldOffer.offer_additional_fields) ? oldOffer.offer_additional_fields : [],
    package_quantity: Number(oldOffer.package_quantity ?? 1),
    price: Number(oldOffer.price ?? 0),
    price_additional_info: oldOffer.price_additional_info ?? "",
    pricing_unit: oldOffer.pricing_unit ?? "",
    product_id: productRef.value,
    product_id_type: productRef.type,
    product_tax_code: oldOffer.product_tax_code ?? "",
    quantity: quantityOverride ?? Number(oldOffer.quantity ?? 0),
    shop_sku: newSku,
    state_code: String(oldOffer.state_code ?? "11"),
    update_delete: "update",
  };
}

async function sleep(ms: number) { await new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitImport(importId: string) {
  let tracking: any = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await sleep(800);
    const { response, payload } = await miraklFetch(`/api/offers/imports/${encodeURIComponent(importId)}`);
    if (response.ok) tracking = payload;
    const status = String(tracking?.status ?? tracking?.import?.status ?? "").toUpperCase();
    if (status === "COMPLETE" || status === "FAILED") break;
  }
  return tracking?.import ?? tracking ?? {};
}

async function pushOffer(offerPayload: RawOffer) {
  const { response, payload } = await miraklFetch("/api/offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offers: [offerPayload] }),
  });
  if (!response.ok) return { ok: false, response, payload, importId: "", info: {} as any };
  const importId = String(payload?.import_id ?? "").trim();
  const info = importId ? await waitImport(importId) : {};
  return { ok: true, response, payload, importId, info };
}

export async function GET() {
  try {
    const offers = await getAllOffers();
    const bySku = new Map(offers.map((offer) => [String(offer.shop_sku ?? ""), offer]));
    const candidates = offers.filter(isEligible750).map((offer) => {
      const oldSku = String(offer.shop_sku ?? "");
      const newSku = suggestedSku(oldSku);
      const current = bySku.get(newSku) ?? null;
      const issues = configurationIssues(offer, current);
      return {
        title: offer.product_title ?? null,
        old_sku: oldSku || null,
        new_sku: newSku || null,
        product_sku: offer.product_sku ?? null,
        price: offer.price ?? null,
        quantity: offer.quantity ?? null,
        state_code: offer.state_code ?? null,
        new_exists: issues.length === 0,
        new_present: Boolean(current),
        new_active: current?.active ?? false,
        new_channels: current?.channels ?? [],
        old_channels: offer.channels ?? [],
        inactivity_reasons: current?.inactivity_reasons ?? [],
        configuration_issues: issues,
        new_price: current?.price ?? null,
        new_quantity: current?.quantity ?? null,
        new_state_code: current?.state_code ?? null,
        roero_zero_test_available: oldSku.toUpperCase() === "ROERO-1KG" && Boolean(current) && Number(current?.quantity ?? 0) > 0 && Number(offer.quantity ?? 0) > 0,
      };
    });
    return NextResponse.json({ candidates, offer_count: offers.length, note: "Le champ active de Mirakl prouve un état API, pas à lui seul la visibilité dans le filtre BtoC du back-office Pourdebon." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur inconnue" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { oldSku?: string; newSku?: string; action?: string } | null;
    const oldSku = String(body?.oldSku ?? "").trim();
    const newSku = String(body?.newSku ?? "").trim();
    const action = String(body?.action ?? "sync").trim();
    if (!oldSku || !newSku) return NextResponse.json({ error: "oldSku et newSku sont obligatoires" }, { status: 400 });
    if (!/750/i.test(newSku) || /1\s*kg/i.test(newSku)) return NextResponse.json({ error: "Le nouveau SKU doit clairement identifier 750 g" }, { status: 400 });

    const oldOffer = await getOfferBySku(oldSku);
    if (!isEligible750(oldOffer)) return NextResponse.json({ error: "Cette offre n'est pas une référence ravioli 750 g migrable" }, { status: 400 });
    const productRef = getProductReference(oldOffer);
    if (!productRef) return NextResponse.json({ error: "Impossible d'identifier de façon sûre le produit Mirakl associé" }, { status: 409 });

    if (action === "zero-old-roero") {
      if (oldSku.toUpperCase() !== "ROERO-1KG" || newSku.toUpperCase() !== "ROERO-750") {
        return NextResponse.json({ error: "Test stock zéro autorisé uniquement pour ROERO-1kg → ROERO-750" }, { status: 403 });
      }
      const newOffer = await findOfferBySku(newSku);
      if (!newOffer || newOffer.active !== true || Number(newOffer.quantity ?? 0) <= 0) {
        return NextResponse.json({ error: "Sécurité: ROERO-750 doit exister, être active via API et avoir du stock avant de mettre l'ancienne référence à zéro" }, { status: 409 });
      }
      if (String(newOffer.product_sku ?? "") !== String(oldOffer.product_sku ?? "")) {
        return NextResponse.json({ error: "Sécurité: les deux références ne pointent pas vers le même produit Mirakl" }, { status: 409 });
      }

      const previousQuantity = Number(oldOffer.quantity ?? 0);
      const result = await pushOffer(fullClone(oldOffer, oldSku, productRef, 0));
      if (!result.ok) return NextResponse.json({ error: "Mise à zéro ROERO refusée par Mirakl", upstreamStatus: result.response.status, details: result.payload }, { status: 502 });
      const linesError = Number(result.info?.lines_in_error ?? 0);
      if (String(result.info?.status ?? "").toUpperCase() === "FAILED" || linesError > 0) {
        return NextResponse.json({ error: "Mirakl a refusé la mise à zéro de ROERO-1kg", import_id: result.importId, details: result.info }, { status: 409 });
      }
      await sleep(1200);
      const oldAfter = await findOfferBySku(oldSku);
      const confirmedZero = Number(oldAfter?.quantity ?? -1) === 0;
      return NextResponse.json({
        accepted: true,
        action,
        import_id: result.importId || null,
        old_sku: oldSku,
        new_sku: newSku,
        previous_quantity: previousQuantity,
        old_quantity: oldAfter?.quantity ?? null,
        new_quantity: newOffer.quantity ?? null,
        confirmed_zero: confirmedZero,
        note: confirmedZero
          ? "ROERO-1kg est maintenant à stock 0. Vérifier si ROERO-750 apparaît dans le back-office BtoC Pourdebon."
          : "La demande a été acceptée mais le stock 0 n'est pas encore confirmé par l'API; attendre la fin du traitement Mirakl.",
      });
    }

    const before = await findOfferBySku(newSku);
    const result = await pushOffer(fullClone(oldOffer, newSku, productRef));
    if (!result.ok) return NextResponse.json({ error: "Mise à jour OF24 refusée par Mirakl", upstreamStatus: result.response.status, details: result.payload }, { status: 502 });

    const linesError = Number(result.info?.lines_in_error ?? 0);
    if (String(result.info?.status ?? "").toUpperCase() === "FAILED" || linesError > 0) {
      return NextResponse.json({ error: "Mirakl a refusé la synchronisation de l'offre", import_id: result.importId, details: result.info }, { status: 409 });
    }

    await sleep(1200);
    const after = await findOfferBySku(newSku);
    const issues = configurationIssues(oldOffer, after);
    return NextResponse.json({
      accepted: true,
      mode: before ? "repair" : "create",
      import_id: result.importId || null,
      created: Boolean(after),
      ready: issues.length === 0,
      active: after?.active ?? false,
      channels: after?.channels ?? [],
      old_channels: oldOffer.channels ?? [],
      inactivity_reasons: after?.inactivity_reasons ?? [],
      configuration_issues: issues,
      old_sku: oldSku,
      new_sku: newSku,
      note: issues.length === 0
        ? "La configuration API est alignée. La visibilité BtoC doit encore être confirmée dans le back-office Pourdebon."
        : `Synchronisation incomplète: ${issues.join(", ")}`,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur inconnue" }, { status: 500 });
  }
}