"use client";

import { useState, useRef } from "react";

interface RowResult {
  url: string;
  title: string;
  row: string[];
  reason?: string;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [iframeUrl, setIframeUrl] = useState("");
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState<"allowed" | "blocked">("allowed");

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [allowedResults, setAllowedResults] = useState<RowResult[]>([]);
  const [blockedResults, setBlockedResults] = useState<RowResult[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [activeUrl, setActiveUrl] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  // ── Check via our own API route ──
  async function checkUrl(rawUrl: string): Promise<{ canEmbed: boolean; formatted: string; reason: string }> {
    let formatted = rawUrl.trim();
    if (!formatted.startsWith("http://") && !formatted.startsWith("https://")) {
      formatted = "https://" + formatted;
    }
    try {
      const res = await fetch(`/api/check-headers?url=${encodeURIComponent(formatted)}`);
      if (!res.ok) return { canEmbed: false, formatted, reason: "API error" };
      const data = await res.json();
      return { canEmbed: data.canEmbed, formatted, reason: data.reason || "unknown" };
    } catch {
      return { canEmbed: false, formatted, reason: "Network error" };
    }
  }

  // ── Single URL load ──
  const handleLoad = async () => {
    if (!url) return;
    setStatus(`Checking…`);
    setIframeUrl("");
    const { canEmbed, formatted, reason } = await checkUrl(url);
    if (canEmbed) {
      setStatus(`✅ Loaded: ${formatted}`);
      setIframeUrl(formatted);
    } else {
      setStatus(`❌ Blocked — ${reason}`);
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

  // ── Process CSV ──
  const handleCSV = async (file: File) => {
    const text = await file.text();
    const lines = text.trim().split("\n").filter(Boolean);
    if (lines.length < 2) { alert("CSV needs a header + at least one row."); return; }

    const headers = parseCSVLine(lines[0]);
    const urlCol = findUrlCol(headers);
    const titleCol = findTitleCol(headers);

    if (urlCol === -1) { alert("No URL column found. Must be named 'url' or 'finalurl'."); return; }

    setCsvHeaders(headers);
    setAllowedResults([]);
    setBlockedResults([]);
    setActiveUrl("");
    setIframeUrl("");
    setActiveTab("allowed");
    cancelRef.current = false;
    setProcessing(true);
    setProgress({ current: 0, total: lines.length - 1 });

    const allowed: RowResult[] = [];
    const blocked: RowResult[] = [];

    for (let i = 1; i < lines.length; i++) {
      if (cancelRef.current) break;

      const row = parseCSVLine(lines[i]);
      const rawUrl = row[urlCol] || "";
      const title = titleCol !== -1 ? row[titleCol] : rawUrl;

      setStatus(`Testing ${i} / ${lines.length - 1}: ${rawUrl}`);
      setProgress({ current: i, total: lines.length - 1 });

      if (!rawUrl) continue;

      const { canEmbed, formatted, reason } = await checkUrl(rawUrl);

      if (canEmbed) {
        allowed.push({ url: formatted, title, row });
        setAllowedResults([...allowed]);
      } else {
        blocked.push({ url: formatted, title, row, reason });
        setBlockedResults([...blocked]);
      }

      await new Promise(r => setTimeout(r, 200));
    }

    setProcessing(false);
    setStatus(`Done — ✅ ${allowed.length} allowed · ❌ ${blocked.length} blocked · out of ${lines.length - 1}`);

    if (allowed.length === 0) { alert("No iframe-friendly URLs found."); return; }

    // Auto-download filtered CSV (allowed only)
    const csv = [toCsvRow(headers), ...allowed.map(r => toCsvRow(r.row))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `iframe-friendly-${file.name}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadCSV = (type: "allowed" | "blocked") => {
    const rows = type === "allowed" ? allowedResults : blockedResults;
    const csv = [toCsvRow(csvHeaders), ...rows.map(r => toCsvRow(r.row))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${type}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pct = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
  const showPanel = allowedResults.length > 0 || blockedResults.length > 0;
  const activeList = activeTab === "allowed" ? allowedResults : blockedResults;

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
            <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between px-3 py-1 text-xs text-gray-400">
            <span className="truncate">{status}</span>
            {processing && (
              <span className="ml-4 shrink-0 font-mono text-xs">
                <span className="text-green-400">{allowedResults.length} ✅</span>
                <span className="text-gray-600 mx-1">·</span>
                <span className="text-red-400">{blockedResults.length} ❌</span>
                <span className="text-gray-600 mx-1">·</span>
                <span className="text-gray-400">{pct}%</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Status when idle ── */}
      {!processing && !progress.total && status && (
        <div className="shrink-0 px-3 py-1.5 text-xs text-gray-400 border-b border-gray-800 bg-black truncate">
          {status}
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Side panel ── */}
        {showPanel && (
          <div className="w-72 shrink-0 border-r border-gray-800 flex flex-col bg-gray-950">

            {/* Tabs */}
            <div className="flex border-b border-gray-800 shrink-0">
              <button
                onClick={() => setActiveTab("allowed")}
                className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                  activeTab === "allowed"
                    ? "text-green-400 border-b-2 border-green-400 bg-gray-900"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                ✅ Allowed ({allowedResults.length})
              </button>
              <button
                onClick={() => setActiveTab("blocked")}
                className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                  activeTab === "blocked"
                    ? "text-red-400 border-b-2 border-red-400 bg-gray-900"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                ❌ Blocked ({blockedResults.length})
              </button>
            </div>

            {/* Download button */}
            {!processing && activeList.length > 0 && (
              <div className="px-3 py-2 border-b border-gray-800 flex justify-end shrink-0">
                <button
                  onClick={() => downloadCSV(activeTab)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  ↓ Download {activeTab} CSV
                </button>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {activeList.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-xs text-gray-600">
                  {processing ? "Checking…" : `No ${activeTab} URLs yet`}
                </div>
              ) : (
                activeList.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (activeTab === "allowed") {
                        setActiveUrl(r.url);
                        setIframeUrl(r.url);
                        setStatus(`✅ Loaded: ${r.url}`);
                      }
                    }}
                    className={`w-full text-left px-3 py-2.5 border-b border-gray-800/60 transition-colors
                      ${activeTab === "allowed" ? "hover:bg-gray-800 cursor-pointer" : "cursor-default"}
                      ${activeUrl === r.url && activeTab === "allowed" ? "bg-gray-800 border-l-2 border-l-green-500 pl-2.5" : ""}
                    `}
                  >
                    <div className="text-xs font-medium text-gray-200 truncate">{r.title}</div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">{r.url}</div>
                    {activeTab === "blocked" && r.reason && (
                      <div className="text-xs text-red-500/70 truncate mt-0.5">{r.reason}</div>
                    )}
                  </button>
                ))
              )}
              {processing && (
                <div className="px-3 py-2 text-xs text-gray-600 animate-pulse">Checking more…</div>
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
