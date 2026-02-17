import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  let formatted = url.trim();
  if (!formatted.startsWith("http://") && !formatted.startsWith("https://")) {
    formatted = "https://" + formatted;
  }

  try {
    const res = await fetch(formatted, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: {
        // Pretend to be a real browser so sites don't reject the request
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const xFrameOptions = res.headers.get("x-frame-options") || "";
    const csp = res.headers.get("content-security-policy") || "";

    const xFrameBlocked =
      xFrameOptions.toLowerCase().includes("deny") ||
      xFrameOptions.toLowerCase().includes("sameorigin");

    const cspBlocked =
      csp.toLowerCase().includes("frame-ancestors 'none'") ||
      (csp.toLowerCase().includes("frame-ancestors") &&
        !csp.toLowerCase().includes("frame-ancestors *"));

    const canEmbed = !xFrameBlocked && !cspBlocked;

    return NextResponse.json({
      canEmbed,
      reason: xFrameBlocked
        ? `X-Frame-Options: ${xFrameOptions}`
        : cspBlocked
        ? `CSP: ${csp}`
        : "allowed",
      status: res.status,
      url: formatted,
    });

  } catch (err: any) {
    return NextResponse.json({
      canEmbed: false,
      reason: `Unreachable: ${err.message}`,
      url: formatted,
    });
  }
}