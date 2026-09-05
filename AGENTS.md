# AGENTS.md — YangYiSongRequest

Monorepo (npm workspaces: server, web). Root scripts orchestrate; work inside packages for most tasks.

## Essential Commands
- `npm install` — pulls kugoumusicapi git dep (needs GitHub access)
- `npm run dev` — concurrently starts kugou sidecar + server (tsx watch) + web (vite)
- `npm run build` — web first (`vue-tsc && vite build`), then server (`prisma generate && tsc`)
- `npm run typecheck` — server (tsconfig.typecheck.json, includes prisma/scripts) then web (vue-tsc)
- `npm test` — server only (vitest run)
- Single package: `npm run <cmd> --workspace server|web`

## Prisma & Database
- Dual schema: `DATABASE_PROVIDER=sqlite|postgresql` selects `schema.prisma` / `schema.postgresql.prisma` and migrations dir
- `prisma.config.ts` resolves paths and validates URL format at CLI time
- Always run `prisma generate` after provider switch; Prisma Client is build-time
- NixOS: `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npm run build` (or set custom engine binary)
- Seed / migrate: `npm run seed --workspace server`, `npm run migrate:deploy --workspace server`

## TypeScript Quirks
- Global override pins `typescript@6.0.3` (vue-tsc 3.x requires `typescript/lib/tsc`)
- Server build excludes tests/prisma/scripts; typecheck includes them via separate tsconfig
- ESM everywhere (`"type":"module"`, NodeNext resolution)

## Testing & Verification
- Tests only in server (`src/**/*.test.ts`)
- Smoke real sources: `npm run smoke:sources --workspace server`
- Wordmark SVG regen: `npm run wordmark --workspace web`

## Docker & Deployment
- Image: `ghcr.io/wemsur/yangyisongrequest:latest` (multi-arch, GHCR via docker.yml)
- SQLite requires volume mount for `/data`; PostgreSQL needs pre-created DB
- After provider change: rebuild image (Client baked at build time)
- Health: `GET /api/health`

## Documentation
- All docs now under `docs/` (PROGRESS.md, REQUIREMENTS.md moved)
- Update CONTEXT.md + API.md + DEPLOY.md when changing data model or deployment

## Git
- All commits must be GPG-signed (`git commit -S`)
