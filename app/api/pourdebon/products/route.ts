import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

    return NextResponse.json(payload);
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
