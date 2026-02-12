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
      const res = await fetch("/api/check-site", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: formattedUrl }),
      });

      const data = await res.json();

      if (!data.success) {
        console.error(`❌ Error checking "${formattedUrl}":`, data.message);
        setStatus(`Error checking ${formattedUrl}`);
        return;
      }

      if (data.canEmbed) {
        console.log(`✅ "${formattedUrl}" loaded successfully.`);
        setStatus(`Loaded successfully: ${formattedUrl}`);
        setIframeUrl(formattedUrl);
      } else {
        console.error(
          `❌ "${formattedUrl}" blocked from iframe embedding. Reason: ${data.reason}`
        );
        setStatus(`Blocked: ${formattedUrl}`);
      }
    } catch (error) {
      console.error(`❌ Unexpected error loading "${formattedUrl}"`);
      setStatus(`Unexpected error: ${formattedUrl}`);
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
