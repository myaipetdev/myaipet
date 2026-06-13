import type { Metadata } from "next";
import fs from "fs";
import path from "path";

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

export default async function ApiDocsPage(props: { searchParams?: Promise<{ tab?: string }> }) {
  const sp = (await props.searchParams) || {};
  const activeSlug = TABS.find(t => t.slug === sp.tab)?.slug || TABS[0].slug;
  const tab = TABS.find(t => t.slug === activeSlug)!;
  const md = readDoc(tab.file);
  const html = renderMarkdown(md);

  return (
    <div style={{
      minHeight: "100vh", background: "#faf7f2",
      fontFamily: "'Space Grotesk', sans-serif", color: "#1a1a2e",
      padding: "60px 24px",
    }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <a href="/" style={{
          display: "inline-block", marginBottom: 20,
          fontSize: 13, color: "rgba(26,26,46,0.55)", textDecoration: "none",
        }}>← Back to landing</a>

        <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>
          PetClaw API Docs
        </h1>
        <p style={{ fontSize: 14, color: "rgba(26,26,46,0.6)", marginBottom: 28 }}>
          SDK reference for the <code style={{ fontSize: 13 }}>petclaw-sdk</code> npm package and HTTP API.
          Default server: <code style={{ fontSize: 13 }}>https://app.myaipet.ai</code>
        </p>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: "1px solid rgba(0,0,0,0.08)", flexWrap: "wrap" }}>
          {TABS.map(t => (
            <a key={t.slug} href={`/api-docs?tab=${t.slug}`} style={{
              padding: "10px 18px",
              fontSize: 14, fontWeight: 600,
              color: t.slug === activeSlug ? "#1a1a2e" : "rgba(26,26,46,0.65)",
              borderBottom: t.slug === activeSlug ? "2px solid #f59e0b" : "2px solid transparent",
              textDecoration: "none",
              marginBottom: -1,
            }}>{t.title}</a>
          ))}
        </div>

        <div className="md-content" dangerouslySetInnerHTML={{ __html: html }} />

        <div style={{
          marginTop: 60, paddingTop: 24, borderTop: "1px solid rgba(0,0,0,0.06)",
          fontSize: 12, color: "rgba(26,26,46,0.65)", lineHeight: 1.6,
        }}>
          Source files: <a href="/api-docs/QUICKSTART.md" style={{ color: "#b45309" }}>QUICKSTART.md</a> ·{" "}
          <a href="/api-docs/API.md" style={{ color: "#b45309" }}>API.md</a> ·{" "}
          <a href="/api-docs/ECOSYSTEM.md" style={{ color: "#b45309" }}>ECOSYSTEM.md</a> ·{" "}
          <a href="/api-docs/SKILL-AUTHORING.md" style={{ color: "#b45309" }}>SKILL-AUTHORING.md</a>
        </div>
      </div>

      <style>{`
        .md-content { font-size: 15px; line-height: 1.7; color: #1a1a2e; }
        .md-content h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; margin: 32px 0 12px; }
        .md-content h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; margin: 28px 0 10px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.06); }
        .md-content h3 { font-size: 17px; font-weight: 700; margin: 22px 0 8px; color: #b45309; }
        .md-content h4 { font-size: 15px; font-weight: 700; margin: 16px 0 6px; }
        .md-content p { margin: 0 0 12px; }
        .md-content ul, .md-content ol { margin: 6px 0 14px; padding-left: 24px; }
        .md-content li { margin: 3px 0; }
        .md-content code { font-family: 'SF Mono', Consolas, monospace; font-size: 13px; background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px; color: #b45309; }
        .md-content pre { background: #0f0f1a; padding: 16px 18px; border-radius: 10px; overflow-x: auto; margin: 14px 0; }
        .md-content pre code { background: none; color: #f8f8f8; padding: 0; font-size: 13px; line-height: 1.6; }
        .md-content a { color: #b45309; text-decoration: underline; }
        .md-content blockquote { border-left: 3px solid #f59e0b; padding: 4px 14px; margin: 14px 0; color: rgba(26,26,46,0.7); background: rgba(245,158,11,0.05); border-radius: 0 8px 8px 0; }
        .md-content hr { border: none; border-top: 1px solid rgba(0,0,0,0.08); margin: 24px 0; }
        .md-content table { border-collapse: collapse; margin: 14px 0; font-size: 13px; width: 100%; }
        .md-content th, .md-content td { padding: 8px 12px; border: 1px solid rgba(0,0,0,0.08); text-align: left; }
        .md-content th { background: rgba(0,0,0,0.03); font-weight: 700; }
        .md-content tr:nth-child(even) td { background: rgba(0,0,0,0.015); }
      `}</style>
    </div>
  );
}
