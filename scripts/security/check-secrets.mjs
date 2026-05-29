#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const MAX_FILE_BYTES = 1_000_000;

const secretPatterns = [
  { name: "Anthropic API key", regex: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "OpenAI API key", regex: /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { name: "GitHub token", regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g },
  { name: "GitHub fine-grained token", regex: /github_pat_[A-Za-z0-9_]{80,}/g },
  { name: "AWS access key", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "Google API key", regex: /AIza[0-9A-Za-z_-]{35}/g },
  { name: "Private key block", regex: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g },
  {
    name: "Likely hardcoded secret",
    regex:
      /\b(?:api[_-]?key|secret|token|password|private[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{24,}/gi,
  },
];

const allowlistedFiles = new Set([
  ".env.example",
  "packages/server/.env.example",
]);

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: options.encoding ?? "utf8" });
}

function listFiles() {
  if (process.argv.includes("--tracked")) {
    return git(["ls-files"])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readFileFromGit(path) {
  if (process.argv.includes("--tracked")) {
    return git(["show", `HEAD:${path}`]);
  }

  return git(["show", `:${path}`]);
}

function looksBinary(content) {
  return content.includes("\u0000");
}

const findings = [];

for (const file of listFiles()) {
  if (allowlistedFiles.has(file)) {
    continue;
  }

  let content;
  try {
    content = readFileFromGit(file);
  } catch {
    continue;
  }

  if (content.length > MAX_FILE_BYTES || looksBinary(content)) {
    continue;
  }

  for (const pattern of secretPatterns) {
    pattern.regex.lastIndex = 0;
    const matches = [...content.matchAll(pattern.regex)];
    for (const match of matches) {
      if (/\b(?:process\.env|import\.meta\.env|secrets\.)\b/.test(match[0])) {
        continue;
      }

      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push({ file, line, type: pattern.name });
    }
  }
}

if (findings.length > 0) {
  console.error("Possible secrets detected:");
  for (const finding of findings) {
    console.error(`  - ${finding.file}:${finding.line} (${finding.type})`);
  }
  console.error("\nRemove the secret, rotate it if it was real, and use .env/.env.local instead.");
  process.exit(1);
}

console.log("Secret pattern check passed.");
