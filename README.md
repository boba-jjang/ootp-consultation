# OOTP Consultation

A personal web app that turns one team's Out of the Park Baseball CSV exports into consultation: positions, batting order, strategy sliders and development priorities, each with its evidence and confidence.

- Production: https://ootp-consultation.vercel.app
- Working on it locally: [docs/local-development.md](docs/local-development.md)
- The plan, phases and checklists: [docs/implementation-plan.md](docs/implementation-plan.md)
- Instructions for Claude Code: [CLAUDE.md](CLAUDE.md)

Quick start, with Node 24 and Corepack:

```sh
corepack enable
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then fill in the staging values
pnpm check-setup
pnpm dev
```
