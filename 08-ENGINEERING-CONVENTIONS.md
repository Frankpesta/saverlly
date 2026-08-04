# Saverlly — Engineering Conventions

**Read this alongside `00-PROJECT-OVERVIEW.md` before starting Phase 1.** These conventions apply across the whole project, for its entire duration — every phase's Definition of Done should be read as implicitly including "and it follows this document."

---

## 1. Repository Structure

One monorepo, three independently deployable applications. None of them run in the same process or share a deploy pipeline — they share a repo purely for coordinated versioning, shared types, and simpler cross-referencing during development.

```
saverlly/
├── apps/
│   ├── backend/       # NestJS API — Phases 1, 2, 5
│   ├── dashboard/      # Next.js 16+ — admin console + kiosk portal — Phase 6 (07-FRONTEND.md)
│   └── extension/      # Chrome extension (Manifest V3) — Phase 3
├── packages/
│   ├── shared-types/    # TypeScript types shared between backend and dashboard (API DTOs, enums)
│   └── config/          # shared eslint/tsconfig/prettier config across apps
├── docs/
│   └── api/             # generated OpenAPI/markdown output lands here (see Section 3)
└── package.json          # workspace root (recommend Turborepo or Nx for task orchestration/caching)
```

- `apps/extension` should NOT import from `apps/backend` or `apps/dashboard` directly — it only talks to the backend over HTTP, same as any external client. Sharing `packages/shared-types` for the extension's API request/response shapes is fine and encouraged, to keep the extension's API client in sync with the backend without manual duplication.
- The desktop agent (Phase 4) is a separate concern from this monorepo's three apps — evaluate whether it belongs as a fourth `apps/` entry or its own repo when Phase 4 starts, since it's a Windows-native build target with a very different toolchain (packaged via `pkg`) than the other three. Default recommendation: keep it in `apps/agent` for consistency unless the build tooling proves painful to co-locate.
- Recommend **Turborepo** for monorepo task running (build/test/lint across all three apps with caching) given the Next.js-adjacent tooling already in use — confirm no objection before wiring it up, but proceed with it as the default if none is raised.

## 2. Testing Strategy

**Unit tests are required for everything.** On top of that, **integration tests are required, not optional, for two categories of logic** where a unit test alone can't catch the real failure mode:

### Money-handling logic (integration-tested)
- Commission calculation (`kioskShareAmount` computation, Phase 5)
- Payout aggregation (only `CONFIRMED` events ever included — this specific invariant needs a real DB-backed test, not just a mocked one, since the risk is a query/filter bug, not a math bug)
- Stripe transfer flows (use Stripe's test mode + webhooks in a real integration test, not a mocked Stripe client, for at least the core paths: successful transfer, failed transfer, webhook status update)
- Coupon success/fail counters and commission event status transitions (`PENDING` → `CONFIRMED` → `REVERSED`)

### RBAC / tenant-isolation logic (integration-tested)
- Every cross-tenant boundary needs a real integration test that authenticates as Kiosk A and asserts Kiosk B's data is unreachable (403/404), hitting the actual guards + DB, not a mocked permission check. This is the category most likely to have a subtle bug that only shows up against the real auth/DB layer.
- Device-token auth boundaries (a device token for Device X should never authorize access to Device Y's resources, or to any human-only route)

### Everything else (unit-tested)
- Business logic that doesn't touch money or cross-tenant boundaries (coupon recipe validation, step-down detection logic, announcement repeat-policy calculation, etc.) is fine with standard unit test coverage.

### Tooling
- **Jest** across all three apps (NestJS and Next.js both have first-class Jest support) — standardize on it unless a specific app's tooling makes a different runner clearly better.
- Backend integration tests should run against a real (test/ephemeral) PostgreSQL instance, not an in-memory substitute, given how much of the risk here is DB-query-shaped rather than logic-shaped.
- Extension tests: unit-test the pure logic (step-down detection, recipe matching) directly; DOM-interaction logic (`coupon-applier.ts`) is harder to integration-test in CI — cover it primarily through manual QA against real test merchants, and keep the pure-logic seams unit-tested.

## 3. API Documentation

- Use `@nestjs/swagger` to annotate controllers/DTOs directly in the backend code — this generates a live OpenAPI spec and Swagger UI automatically, with no separately maintained docs to fall out of sync.
- Export the generated OpenAPI spec to markdown (via a spec-to-markdown tool, e.g. `widdershins` or similar) into `docs/api/` as part of the build/CI pipeline, so markdown output is always current with the actual API, not hand-written and manually kept in sync.
- The client will publish this markdown to their documentation platform of choice — no specific platform integration needs to be built now, just clean, current markdown output or suggest the best that integrates expertly 
- Every endpoint across Phases 1, 2, and 5 should have Swagger annotations (`@ApiOperation`, `@ApiResponse`, DTO decorators) as part of that phase's own Definition of Done, not deferred to a separate documentation pass at the end.

## 4. Definition of Done (applies project-wide, in addition to each phase's own)

- [ ] Monorepo scaffolded with the three apps + shared packages structure above
- [ ] Jest configured and running in CI for all three apps
- [ ] At least one real integration test exists for: cross-tenant data isolation, commission confirmation → payout eligibility, and a Stripe test-mode transfer
- [ ] Swagger annotations present on all backend endpoints, OpenAPI spec generating successfully
- [ ] Markdown API docs exporting successfully from the OpenAPI spec into `docs/api/`
