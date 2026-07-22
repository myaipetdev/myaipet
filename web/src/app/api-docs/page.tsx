import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import { RELEASE_STATUS } from "@/lib/releaseStatus";

export const metadata: Metadata = {
  title: "API Docs — MY AI PET",
  description: "PetClaw SDK & API reference. Quickstart, REST endpoints, skill authoring.",
};

const DOCS_DIR = path.join(process.cwd(), "public", "api-docs");

const TABS: { slug: string; title: string; file: string }[] = [
  { slug: "quickstart", title: "Quickstart", file: "QUICKSTART.md" },
  { slug: "api",        title: "API Reference", file: "API.md" },
  { slug: "ecosystem",  title: "Ecosystem", file: "ECOSYSTEM.md" },
  { slug: "skills",     title: "Skill Authoring", file: "SKILL-AUTHORING.md" },
];

function readDoc(file: string): string {
  try {
    return fs.readFileSync(path.join(DOCS_DIR, file), "utf8");
  } catch {
    return `# ${file}\n\nDocument not available.`;
  }
}

// ── Tiny safe markdown → HTML ──
// Handles: headers (h1-h4), code blocks (```), inline code, bold, italic,
// links, unordered lists, ordered lists, tables, blockquotes, hr.
// Escapes raw HTML to prevent XSS.
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text: string): string {
  // Order matters: code spans first to protect their contents
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<![\w])_([^_]+)_(?![\w])/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  let inCode = false;
  let codeLang = "";
  let codeBuf: string[] = [];

  const flushList = (() => {
    let listOpen: "ul" | "ol" | null = null;
    return {
      maybeOpen(kind: "ul" | "ol") { if (listOpen !== kind) { if (listOpen) out.push(`</${listOpen}>`); out.push(`<${kind}>`); listOpen = kind; } },
      close() { if (listOpen) { out.push(`</${listOpen}>`); listOpen = null; } },
    };
  })();

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (/^```/.test(line)) {
      if (inCode) {
        out.push(`<pre><code class="lang-${escapeHtml(codeLang)}">${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
        codeBuf = []; inCode = false; codeLang = "";
      } else {
        flushList.close();
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      i++; continue;
    }
    if (inCode) { codeBuf.push(line); i++; continue; }

    // Header
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushList.close();
      const level = h[1].length;
      const slug = h[2].toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
      out.push(`<h${level} id="${slug}">${renderInline(h[2])}</h${level}>`);
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushList.close();
      out.push(`<hr/>`);
      i++; continue;
    }

    // Table — simple support: header row + separator + body
    if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|[\s|:-]+\|$/.test(lines[i + 1])) {
      flushList.close();
      const header = line.split("|").slice(1, -1).map(c => c.trim());
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i])) {
        body.push(lines[i].split("|").slice(1, -1).map(c => c.trim()));
        i++;
      }
      out.push(`<table><thead><tr>${header.map(h => `<th>${renderInline(h)}</th>`).join("")}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${renderInline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }

    // Lists
    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ul) { flushList.maybeOpen("ul"); out.push(`<li>${renderInline(ul[1])}</li>`); i++; continue; }
    if (ol) { flushList.maybeOpen("ol"); out.push(`<li>${renderInline(ol[1])}</li>`); i++; continue; }

    // Blockquote
    if (/^>\s+/.test(line)) {
      flushList.close();
      out.push(`<blockquote>${renderInline(line.replace(/^>\s+/, ""))}</blockquote>`);
      i++; continue;
    }

    // Blank line
    if (!line.trim()) { flushList.close(); i++; continue; }

    // Paragraph
    flushList.close();
    out.push(`<p>${renderInline(line)}</p>`);
    i++;
  }
  flushList.close();
  if (inCode) out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
  return out.join("\n");
}

// "On this page" — pull h2/h3 headings out of the markdown so the sidebar can
// mirror the anchors renderMarkdown() emits (same slug algorithm).
function extractToc(md: string): { level: number; text: string; slug: string }[] {
  const out: { level: number; text: string; slug: string }[] = [];
  let inCode = false;
  for (const line of md.split("\n")) {
    if (/^```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const h = line.match(/^(#{2,3})\s+(.*)$/);
    if (!h) continue;
    const text = h[2].replace(/`/g, "").replace(/\*\*/g, "").trim();
    const slug = h[2].toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
    out.push({ level: h[1].length, text, slug });
  }
  return out;
}

// Honest inventory — kept in lockstep with PetClawConsole (no inflation).
const STAT_STRIP = [
  { n: String(RELEASE_STATUS.skills), l: "built-in skills" },
  { n: String(RELEASE_STATUS.mcpTools), l: "bundled MCP tools" },
  { n: String(RELEASE_STATUS.connectors.registry), l: "registered connectors" },
  { n: String(RELEASE_STATUS.connectors.live), l: "live connectors" },
];

export default async function ApiDocsPage(props: { searchParams?: Promise<{ tab?: string }> }) {
  const sp = (await props.searchParams) || {};
  const activeSlug = TABS.find(t => t.slug === sp.tab)?.slug || TABS[0].slug;
  const tab = TABS.find(t => t.slug === activeSlug)!;
  const md = readDoc(tab.file);
  const html = renderMarkdown(md);
  const toc = extractToc(md);

  return (
    <div style={{
      minHeight: "100vh", background: "#ECE4D4",
      fontFamily: "var(--ed-body, sans-serif)", color: "#211A12",
      padding: "0 0 80px",
    }}>
      {/* ── Nameplate masthead (warm-dark, foil title) ── */}
      <header style={{ background: "#1E1710", color: "#ECE0CE", padding: "28px 24px 26px", borderBottom: "3px solid #BE4F28" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <a href="/" style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(232,199,126,0.85)", textDecoration: "none", fontFamily: "var(--ed-m, monospace)" }}>
              ← MY AI PET
            </a>
            <span style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(236,224,206,0.55)", fontFamily: "var(--ed-m, monospace)" }}>
              Developer Documentation · Protocol v1
            </span>
          </div>

          <div style={{ borderTop: "1px solid rgba(232,199,126,0.28)", margin: "16px 0 18px" }} />

          <h1 className="apidocs-foil" style={{ fontSize: "clamp(34px, 6vw, 56px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.02, margin: 0 }}>
            PetClaw&nbsp;API
          </h1>
          <p style={{ fontSize: 16, color: "rgba(236,224,206,0.72)", margin: "12px 0 0", maxWidth: 640, lineHeight: 1.55 }}>
            Build with the HTTP API and SDK {RELEASE_STATUS.sdkVersion}: memory-aware chat,
            {" "}{RELEASE_STATUS.skills} built-in skills, and signed SOUL export with documented import limits.
          </p>

          {/* Stat strip — honest inventory */}
          <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginTop: 20 }}>
            {STAT_STRIP.map(s => (
              <div key={s.l} style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#E8C77E", fontFamily: "var(--ed-m, monospace)" }}>{s.n}</span>
                <span style={{ fontSize: 13, color: "rgba(236,224,206,0.6)", letterSpacing: "0.02em" }}>{s.l}</span>
              </div>
            ))}
          </div>

          {/* Meta row — npm + server + version */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20, fontSize: 13, fontFamily: "var(--ed-m, monospace)" }}>
            <span style={{ background: "rgba(232,199,126,0.12)", border: "1px solid rgba(232,199,126,0.28)", borderRadius: 999, padding: "5px 12px", color: "#E8C77E" }}>
              npm i @myaipet/petclaw-sdk
            </span>
            <span style={{ background: "rgba(236,224,206,0.06)", border: "1px solid rgba(236,224,206,0.16)", borderRadius: 999, padding: "5px 12px", color: "rgba(236,224,206,0.75)" }}>
              server · https://app.myaipet.ai
            </span>
            <span style={{ background: "rgba(236,224,206,0.06)", border: "1px solid rgba(236,224,206,0.16)", borderRadius: 999, padding: "5px 12px", color: "rgba(236,224,206,0.75)" }}>
              SDK v{RELEASE_STATUS.sdkVersion}
            </span>
            <span style={{ background: "rgba(236,224,206,0.06)", border: "1px solid rgba(236,224,206,0.16)", borderRadius: 999, padding: "5px 12px", color: "rgba(236,224,206,0.75)" }}>
              MCP runtime · {RELEASE_STATUS.mcp}
            </span>
            <span style={{ background: "rgba(236,224,206,0.06)", border: "1px solid rgba(236,224,206,0.16)", borderRadius: 999, padding: "5px 12px", color: "rgba(236,224,206,0.75)" }}>
              Messaging · {RELEASE_STATUS.channels}
            </span>
          </div>
        </div>
      </header>

      {/* ── Pill tabs ── */}
      <div style={{ background: "#ECE4D4", borderBottom: "1px solid rgba(33,26,18,0.10)", position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "14px 24px", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TABS.map(t => {
            const on = t.slug === activeSlug;
            return (
              <a key={t.slug} href={`/api-docs?tab=${t.slug}`} className="apidocs-tab" style={{
                padding: "9px 18px", fontSize: 14, fontWeight: 700, borderRadius: 999,
                textDecoration: "none",
                color: on ? "#FBF6EC" : "#5A4E3C",
                background: on ? "#BE4F28" : "#FBF6EC",
                border: on ? "1px solid #9A4E1E" : "1px solid rgba(33,26,18,0.16)",
                boxShadow: on ? "2px 2px 0 rgba(33,26,18,0.18)" : "none",
              }}>{t.title}</a>
            );
          })}
        </div>
      </div>

      {/* ── Two-column: sticky index + paper content ── */}
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "34px 24px 0", display: "grid", gridTemplateColumns: "232px minmax(0,1fr)", gap: 40 }} className="apidocs-grid">
        {/* Sidebar */}
        <aside className="apidocs-aside" style={{ position: "sticky", top: 76, alignSelf: "start", maxHeight: "calc(100vh - 96px)", overflowY: "auto" }}>
          <div style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(33,26,18,0.5)", fontFamily: "var(--ed-m, monospace)", marginBottom: 10 }}>Documents</div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 26 }}>
            {TABS.map(t => (
              <a key={t.slug} href={`/api-docs?tab=${t.slug}`} style={{
                fontSize: 14, fontWeight: t.slug === activeSlug ? 700 : 500,
                padding: "6px 10px", borderRadius: 7, textDecoration: "none",
                color: t.slug === activeSlug ? "#9A4E1E" : "rgba(33,26,18,0.7)",
                background: t.slug === activeSlug ? "rgba(190,79,40,0.10)" : "transparent",
                borderLeft: t.slug === activeSlug ? "2px solid #BE4F28" : "2px solid transparent",
              }}>{t.title}</a>
            ))}
          </nav>

          {toc.length > 0 && (
            <>
              <div style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(33,26,18,0.5)", fontFamily: "var(--ed-m, monospace)", marginBottom: 10 }}>On this page</div>
              <nav style={{ display: "flex", flexDirection: "column", gap: 1, borderLeft: "1px solid rgba(33,26,18,0.13)", paddingLeft: 12 }}>
                {toc.map((h, idx) => (
                  <a key={idx} href={`#${h.slug}`} style={{
                    fontSize: h.level === 2 ? 13 : 12.5,
                    fontWeight: h.level === 2 ? 600 : 400,
                    padding: "3px 0", paddingLeft: h.level === 3 ? 12 : 0,
                    textDecoration: "none",
                    color: h.level === 2 ? "rgba(33,26,18,0.78)" : "rgba(33,26,18,0.55)",
                  }}>{h.text}</a>
                ))}
              </nav>
            </>
          )}
        </aside>

        {/* Content — die-cut paper card */}
        <main style={{ minWidth: 0 }}>
          {/* Mobile (≤820px): collapsible TOC — the sticky sidebar is hidden
              there, so this details block keeps Documents + on-page anchors
              reachable. Native details/summary: works in this server component
              with no JS. Hidden on desktop. */}
          <details className="apidocs-mobile-toc">
            <summary style={{
              cursor: "pointer", fontSize: 13, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "rgba(33,26,18,0.6)",
              fontFamily: "var(--ed-m, monospace)", fontWeight: 700,
              listStyle: "none",
            }}>
              Contents ▾
            </summary>
            <div style={{ paddingTop: 12 }}>
              <div style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(33,26,18,0.5)", fontFamily: "var(--ed-m, monospace)", marginBottom: 8 }}>Documents</div>
              <nav style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 16 }}>
                {TABS.map(t => (
                  <a key={t.slug} href={`/api-docs?tab=${t.slug}`} style={{
                    fontSize: 14, fontWeight: t.slug === activeSlug ? 700 : 500,
                    padding: "6px 10px", borderRadius: 7, textDecoration: "none",
                    color: t.slug === activeSlug ? "#9A4E1E" : "rgba(33,26,18,0.7)",
                    background: t.slug === activeSlug ? "rgba(190,79,40,0.10)" : "transparent",
                    borderLeft: t.slug === activeSlug ? "2px solid #BE4F28" : "2px solid transparent",
                  }}>{t.title}</a>
                ))}
              </nav>
              {toc.length > 0 && (
                <>
                  <div style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(33,26,18,0.5)", fontFamily: "var(--ed-m, monospace)", marginBottom: 8 }}>On this page</div>
                  <nav style={{ display: "flex", flexDirection: "column", gap: 1, borderLeft: "1px solid rgba(33,26,18,0.13)", paddingLeft: 12 }}>
                    {toc.map((h, idx) => (
                      <a key={idx} href={`#${h.slug}`} style={{
                        fontSize: h.level === 2 ? 13 : 12.5,
                        fontWeight: h.level === 2 ? 600 : 400,
                        padding: "3px 0", paddingLeft: h.level === 3 ? 12 : 0,
                        textDecoration: "none",
                        color: h.level === 2 ? "rgba(33,26,18,0.78)" : "rgba(33,26,18,0.55)",
                      }}>{h.text}</a>
                    ))}
                  </nav>
                </>
              )}
            </div>
          </details>
          <div style={{
            background: "#FBF6EC", border: "1px solid rgba(33,26,18,0.14)", borderRadius: 14,
            boxShadow: "5px 6px 0 rgba(33,26,18,0.07)", padding: "clamp(22px, 4vw, 44px)",
          }}>
            <div className="md-content" dangerouslySetInnerHTML={{ __html: html }} />
          </div>

          <div style={{
            marginTop: 28, fontSize: 13, color: "rgba(33,26,18,0.6)", lineHeight: 1.6,
            fontFamily: "var(--ed-m, monospace)",
          }}>
            raw ·{" "}
            {TABS.map((t, idx) => (
              <span key={t.slug}>
                <a href={`/api-docs/${t.file}`} style={{ color: "#9A4E1E" }}>{t.file}</a>
                {idx < TABS.length - 1 ? " · " : ""}
              </span>
            ))}
          </div>
        </main>
      </div>

      <style>{`
        .apidocs-foil {
          background: linear-gradient(100deg,#8A5A1E 0%,#C8932F 24%,#FFF7E6 50%,#E8C77E 74%,#8A5A1E 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent; color: transparent;
          filter: drop-shadow(0 1px 0 rgba(40,14,4,.4));
        }
        .apidocs-tab { transition: transform .12s ease, box-shadow .12s ease; }
        .apidocs-tab:hover { transform: translate(-1px,-1px); box-shadow: 3px 3px 0 rgba(33,26,18,0.16); }
        .apidocs-aside::-webkit-scrollbar { width: 6px; }
        .apidocs-aside::-webkit-scrollbar-thumb { background: rgba(33,26,18,0.16); border-radius: 3px; }
        .apidocs-mobile-toc { display: none; }
        .apidocs-mobile-toc > summary::-webkit-details-marker { display: none; }
        @media (max-width: 820px) {
          .apidocs-grid { grid-template-columns: 1fr !important; gap: 20px !important; }
          .apidocs-aside { display: none !important; }
          .apidocs-mobile-toc {
            display: block;
            margin: 0 0 18px;
            background: #FBF6EC;
            border: 1px solid rgba(33,26,18,0.14);
            border-radius: 12px;
            box-shadow: 3px 4px 0 rgba(33,26,18,0.07);
            padding: 12px 16px;
          }
        }
        .md-content { font-size: 15.5px; line-height: 1.72; color: #211A12; }
        .md-content h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; margin: 32px 0 12px; }
        .md-content h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; margin: 28px 0 10px; padding-top: 8px; border-top: 1px solid rgba(33,26,18,0.13); }
        .md-content h3 { font-size: 17px; font-weight: 700; margin: 22px 0 8px; color: #9A4E1E; }
        .md-content h4 { font-size: 15px; font-weight: 700; margin: 16px 0 6px; }
        .md-content p { margin: 0 0 12px; }
        .md-content ul, .md-content ol { margin: 6px 0 14px; padding-left: 24px; }
        .md-content li { margin: 3px 0; }
        .md-content code { font-family: var(--ed-m, ui-monospace, monospace); font-size: 13px; background: #F5EFE2; padding: 2px 6px; border-radius: 4px; color: #9A4E1E; }
        .md-content pre { background: #1E1710; padding: 16px 18px; border-radius: 10px; overflow-x: auto; margin: 14px 0; }
        .md-content pre code { background: none; color: #E8C77E; padding: 0; font-size: 13px; line-height: 1.6; }
        .md-content a { color: #9A4E1E; text-decoration: underline; }
        .md-content blockquote { border-left: 3px solid #BE4F28; padding: 4px 14px; margin: 14px 0; color: rgba(33,26,18,0.7); background: rgba(190,79,40,0.10); border-radius: 0 8px 8px 0; }
        .md-content hr { border: none; border-top: 1px solid rgba(33,26,18,0.13); margin: 24px 0; }
        .md-content table { border-collapse: collapse; margin: 14px 0; font-size: 13.5px; width: 100%; }
        .md-content h2:first-of-type { border-top: none; padding-top: 0; }
        .md-content th, .md-content td { padding: 8px 12px; border: 1px solid rgba(33,26,18,0.13); text-align: left; }
        .md-content th { background: #F5EFE2; font-weight: 700; }
        .md-content tr:nth-child(even) td { background: rgba(33,26,18,0.02); }
      `}</style>
    </div>
  );
}
