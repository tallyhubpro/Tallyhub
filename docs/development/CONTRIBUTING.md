# Contributing to Tally Hub

Thanks for your interest in improving Tally Hub! This guide explains how to get set up, make changes, and submit high‑quality contributions.

## 📦 Project Philosophy
Tally Hub aims to be a production‑ready, low‑latency, hardware + software tally ecosystem with:
- Clear architecture
- Predictable releases
- Safe firmware + server evolution

## 🧱 Architecture Overview
- Server: Node.js + TypeScript (`src/`)
- Realtime: WebSocket + UDP discovery & messaging
- Firmware: `firmware/<device>/` (PlatformIO)
- Desktop Apps: Electron wrappers (`platforms/windows/`, `platforms/macos/`)
- Docs: MkDocs site under `docs/`

## 🛠 Local Development
```bash
npm install
npm run dev         # Start server with live reload
npm run typecheck   # Static type checking (no emit)
npm run lint        # Lint only
npm run lint:fix    # Lint with auto-fix
npm run format      # Prettier formatting
npm run build       # Emit compiled JS in dist/
```
Logs are written to `./logs`. Clean them:
```bash
npm run logs:prune  # Removes logs older than 14 days
```

## 🧪 (Future) Tests
Test infra placeholder. Suggested structure:
```
src/__tests__/*.test.ts
```
Later: integrate Vitest or Jest.

## 🔀 Branching Model
- `main`: Stable, production-ready
- `feature/<short-name>`: New features
- `fix/<short-name>`: Bug fixes
- `chore/<task>`: Tooling / maintenance

## ✅ Pull Request Checklist
Before opening a PR:
- [ ] Code compiles (`npm run build`)
- [ ] Type checks pass (`npm run typecheck`)
- [ ] Lint passes (`npm run lint`)
- [ ] No large unrelated formatting churn
- [ ] Added docs for user-facing changes
- [ ] Updated firmware notes if protocol changed

## 🧹 Code Style
- Prettier enforces formatting
- ESLint enforces imports ordering & TS hygiene
- Use explicit return types on exported functions/classes
- Prefer `readonly` on constants and config objects

## 🗂 File & Module Guidelines
- `src/core/`  Core domain services (TallyHub, mixers, comms)
- `src/routes/` Express route bindings only
- `src/types/`  Shared type declarations
- Avoid circular dependencies—extract shared types/utilities

## 🌐 Environment Variables
Provide new env vars in `.env.example` and document in README + docs.
Never commit real secrets.

## 🔐 Security & Protocol Changes
If you alter UDP or WebSocket payload formats:
1. Update firmware repos / folders
2. Add migration note in `docs/development/`
3. Bump minor version (or major if breaking)

## 📝 Commit Messages
Format (Conventional-ish):
```
<type>(scope?): short summary

Optional body explaining rationale / impacts.
```
Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `build`.
Examples:
```
feat(mixer): add dynamic mixer removal API
fix(udp): guard against malformed discovery packets
chore(ci): add lint workflow
```

## 🚀 Release Process (Manual for now)
1. Update CHANGELOG (future improvement)
2. Bump version in `package.json`
3. Tag: `git tag vX.Y.Z && git push --tags`
4. Publish release notes on GitHub

## 🧯 Troubleshooting
| Issue | Action |
|-------|--------|
| Port already in use | Ensure previous dev server stopped; or change `PORT` env var |
| Devices not discovering hub | Check firewall; set `DISABLE_MDNS=0`; inspect UDP logs |
| High CPU | Run with `NODE_ENV=production` for benchmarking |

## 🗺 Roadmap (High-Level)
- CI: GitHub Actions (lint + typecheck)
- Docker image
- ATEM protocol enhancements
- Test harness for UDP simulation

## 🙌 Thanks
Your contributions help empower more productions with reliable tally systems. Raise an issue if unsure before large changes.

---
Made with ❤️  
