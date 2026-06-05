# Privacy Guard

DegreeForge blocks local agent state, personal IDE files, generated artifacts, and likely secrets from entering Git.

## Local Checks

Run the full check:

```sh
npm run privacy:check
```

Run only against staged files:

```sh
npm run privacy:staged
```

Install local Git hooks:

```powershell
npm run hooks:install
```

The installed hooks run `privacy:staged` before commits and `privacy:check` before pushes.

## Protected Paths

These paths are local-only and must not be tracked:

- `.agents/`
- `.claude/`
- `.kiro/`
- `.obsidian/`
- `test-results/`
- `packages/client/test-results/`
- `packages/client/playwright-report/`
- `packages/client/blob-report/`
- `.github/agents/`
- `.github/prompts/`
- `.github/skills/`
- `.github/scripts/auto-run.ps1`
- `.github/copilot-instructions.md`
- `.env`, `.env.local`, `.env.*.local`

## GitHub

`.github/workflows/privacy-guard.yml` runs the same checks on pushes and PRs, plus Gitleaks.
Also enable GitHub's native secret scanning, push protection, and branch protection for `main`/`master`.
