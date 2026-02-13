"use client";

import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [iframeUrl, setIframeUrl] = useState("");
  const [status, setStatus] = useState("");

  const handleLoad = async () => {
    if (!url) return;

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = "https://" + formattedUrl;
    }

    console.clear();
    console.log(`🔎 Checking if "${formattedUrl}" can be embedded...`);

    setStatus(`Checking: ${formattedUrl}`);
    setIframeUrl("");

    try {
      // Use a proxy that only returns headers (Faster than full content proxies)
      const proxyUrl = `https://api.hackertarget.com/httpheaders/?q=${encodeURIComponent(formattedUrl)}`;
      const res = await fetch(proxyUrl);
      const text = await res.text();

      if (!res.ok || text.includes("error")) {
        throw new Error("Failed to fetch headers");
      }

      const headers = text.toLowerCase();
      let canEmbed = true;
      let reason = "Allowed";

      // Detect X-Frame-Options
      if (headers.includes("x-frame-options:")) {
        if (headers.includes("deny") || headers.includes("sameorigin")) {
          canEmbed = false;
          reason = "Blocked by X-Frame-Options";
        }
      }

      // Detect CSP frame-ancestors
      if (headers.includes("content-security-policy:")) {
        if (headers.includes("frame-ancestors 'none'") || headers.includes("frame-ancestors 'self'")) {
          canEmbed = false;
          reason = "Blocked by CSP: frame-ancestors restriction";
        }
      }

      if (canEmbed) {
        console.log(`✅ "${formattedUrl}" is likely embeddable.`);
        setStatus(`Loaded: ${formattedUrl}`);
        setIframeUrl(formattedUrl);
      } else {
        console.error(`❌ "${formattedUrl}" blocked. Reason: ${reason}`);
        setStatus(`Blocked: ${reason}`);
        setIframeUrl("");
      }
    } catch (error: any) {
      console.error(`❌ Error checking headers:`, error.message);
      // Fallback: Try to load anyway if header check fails
      setStatus(`Check failed, attempting to load: ${formattedUrl}`);
      setIframeUrl(formattedUrl);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Top Bar */}
      <div className="flex gap-2 p-4 bg-black">
        <input
          type="text"
          placeholder="Enter website URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 px-4 py-2 rounded-md outline-none"
        />
        <button
          onClick={handleLoad}
          className="px-4 py-2 bg-green-500 text-white rounded-md"
        >
          Load
        </button>
      </div>

      {/* Status Display */}
      <div className="p-2 text-sm text-gray-600 border-b">
        {status}
      </div>

      {/* Iframe */}
      <div className="flex-1">
        {iframeUrl && (
          <iframe
            src={iframeUrl}
            className="w-full h-full border-none"
          />
        )}
      </div>
    </div>
  );
}
