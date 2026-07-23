import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const CONTROLLED_COMPONENT = "web/src/components/SeasonStartingSoon.tsx";
const EXPECTED_USAGE = new Map([
  ["web/src/components/App.tsx", false],
  ["web/src/components/RaisePitch.tsx", true],
]);
const HOME_SURFACES = [
  "web/src/components/App.tsx",
  "web/src/components/Hero.tsx",
  "web/src/components/Stats.tsx",
  "web/src/components/RaisePitch.tsx",
  "web/src/components/events/SeasonEventsRail.tsx",
  "web/src/components/OrchestrationExplainer.tsx",
  "web/src/components/Pricing.tsx",
];
const STARTING_SOON = /starting\s+soon/i;

function relative(root, file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function walkTsx(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTsx(absolute));
    } else if (entry.isFile() && absolute.endsWith(".tsx")) {
      files.push(absolute);
    }
  }
  return files;
}

function jsxTagName(node, source) {
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText(source);
  if (ts.isJsxOpeningElement(node)) return node.tagName.getText(source);
  return "";
}

function staticText(node) {
  if (!node) return "";
  if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return staticText(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return `${staticText(node.left)}${staticText(node.right)}`;
  }
  if (ts.isConditionalExpression(node)) {
    return `${staticText(node.whenTrue)} ${staticText(node.whenFalse)}`;
  }
  if (ts.isJsxExpression(node)) return staticText(node.expression);
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
    return node.children.map((child) => {
      if (ts.isJsxSelfClosingElement(child) && child.tagName.getText() === "br") return " ";
      return staticText(child);
    }).join(" ");
  }
  if (ts.isTemplateExpression(node)) {
    return `${node.head.text} ${node.templateSpans.map((span) => (
      `${staticText(span.expression)} ${span.literal.text}`
    )).join(" ")}`;
  }
  return "";
}

function sourceFile(file) {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

export function seasonStartingSoonContractFailures(repoRoot) {
  const root = path.resolve(repoRoot);
  const failures = [];
  const controlledFile = path.join(root, CONTROLLED_COMPONENT);
  if (!fs.existsSync(controlledFile)) {
    return [`${CONTROLLED_COMPONENT}: controlled label component is missing`];
  }

  const controlledSource = fs.readFileSync(controlledFile, "utf8");
  if (!controlledSource.includes("<>STARTING SOON</>")
    || !controlledSource.includes("<>STARTING<br />SOON</>")) {
    failures.push(`${CONTROLLED_COMPONENT}: controlled one-line and multiline labels changed`);
  }

  const usages = [];
  const srcRoot = path.join(root, "web/src");
  for (const file of walkTsx(srcRoot)) {
    const source = sourceFile(file);
    const visit = (node) => {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
        && jsxTagName(node, source) === "SeasonStartingSoon") {
        const multiline = node.attributes.properties.some((attribute) => (
          ts.isJsxAttribute(attribute) && attribute.name.text === "multiline"
        ));
        usages.push({ file: relative(root, file), multiline });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  if (usages.length !== EXPECTED_USAGE.size) {
    failures.push(`home must render exactly ${EXPECTED_USAGE.size} controlled STARTING SOON labels; found ${usages.length}`);
  }
  for (const [file, multiline] of EXPECTED_USAGE) {
    const matching = usages.filter((usage) => usage.file === file && usage.multiline === multiline);
    if (matching.length !== 1) {
      failures.push(`${file}: expected exactly one ${multiline ? "multiline" : "one-line"} controlled label`);
    }
  }
  for (const usage of usages) {
    if (!EXPECTED_USAGE.has(usage.file)) {
      failures.push(`${usage.file}: unexpected controlled STARTING SOON label`);
    }
  }

  for (const relativeFile of HOME_SURFACES) {
    const file = path.join(root, relativeFile);
    if (!fs.existsSync(file)) {
      failures.push(`${relativeFile}: audited home surface is missing`);
      continue;
    }
    const source = sourceFile(file);
    let rawLabel = false;
    const visit = (node) => {
      if (rawLabel) return;
      if ((ts.isStringLiteralLike(node) || ts.isBinaryExpression(node)
          || ts.isTemplateExpression(node) || ts.isJsxElement(node)
          || ts.isJsxFragment(node))
        && STARTING_SOON.test(staticText(node).replace(/\s+/g, " ").trim())) {
        rawLabel = true;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (rawLabel) {
      failures.push(`${relativeFile}: raw STARTING SOON copy bypasses SeasonStartingSoon`);
    }
  }

  return failures;
}

function runCli() {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(import.meta.dirname, "../..");
  const failures = seasonStartingSoonContractFailures(root);
  if (failures.length) {
    process.stderr.write(`${failures.join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write("Season STARTING SOON contract passed: exactly 2 controlled home labels.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli();
}
