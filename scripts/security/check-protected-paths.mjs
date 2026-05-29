#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const protectedPaths = [
  ".agents/",
  ".claude/",
  ".kiro/",
  ".obsidian/",
  "test-results/",
  "packages/client/test-results/",
  "packages/client/playwright-report/",
  "packages/client/blob-report/",
  ".github/agents/",
  ".github/prompts/",
  ".github/skills/",
  ".github/scripts/auto-run.ps1",
  ".github/copilot-instructions.md",
  ".env",
  ".env.local",
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalize(path) {
  return path.replaceAll("\\", "/");
}

function isProtected(path) {
  const normalized = normalize(path);

  return protectedPaths.some((blocked) => {
    if (blocked.endsWith("/")) {
      return normalized === blocked.slice(0, -1) || normalized.startsWith(blocked);
    }

    if (blocked.includes("*")) {
      const escaped = blocked
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replaceAll("*", ".*");
      return new RegExp(`^${escaped}$`).test(normalized);
    }

    return normalized === blocked || normalized.startsWith(`${blocked}/`);
  }) || /^\.env\..*\.local$/.test(normalized);
}

function filesForMode() {
  if (process.argv.includes("--tracked")) {
    return git(["ls-files"]);
  }

  if (process.argv.includes("--staged")) {
    return git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  }

  return git(["diff", "--name-only", "--diff-filter=ACMR"]);
}

const violations = filesForMode().filter(isProtected);

if (violations.length > 0) {
  console.error("Protected private/agent files must not be committed:");
  for (const file of violations) {
    console.error(`  - ${file}`);
  }
  console.error("\nMove local-only content out of Git or add it to an ignored path.");
  process.exit(1);
}

console.log("Protected path check passed.");
