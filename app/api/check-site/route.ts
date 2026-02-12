import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const { url } = await req.json();

        if (!url) {
            return NextResponse.json(
                { success: false, message: "URL is required" },
                { status: 400 }
            );
        }

        const response = await fetch(url, {
            method: "GET",
            redirect: "follow",
        });

        const xFrameOptions = response.headers.get("x-frame-options");
        const csp = response.headers.get("content-security-policy");

        let canEmbed = true;
        let reason = "Allowed";

        // Check X-Frame-Options
        if (xFrameOptions) {
            const value = xFrameOptions.toLowerCase();
            if (value.includes("deny") || value.includes("sameorigin")) {
                canEmbed = false;
                reason = `Blocked by X-Frame-Options: ${xFrameOptions}`;
            }
        }

        // Check CSP frame-ancestors
        if (csp && csp.includes("frame-ancestors")) {
            const lowerCsp = csp.toLowerCase();
            if (
                lowerCsp.includes("frame-ancestors 'none'") ||
                lowerCsp.includes("frame-ancestors 'self'")
            ) {
                canEmbed = false;
                reason = `Blocked by CSP: frame-ancestors restriction`;
            }
        }

        return NextResponse.json({
            success: true,
            canEmbed,
            reason,
            headers: {
                xFrameOptions,
                contentSecurityPolicy: csp,
            },
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            message: "Failed to fetch site",
            error: error.message,
        });
    }
}
