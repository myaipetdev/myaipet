import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const webRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(webRoot, "..");
const hangul = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u;
const staticAssetExtension = /\.(?:png|jpe?g|gif|webp|svg|ico|mp4|webm|wav|mp3|zip|json|md|txt|pdf|wasm)$/i;
const failures = [];
const inventory = { buttons: 0, roleButtons: 0, links: 0, inputs: 0, uiFiles: 0, visibleLabels: new Set() };
const retiredCopy = [
  "100 welcome credits included",
  "Studio creations included each month",
  "Creator Pass $19.99/mo",
  "$69.99/yr",
  "one-time $29",
  "Credits convert to pts on use",
  "pts credits",
  "spent on items, slots, and premium actions",
  "Fetch, Sit",
  "Guard, Trick",
  "Inspire, Heal",
  "Transcend",
  "on-chain, forever",
  "minted, on-chain, forever",
  "$0.99 / 100 credits",
  "$19.99/mo — volume, 4K, priority for heavy creators",
  "then 0.10 USDT",
  "6 stages from Baby",
  "6 stages (Baby",
  "Your AI Companion, On-Chain",
  "USDT on BNB Smart Chain",
  "Cross-platform · Never forgets",
  "MY AI PET is backed by",
  "WAGMI Ventures",
  "Animoca Brands",
  "KuCoin Ventures",
  "Lives in every tab",
  "corner of every tab",
  "I live in every tab",
  "using the 6 steps above",
  "petclaw wipe --proof",
  "petclaw consent",
  "Heartbeat</span><span class=\"v\">+1 / 5min",
  "First adoption</span><span class=\"v\">+100",
  "Open the Home tab to buy more credits",
  "Buy more credits on the Home tab",
  "Add credits and try again.",
  "Deployed (paused)",
  "remain paused on BSC",
  "are deployed and paused on BSC",
  "ON-CHAIN · PAUSED",
  "2 Deployed · 2 Paused",
  "On-chain minting is paused",
  "non-upgradeable and paused",
  "currently `1.6.0`",
  "likes, DMs",
  "reactions, channel management",
  "Search + page summarization (no API key needed)",
  "grab a credit pack",
  "top up to keep hunting",
];

const requiredUiContracts = [
  {
    file: "web/src/lib/petclaw-extension.ts",
    description: "extension onboarding must disclose blocked private/local and sensitive sites",
    pattern: /MY AI PET, private\/local network addresses, and a built-in list of common sensitive domains are blocked\./,
  },
  {
    file: "web/src/components/PetClawPreview.tsx",
    description: "logged-out visitors must receive the public extension onboarding and download",
    pattern: /id="petclaw-extension"[\s\S]*?PETCLAW_EXTENSION_STEPS\.map[\s\S]*?href="\/petclaw-extension\.zip"[\s\S]*?Download Extension/,
  },
  {
    file: "web/public/api-docs/API.md",
    description: "public API examples must identify the current SDK and label synthetic metrics",
    pattern: /SDK package\*\* version \(currently `1\.6\.1`\)[\s\S]*?numeric values below are illustrative, not launch metrics[\s\S]*?"totalSoulNfts": 0/,
  },
  {
    file: "web/src/app/contracts/page.tsx",
    description: "PETContent disclosure must include its exact address, disabled integration status, and zero supply",
    pattern: /name: "PETContent \(NFT\)"[^\n]*0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c[^\n]*status: "Deployed \(integration off\)"[^\n]*paused\(\) was false and totalSupply\(\) = 0/,
  },
  {
    file: "web/src/app/contracts/page.tsx",
    description: "PetaGenTracker disclosure must include its exact address, disabled integration status, and zero counters",
    pattern: /name: "PetaGenTracker"[^\n]*0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a[^\n]*status: "Deployed \(integration off\)"[^\n]*paused\(\) was false, totalUsers\(\) = 0, and totalGenerations\(\) = 0/,
  },
  {
    file: "web/src/app/contracts/page.tsx",
    description: "public contract disclosure must separate the disabled app gate from on-chain state and active owner permissions",
    pattern: /all blockchain integration disabled[\s\S]*?paused\(\) = false[\s\S]*?BLOCKCHAIN_ENABLED=false[\s\S]*?owner relayer\/minter authorization remains active/,
  },
  {
    file: "web/src/components/App.tsx",
    description: "Season Rewards section must expose its visible title as a semantic heading",
    pattern: /<h1\s+className="season-banner-title"[\s\S]*?>[\s\S]*?Season 1 Rewards[\s\S]*?<\/h1>/,
  },
  {
    file: "web/src/components/Hero.tsx",
    description: "PetClaw portability copy must not claim user data bypasses platform storage",
    pattern: /open, exportable protocol designed to move across supported clients instead of locking you to one surface\./,
  },
  {
    file: "landing-assets/index.html",
    description: "sovereignty cards must be allowed to shrink on narrow viewports",
    pattern: /\.right\s*\{[^}]*\bmin-width\s*:\s*0\s*;/,
  },
  {
    file: "landing-assets/index.html",
    description: "sovereignty receipt commands must truncate instead of overflowing",
    pattern: /\.right-receipt\s+\.rr-cmd\s*\{[^}]*\bmin-width\s*:\s*0\s*;[^}]*\boverflow\s*:\s*hidden\s*;[^}]*\btext-overflow\s*:\s*ellipsis\s*;/,
  },
  {
    file: "landing-assets/index.html",
    description: "launch demo must remain keyboard-operable before the iframe loads",
    pattern: /id="journeyVideo"\s+role="button"\s+tabindex="0"[\s\S]*?onclick="playDemo\(this\)"[\s\S]*?onkeydown="[^"]*Enter[^"]*playDemo\(this\)[^"]*"/,
  },
  {
    file: "landing-assets/index.html",
    description: "launch demo must replace its launcher with the local titled product-demo iframe",
    pattern: /function\s+playDemo\(el\)\s*\{[\s\S]*?document\.createElement\(['"]iframe['"]\)[\s\S]*?f\.src\s*=\s*['"]product-demo\.html['"][\s\S]*?f\.title\s*=\s*['"]MY AI PET launch demo['"][\s\S]*?el\.innerHTML\s*=\s*['"]{2}[\s\S]*?el\.appendChild\(f\)/,
  },
];

function auditRetiredCopy(file, text) {
  for (const phrase of retiredCopy) {
    if (text.includes(phrase)) {
      failures.push(`${relative(file)}: contains retired or misleading copy: ${JSON.stringify(phrase)}`);
    }
  }
}

function walk(dir, accept) {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(absolute, accept));
    else if (accept(absolute)) output.push(absolute);
  }
  return output;
}

function relative(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, "/");
}

function withoutQuery(value) {
  return value.split(/[?#]/, 1)[0];
}

function assetExists(assetRoot, value, allowAppRoute) {
  const clean = withoutQuery(value);
  const diskPath = path.join(assetRoot, clean.replace(/^\//, ""));
  if (fs.existsSync(diskPath)) return true;
  if (!allowAppRoute || !clean.startsWith("/")) return false;
  return fs.existsSync(path.join(webRoot, "src", "app", clean.slice(1), "route.ts"));
}

let appRouteMatchers;
function getAppRouteMatchers() {
  if (appRouteMatchers) return appRouteMatchers;
  const appRoot = path.join(webRoot, "src", "app");
  appRouteMatchers = walk(appRoot, (file) => /\/(?:page|route)\.tsx?$/.test(file)).map((file) => {
    const route = path.relative(appRoot, path.dirname(file)).replaceAll(path.sep, "/");
    const parts = route ? route.split("/") : [];
    const source = parts.map((part) => {
      if (/^\[\[\.\.\.[^\]]+\]\]$/.test(part)) return "(?:/.*)?";
      if (/^\[\.\.\.[^\]]+\]$/.test(part)) return "/.+";
      if (/^\[[^\]]+\]$/.test(part)) return "/[^/]+";
      return `/${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
    }).join("");
    return new RegExp(`^${source || "/"}/?$`);
  });
  return appRouteMatchers;
}

function internalTargetExists(value) {
  const clean = withoutQuery(value);
  if (!clean.startsWith("/")) return true;
  const publicTarget = path.join(webRoot, "public", clean.replace(/^\//, ""));
  if (fs.existsSync(publicTarget)) return true;
  return getAppRouteMatchers().some((matcher) => matcher.test(clean));
}

function auditStaticFetchTargets(file, text) {
  for (const match of text.matchAll(/\bfetch\s*\(\s*(["'`])(\/[^"'`\r\n{}]*)\1/g)) {
    if (!internalTargetExists(match[2])) {
      failures.push(`${relative(file)}: fetch targets missing internal route: ${match[2]}`);
    }
  }
}

function auditAbsoluteAssetLiterals(file, text, assetRoot, allowAppRoute = false) {
  const literals = text.matchAll(/(["'`])(\/[^"'`\r\n{}<>,\s]+\.(?:png|jpe?g|gif|webp|svg|ico|mp4|webm|wav|mp3|zip|json|md|txt|pdf|wasm)(?:[?#][^"'`\s]*)?)\1/gi);
  for (const match of literals) {
    if (!assetExists(assetRoot, match[2], allowAppRoute)) {
      failures.push(`${relative(file)}: static asset does not exist in this release: ${match[2]}`);
    }
  }
}

function auditHtmlAssetAttributes(file, text, assetRoot) {
  const references = [
    ...text.matchAll(/\b(?:src|poster|href)\s*=\s*["']([^"']+)["']/gi),
    ...text.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi),
  ];
  for (const match of references) {
    const value = match[1];
    if (/^(?:https?:|data:|blob:|chrome-extension:|#)/i.test(value)) continue;
    const clean = withoutQuery(value);
    if (!staticAssetExtension.test(clean)) continue;
    const target = clean.startsWith("/")
      ? path.join(assetRoot, clean.slice(1))
      : path.resolve(path.dirname(file), clean);
    if (!fs.existsSync(target)) {
      failures.push(`${relative(file)}: referenced HTML asset does not exist: ${value}`);
    }
  }
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function fail(source, node, reason) {
  failures.push(`${relative(source.fileName)}:${lineOf(source, node)} ${reason}`);
}

function attr(opening, name) {
  return opening.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  );
}

function attrStaticValue(attribute) {
  if (!attribute?.initializer) return attribute ? "" : null;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text.trim();
  if (
    ts.isJsxExpression(attribute.initializer)
    && attribute.initializer.expression
    && ts.isStringLiteralLike(attribute.initializer.expression)
  ) return attribute.initializer.expression.text.trim();
  return null;
}

function attrComparableValue(attribute) {
  const literal = attrStaticValue(attribute);
  if (literal !== null) return literal;
  if (attribute?.initializer && ts.isJsxExpression(attribute.initializer)
    && attribute.initializer.expression) {
    return attribute.initializer.expression.getText();
  }
  return null;
}

function hasAccessibleAttribute(opening, name) {
  const attribute = attr(opening, name);
  if (!attribute) return false;
  const literal = attrStaticValue(attribute);
  // A non-literal expression such as `aria-label={`Open ${name}`}` is a real
  // runtime name. Empty static attributes are not.
  return literal === null || literal.length > 0;
}

function hasSpread(opening) {
  return opening.attributes.properties.some(ts.isJsxSpreadAttribute);
}

function jsxTagName(opening) {
  return opening.tagName.getText().toLowerCase();
}

function canRenderButtonRole(opening) {
  const role = attrComparableValue(attr(opening, "role"));
  return role === "button" || (role !== null && /["'`]button["'`]/.test(role));
}

function descendantText(node) {
  const parts = [];
  let dynamic = false;
  function visit(child) {
    if (ts.isJsxText(child)) {
      const text = child.text.replace(/\s+/g, " ").trim();
      if (text) parts.push(text);
      return;
    }
    if (ts.isJsxExpression(child)) {
      const expression = child.expression;
      if (!expression) return;
      if (ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression)) {
        parts.push(expression.text);
      } else {
        dynamic = true;
      }
      return;
    }
    ts.forEachChild(child, visit);
  }
  // Only inspect rendered children. Walking the entire JSX node also visits
  // opening-element attributes, so an unrelated dynamic prop such as
  // `onClick={() => ...}` used to mark an icon-only button as dynamically
  // named and let it pass without an accessible name.
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
    for (const child of node.children) visit(child);
  }
  return { text: parts.join(" ").trim(), dynamic };
}

function insideLabel(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if ((ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent))
      && jsxTagName(ts.isJsxElement(parent) ? parent.openingElement : parent) === "label") return true;
  }
  return false;
}

function insideSubmittingForm(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxElement(parent) && jsxTagName(parent.openingElement) === "form") {
      return Boolean(attr(parent.openingElement, "onSubmit"));
    }
  }
  return false;
}

function emptyHandler(attribute) {
  const expression = attribute?.initializer
    && ts.isJsxExpression(attribute.initializer)
    ? attribute.initializer.expression
    : null;
  if (!expression || (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression))) return false;
  return ts.isBlock(expression.body) && expression.body.statements.length === 0;
}

function auditTsx(file) {
  const text = fs.readFileSync(file, "utf8");
  inventory.uiFiles++;
  if (hangul.test(text)) failures.push(`${relative(file)}: contains Korean text`);
  auditRetiredCopy(file, text);
  auditAbsoluteAssetLiterals(file, text, path.join(webRoot, "public"), true);
  auditStaticFetchTargets(file, text);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const labelTargets = new Set();
  const anchorTargets = new Set();

  function collectLabels(node) {
    const opening = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : null;
    if (opening) {
      const id = attrStaticValue(attr(opening, "id"));
      if (id) anchorTargets.add(id);
    }
    if (opening && jsxTagName(opening) === "label") {
      const target = attrComparableValue(attr(opening, "htmlFor"));
      if (target) labelTargets.add(target);
    }
    ts.forEachChild(node, collectLabels);
  }
  collectLabels(source);

  function visit(node) {
    const opening = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : null;
    if (opening) {
      const tag = jsxTagName(opening);
      if (tag === "button") {
        inventory.buttons++;
        const type = attrStaticValue(attr(opening, "type"));
        const handler = attr(opening, "onClick");
        const disabled = attr(opening, "disabled");
        const actionable = Boolean(handler || disabled || hasSpread(opening)
          || type === "submit" || type === "reset"
          || (!type && insideSubmittingForm(node)));
        if (!actionable) fail(source, node, "active button has no click or submit action");
        if (handler && emptyHandler(handler)) fail(source, node, "button has an empty click handler");
        const label = attrStaticValue(attr(opening, "aria-label"))
          || attrStaticValue(attr(opening, "title"))
          || descendantText(node).text;
        const hasNamedAttribute = hasAccessibleAttribute(opening, "aria-label")
          || hasAccessibleAttribute(opening, "aria-labelledby")
          || hasAccessibleAttribute(opening, "title");
        if (!label && !hasNamedAttribute && !descendantText(node).dynamic) {
          fail(source, node, "button has no accessible name");
        }
        if (label) inventory.visibleLabels.add(label);
      } else if (tag === "a" || opening.tagName.getText() === "Link") {
        inventory.links++;
        const hrefAttribute = attr(opening, "href");
        const href = attrStaticValue(hrefAttribute);
        if (!hrefAttribute) fail(source, node, `${tag} has no href`);
        if (href !== null && (!href || href === "#" || /^javascript:/i.test(href))) {
          fail(source, node, `${tag} has a broken href`);
        }
        if (href?.startsWith("#") && !anchorTargets.has(href.slice(1))) {
          fail(source, node, `${tag} targets missing id ${href}`);
        }
        if (href?.startsWith("/") && !internalTargetExists(href)) {
          fail(source, node, `${tag} targets missing internal route ${href}`);
        }
        const label = attrStaticValue(attr(opening, "aria-label"))
          || attrStaticValue(attr(opening, "title"))
          || descendantText(node).text;
        const hasNamedAttribute = hasAccessibleAttribute(opening, "aria-label")
          || hasAccessibleAttribute(opening, "aria-labelledby")
          || hasAccessibleAttribute(opening, "title");
        if (!label && !hasNamedAttribute && !descendantText(node).dynamic) {
          fail(source, node, `${tag} has no accessible name`);
        }
        if (label) inventory.visibleLabels.add(label);
      } else if (["input", "select", "textarea"].includes(tag)) {
        inventory.inputs++;
        const type = attrStaticValue(attr(opening, "type"));
        const ariaHidden = attrStaticValue(attr(opening, "aria-hidden"));
        if (type === "hidden" || ariaHidden === "true") {
          ts.forEachChild(node, visit);
          return;
        }
        const id = attrComparableValue(attr(opening, "id"));
        const named = Boolean(
          attr(opening, "aria-label")
          || attr(opening, "aria-labelledby")
          || attr(opening, "title")
          || insideLabel(node)
          || (id && labelTargets.has(id))
          || (type && ["submit", "button", "reset"].includes(type) && attr(opening, "value"))
          || hasSpread(opening)
        );
        if (!named) fail(source, node, `${tag} has no programmatic label`);
      } else if (canRenderButtonRole(opening)) {
        inventory.roleButtons++;
        if (!attr(opening, "onClick") && !attr(opening, "onPointerDown")) {
          fail(source, node, "role=button has no pointer action");
        }
        if (!attr(opening, "tabIndex")) fail(source, node, "role=button is not keyboard focusable");
        if (!attr(opening, "onKeyDown")) fail(source, node, "role=button has no keyboard activation handler");
        const label = attrStaticValue(attr(opening, "aria-label"))
          || attrStaticValue(attr(opening, "title"))
          || descendantText(node).text;
        const hasNamedAttribute = hasAccessibleAttribute(opening, "aria-label")
          || hasAccessibleAttribute(opening, "aria-labelledby")
          || hasAccessibleAttribute(opening, "title");
        if (!label && !hasNamedAttribute && !descendantText(node).dynamic) {
          fail(source, node, "role=button has no accessible name");
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function htmlAttrs(tag) {
  return new Map([...tag.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)]
    .map((match) => [match[1].toLowerCase(), match[2] ?? match[3] ?? ""]));
}

function auditHtml(file) {
  const text = fs.readFileSync(file, "utf8");
  const siblingJs = fs.readdirSync(path.dirname(file))
    .filter((name) => name.endsWith(".js"))
    .map((name) => fs.readFileSync(path.join(path.dirname(file), name), "utf8"));
  const inlineScripts = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  const scriptCorpus = [...siblingJs, ...inlineScripts].join("\n");
  inventory.uiFiles++;
  if (hangul.test(text)) failures.push(`${relative(file)}: contains Korean text`);
  auditRetiredCopy(file, text);
  const assetRoot = file.startsWith(path.join(repoRoot, "landing-assets"))
    ? path.join(repoRoot, "landing-assets")
    : path.join(repoRoot, "desktop-pet");
  auditAbsoluteAssetLiterals(file, text, assetRoot);
  auditHtmlAssetAttributes(file, text, assetRoot);
  const ids = new Set([...text.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]));
  for (const match of text.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)) {
    inventory.buttons++;
    const attributes = htmlAttrs(match[0]);
    const label = (attributes.get("aria-label") || match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!label) failures.push(`${relative(file)}: HTML button has no accessible name`);
    if (!attributes.has("type")) failures.push(`${relative(file)}: HTML button has no explicit type`);
    const id = attributes.get("id");
    const classNames = (attributes.get("class") || "").split(/\s+/).filter(Boolean);
    const boundInScript = Boolean(
      (id && scriptCorpus.includes(id))
      || classNames.some((className) => scriptCorpus.includes(className)),
    );
    if (!attributes.has("onclick") && attributes.get("type") !== "submit"
      && !attributes.has("disabled") && !boundInScript) {
      failures.push(`${relative(file)}: HTML button has no static action binding`);
    }
    if (label) inventory.visibleLabels.add(label);
  }
  for (const match of text.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    inventory.links++;
    const attributes = htmlAttrs(match[0]);
    const href = attributes.get("href");
    if (href === undefined || !href || href === "#" || /^javascript:/i.test(href)) {
      failures.push(`${relative(file)}: HTML anchor has a broken href`);
    }
    if (href?.startsWith("#") && !ids.has(href.slice(1))) {
      failures.push(`${relative(file)}: HTML anchor targets missing id ${href}`);
    }
    const label = (attributes.get("aria-label") || match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!label) failures.push(`${relative(file)}: HTML anchor has no accessible name`);
    if (label) inventory.visibleLabels.add(label);
  }
  for (const match of text.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    inventory.inputs++;
    const attributes = htmlAttrs(match[0]);
    if ((attributes.get("type") || "").toLowerCase() === "hidden"
      || (attributes.get("style") || "").replace(/\s+/g, "").toLowerCase().includes("display:none")
      || (attributes.get("aria-hidden") || "").toLowerCase() === "true") continue;
    const id = attributes.get("id");
    const before = text.slice(0, match.index);
    const lastLabelOpen = before.toLowerCase().lastIndexOf("<label");
    const lastLabelClose = before.toLowerCase().lastIndexOf("</label>");
    const wrappedByLabel = lastLabelOpen > lastLabelClose
      && text.toLowerCase().indexOf("</label>", match.index) !== -1;
    const hasLabel = Boolean(attributes.get("aria-label") || attributes.get("aria-labelledby")
      || attributes.get("title") || wrappedByLabel
      || (id && new RegExp(`<label\\b[^>]*\\bfor=["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(text)));
    if (!hasLabel) failures.push(`${relative(file)}: HTML ${match[1]} has no programmatic label`);
  }
  for (const match of text.matchAll(/<(?!button\b)([a-z][\w-]*)\b([^>]*\brole\s*=\s*["']button["'][^>]*)>([\s\S]*?)<\/\1>/gi)) {
    inventory.roleButtons++;
    const attributes = htmlAttrs(`<${match[1]} ${match[2]}>`);
    const id = attributes.get("id");
    const classNames = (attributes.get("class") || "").split(/\s+/).filter(Boolean);
    const tokens = [id, ...classNames].filter(Boolean);
    const scriptBound = tokens.some((token) => scriptCorpus.includes(token));
    const label = (attributes.get("aria-label")
      || match[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!label) failures.push(`${relative(file)}: HTML role=button has no accessible name`);
    if (!attributes.has("tabindex") || attributes.get("tabindex") === "-1") {
      failures.push(`${relative(file)}: HTML role=button is not keyboard focusable`);
    }
    if (!attributes.has("onclick") && !scriptBound) {
      failures.push(`${relative(file)}: HTML role=button has no click action`);
    }
    if (!attributes.has("onkeydown") && !scriptBound) {
      failures.push(`${relative(file)}: HTML role=button has no keyboard activation handler`);
    }
  }
}

for (const file of walk(path.join(webRoot, "src"), (file) => /\.(?:tsx|jsx)$/.test(file))) auditTsx(file);
for (const file of walk(path.join(webRoot, "src"), (file) => /\.(?:ts|js)$/.test(file))) {
  const text = fs.readFileSync(file, "utf8");
  inventory.uiFiles++;
  if (hangul.test(text)) failures.push(`${relative(file)}: runtime source contains Korean text`);
  auditRetiredCopy(file, text);
  auditAbsoluteAssetLiterals(file, text, path.join(webRoot, "public"), true);
  auditStaticFetchTargets(file, text);
}
for (const dir of [path.join(repoRoot, "landing-assets"), path.join(repoRoot, "desktop-pet")]) {
  for (const file of walk(dir, (file) => file.endsWith(".html"))) auditHtml(file);
}
for (const file of walk(path.join(webRoot, "public"), (file) => /\.(?:html|md|txt)$/i.test(file))) {
  const text = fs.readFileSync(file, "utf8");
  inventory.uiFiles++;
  if (hangul.test(text)) failures.push(`${relative(file)}: public text contains Korean text`);
  auditRetiredCopy(file, text);
}

for (const contract of requiredUiContracts) {
  const file = path.join(repoRoot, contract.file);
  const text = fs.readFileSync(file, "utf8");
  if (!contract.pattern.test(text)) {
    failures.push(`${contract.file}: ${contract.description}`);
  }
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.stderr.write(`UI contract audit failed with ${failures.length} issue(s).\n`);
  process.exit(1);
}

process.stdout.write(
  `UI contract audit passed: ${inventory.uiFiles} files, ${inventory.buttons} buttons, `
  + `${inventory.roleButtons} non-native button roles, ${inventory.links} links, ${inventory.inputs} inputs, `
  + `${inventory.visibleLabels.size} static labels.\n`,
);
