"use client";

import { useState, useRef } from "react";

interface RowResult {
  url: string;
  title: string;
  row: string[];
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [iframeUrl, setIframeUrl] = useState("");
  const [status, setStatus] = useState("");

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [allowedResults, setAllowedResults] = useState<RowResult[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [activeUrl, setActiveUrl] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  // ── shared URL check ──
  async function checkUrl(rawUrl: string): Promise<{ canEmbed: boolean; formatted: string }> {
    let formatted = rawUrl.trim();
    if (!formatted.startsWith("http://") && !formatted.startsWith("https://")) {
      formatted = "https://" + formatted;
    }
    try {
      const res = await fetch(
        `https://api.hackertarget.com/httpheaders/?q=${encodeURIComponent(formatted)}`
      );
      const text = await res.text();
      if (!res.ok || text.includes("error")) throw new Error();
      const h = text.toLowerCase();
      const blocked =
        (h.includes("x-frame-options:") && (h.includes("deny") || h.includes("sameorigin"))) ||
        (h.includes("content-security-policy:") &&
          (h.includes("frame-ancestors 'none'") || h.includes("frame-ancestors 'self'")));
      return { canEmbed: !blocked, formatted };
    } catch {
      return { canEmbed: true, formatted };
    }
  }

  // ── single URL load ──
  const handleLoad = async () => {
    if (!url) return;
    setStatus(`Checking: ${url}`);
    setIframeUrl("");
    const { canEmbed, formatted } = await checkUrl(url);
    if (canEmbed) {
      setStatus(`Loaded: ${formatted}`);
      setIframeUrl(formatted);
    } else {
      setStatus(`Blocked — cannot embed this URL`);
    }
  };

  // ── CSV helpers ──
  function parseCSVLine(line: string): string[] {
    const fields: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === "," && !inQ) { fields.push(cur); cur = ""; }
      else cur += c;
    }
    fields.push(cur);
    return fields.map(f => f.trim());
  }

  function toCsvRow(fields: string[]) {
    return fields.map(f => {
      const s = String(f ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",");
  }

  function findUrlCol(headers: string[]) {
    const l = headers.map(h => h.toLowerCase());
    for (const name of ["url", "finalurl", "actual_url"]) {
      const i = l.indexOf(name);
      if (i !== -1) return i;
    }
    return l.findIndex(h => h.includes("url"));
  }

  function findTitleCol(headers: string[]) {
    const l = headers.map(h => h.toLowerCase());
    return l.findIndex(h => h.includes("title") || h.includes("name"));
  }

  // ── process CSV ──
  const handleCSV = async (file: File) => {
    const text = await file.text();
    const lines = text.trim().split("\n").filter(Boolean);
    if (lines.length < 2) { alert("CSV needs a header + at least one row."); return; }

    const headers = parseCSVLine(lines[0]);
    const urlCol = findUrlCol(headers);
    const titleCol = findTitleCol(headers);

    if (urlCol === -1) { alert("No URL column found. Column must be named 'url' or 'finalurl'."); return; }

    setCsvHeaders(headers);
    setAllowedResults([]);
    setActiveUrl("");
    setIframeUrl("");
    cancelRef.current = false;
    setProcessing(true);
    setProgress({ current: 0, total: lines.length - 1 });

    const allowed: RowResult[] = [];

    for (let i = 1; i < lines.length; i++) {
      if (cancelRef.current) break;
      const row = parseCSVLine(lines[i]);
      const rawUrl = row[urlCol] || "";
      const title = titleCol !== -1 ? row[titleCol] : rawUrl;

      setStatus(`Testing ${i} / ${lines.length - 1}: ${rawUrl}`);
      setProgress({ current: i, total: lines.length - 1 });

      if (!rawUrl) continue;

      const { canEmbed, formatted } = await checkUrl(rawUrl);
      if (canEmbed) {
        const result = { url: formatted, title, row };
        allowed.push(result);
        // update list in real time as results come in
        setAllowedResults([...allowed]);
      }

      await new Promise(r => setTimeout(r, 300));
    }

    setProcessing(false);
    setStatus(`Done — ${allowed.length} of ${lines.length - 1} URLs are iframe-friendly`);

    if (allowed.length === 0) { alert("No iframe-friendly URLs found."); return; }

    // auto-download filtered CSV
    const csv = [toCsvRow(headers), ...allowed.map(r => toCsvRow(r.row))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `iframe-friendly-${file.name}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadCSV = () => {
    const csv = [toCsvRow(csvHeaders), ...allowedResults.map(r => toCsvRow(r.row))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "iframe-friendly.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pct = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">

      {/* ── Top Bar ── */}
      <div className="flex gap-2 p-3 bg-black border-b border-gray-800 shrink-0">
        <input
          type="text"
          placeholder="Enter website URL"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLoad()}
          className="flex-1 px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-white placeholder-gray-500 outline-none focus:border-green-500 text-sm"
        />
        <button
          onClick={handleLoad}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          Load
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={processing}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors whitespace-nowrap"
        >
          {processing ? "Testing…" : "Upload CSV"}
        </button>
        {processing && (
          <button
            onClick={() => { cancelRef.current = true; }}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { handleCSV(f); e.target.value = ""; } }}
        />
      </div>

      {/* ── Progress bar ── */}
      {(processing || progress.total > 0) && (
        <div className="shrink-0 bg-black border-b border-gray-800">
          <div className="h-1 bg-gray-800">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between px-3 py-1 text-xs text-gray-400">
            <span className="truncate">{status}</span>
            {processing && (
              <span className="ml-4 shrink-0 text-green-400 font-mono">
                {progress.current}/{progress.total} · {pct}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Status line when idle ── */}
      {!processing && !progress.total && status && (
        <div className="shrink-0 px-3 py-1.5 text-xs text-gray-400 border-b border-gray-800 bg-black truncate">
          {status}
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Results side panel ── */}
        {allowedResults.length > 0 && (
          <div className="w-72 shrink-0 border-r border-gray-800 flex flex-col bg-gray-950">

            {/* panel header */}
            <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">
                ✅ {allowedResults.length} iframe-friendly
                {processing && <span className="text-gray-500 normal-case font-normal"> (live)</span>}
              </span>
              {!processing && (
                <button
                  onClick={downloadCSV}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  ↓ CSV
                </button>
              )}
            </div>

            {/* scrollable list */}
            <div className="flex-1 overflow-y-auto">
              {allowedResults.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setActiveUrl(r.url);
                    setIframeUrl(r.url);
                    setStatus(`Loaded: ${r.url}`);
                  }}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-800/60 hover:bg-gray-800 transition-colors ${
                    activeUrl === r.url ? "bg-gray-800 border-l-2 border-l-green-500 pl-2.5" : ""
                  }`}
                >
                  <div className="text-xs font-medium text-gray-200 truncate">{r.title}</div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">{r.url}</div>
                </button>
              ))}
              {processing && (
                <div className="px-3 py-2 text-xs text-gray-600 animate-pulse">
                  Checking more…
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Iframe / empty state ── */}
        <div className="flex-1 overflow-hidden">
          {iframeUrl ? (
            <iframe src={iframeUrl} className="w-full h-full border-none" />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600 text-sm select-none">
              <span className="text-4xl opacity-30">⬡</span>
              <span>Enter a URL above, or upload a CSV to filter iframe-friendly sites</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}