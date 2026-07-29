# CHANGELOG

All notable changes to `pharma-oss` will be documented in this file.

The format is based on [Keep a CHANGELOG](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-29

### Added
- Standardized verification scripts in `package.json`: `npm test` (pinned to `TZ=Asia/Tokyo`), `npm run typecheck`, and `npm run verify`.
- Security warning banner component `DbSecurityBanner` when `NEXT_PUBLIC_DB_PASSWORD` is unconfigured. Styled with this project's existing CSS-variable/inline-style convention (no Tailwind — this codebase doesn't use it).
- Added `appVersion` field to anonymous diagnostic exports (`buildAnonymousDiagnosticExport`).
- Added `.github/dependabot.yml` for weekly minor/patch dependency update PR generation.
- Added secret scanning safety checks in `scripts/syncToPublicRepo.sh`.
- Added GitHub Actions workflow job separation (`static` vs `e2e`) and `.next/cache` build caching.

### Security
- Upgraded `rxdb` from `17.1.0` to `17.4.0` (actually installed, with `package-lock.json` regenerated — `npm ci` verified working), eliminating 5 high-severity vulnerabilities in the transitive `ws` dependency for production builds. `npm audit --omit=dev` now reports only pre-existing, unrelated `next`/`postcss`/`sharp` advisories (4 high), which require a separate `next` upgrade and are out of scope here.
- RxDB 17.4's replication types now require pull/push handlers to return `WithDeleted<...>` documents. Updated `src/lib/sync/replication_client.ts` and `src/lib/sync/hub_store.ts` types accordingly; verified the hub already returns full stored document state (including `_deleted`) at runtime, so this was a type-only fix with no behavior change.
