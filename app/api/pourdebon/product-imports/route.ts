import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const apiKey = process.env.POURDEBON_API_KEY;
  const baseUrl = process.env.POURDEBON_BASE_URL;

  if (!apiKey || !baseUrl) {
    return NextResponse.json({ error: "Configuration Pourdebon incomplète" }, { status: 503 });
  }

  const importId = request.nextUrl.searchParams.get("import_id");
  const transformed = request.nextUrl.searchParams.get("transformed") === "1";

  try {
    const url = importId
      ? new URL(`/api/products/imports/${encodeURIComponent(importId)}${transformed ? "/transformed_file" : ""}`, baseUrl)
      : new URL("/api/products/imports", baseUrl);

    if (!importId) {
      url.searchParams.set("max", "20");
      url.searchParams.set("offset", "0");
    }

    const response = await fetch(url, {
      headers: { Authorization: apiKey, Accept: transformed ? "*/*" : "application/json" },
      cache: "no-store",
    });

    if (transformed) {
      const buffer = await response.arrayBuffer();
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      if (!response.ok) {
        return NextResponse.json({ error: "Impossible de lire le fichier transformé", upstreamStatus: response.status, details: text.slice(0, 4000) }, { status: 502 });
      }
      return new NextResponse(text, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json({ error: "Impossible de lire les imports produit", upstreamStatus: response.status, details: payload }, { status: 502 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: "Erreur pendant la lecture des imports produit", message: error instanceof Error ? error.message : "Erreur inconnue" }, { status: 502 });
  }
}
