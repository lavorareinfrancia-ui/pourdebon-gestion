import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type AnyRecord = Record<string, unknown>;

type NormalizedProduct = {
  ids: string[];
  title: string | null;
};

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectCandidates(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  const preferredKeys = ["products", "items", "data", "content", "results"];
  for (const key of preferredKeys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value) && value.some(isRecord)) return value;
  }

  return [];
}

function titleFromAttributes(record: AnyRecord): string | null {
  const attrs = record.attributes;
  if (!Array.isArray(attrs)) return null;

  const preferredIds = new Set([
    "title",
    "product_title",
    "product_name",
    "name",
    "label",
    "nom",
  ]);

  for (const attr of attrs) {
    if (!isRecord(attr)) continue;
    const id = stringValue(attr.id) ?? stringValue(attr.code) ?? stringValue(attr.name);
    const value = stringValue(attr.value) ?? stringValue(attr.label);
    if (id && value && preferredIds.has(id.toLowerCase())) return value;
  }

  return null;
}

function normalizeProduct(item: unknown): NormalizedProduct | null {
  if (!isRecord(item)) return null;

  const nested = isRecord(item.data) ? item.data : item;

  const title =
    stringValue(nested.title) ??
    stringValue(nested.product_title) ??
    stringValue(nested.product_name) ??
    stringValue(nested.name) ??
    stringValue(nested.label) ??
    titleFromAttributes(nested);

  const ids = new Set<string>();
  for (const key of [
    "product_sku",
    "shop_sku",
    "sku",
    "product_id",
    "id",
    "product_reference",
  ]) {
    const value = stringValue(nested[key]);
    if (value) ids.add(value);
  }

  const identifiers = nested.identifiers;
  if (Array.isArray(identifiers)) {
    for (const identifier of identifiers) {
      if (!isRecord(identifier)) continue;
      const value = stringValue(identifier.value);
      if (value) ids.add(value);
    }
  }

  if (!title && ids.size === 0) return null;

  return { ids: [...ids], title };
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.POURDEBON_API_KEY;
  const baseUrl = process.env.POURDEBON_BASE_URL;

  if (!apiKey) {
    return NextResponse.json({ error: "POURDEBON_API_KEY is not configured" }, { status: 503 });
  }

  if (!baseUrl) {
    return NextResponse.json({ error: "POURDEBON_BASE_URL is not configured" }, { status: 503 });
  }

  const url = new URL("/api/products", baseUrl);
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    url.searchParams.append(key, value);
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
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
          error: "Pourdebon/Mirakl products request failed",
          upstreamStatus: response.status,
          upstreamStatusText: response.statusText,
          details: payload,
        },
        { status: 502 }
      );
    }

    const products = collectCandidates(payload)
      .map(normalizeProduct)
      .filter((product): product is NormalizedProduct => product !== null);

    return NextResponse.json({
      count: products.length,
      products,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to contact Pourdebon/Mirakl products endpoint",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
