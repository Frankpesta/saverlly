# Saverlly — Phase 1: Core Platform

**Prerequisite reading:** `00-PROJECT-OVERVIEW.md`

## Goal

Stand up the NestJS backend with PostgreSQL/Prisma, multi-tenant data model, role-based auth for human users, device-token auth scaffolding for machine clients, and the core CRUD/API surface for kiosks, locations, devices, and users. By the end of this phase, admin can create a kiosk and set it active, a kiosk-owner can log in and manage their own locations/devices freely (no approval step), and a new computer can self-register against a location using a setup code. Assume AWS deployment at the end of everything. Recommend whether to setup AWS at first for testing using API testing softwares.

## Tech for This Phase

- NestJS (TypeScript)
- PostgreSQL + Prisma
- `@nestjs/jwt` + `@nestjs/passport` for user auth
- bcrypt (or argon2) for password hashing
- class-validator / class-transformer for DTO validation
- NestJS Guards for role + tenant scoping

## Data Model (Prisma schema — this phase)

```prisma
enum UserRole {
  ADMIN
  KIOSK_OWNER
  LOCATION_MANAGER
}

enum KioskStatus {
  ACTIVE
  INACTIVE
}

model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String
  role         UserRole
  kioskId      String?   // null for ADMIN
  kiosk        Kiosk?    @relation(fields: [kioskId], references: [id])
  managedLocationIds String[] // used only for LOCATION_MANAGER role
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model Kiosk {
  id                String        @id @default(uuid())
  name              String
  status            KioskStatus   @default(ACTIVE) // admin sets directly, no approval workflow
  revenueSharePct   Decimal       @db.Decimal(5, 2) // e.g. 30.00 = 30%
  contactEmail      String
  stripeAccountId   String?       // Stripe Connect account, set once kiosk connects payouts (Phase 5)
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  locations         Location[]
  users             User[]
  announcements     Announcement[]
}

model Location {
  id          String    @id @default(uuid())
  kioskId     String
  kiosk       Kiosk     @relation(fields: [kioskId], references: [id])
  name        String
  address     String
  city        String
  state       String
  country     String
  latitude    Float?
  longitude   Float?
  tags        String[] // e.g. ["mall", "downtown", "high-traffic"] — used for future ad targeting
  createdAt   DateTime  @default(now())
  devices           Device[]
  locationSetupCodes LocationSetupCode[]
}

model LocationSetupCode {
  id          String    @id @default(uuid())
  locationId  String
  location    Location  @relation(fields: [locationId], references: [id])
  code        String    @unique // short, human-enterable (e.g. 8 chars, unambiguous charset)
  active      Boolean   @default(true) // kiosk owner can revoke/regenerate
  createdAt   DateTime  @default(now())
}

model Device {
  id           String    @id @default(uuid())
  locationId   String
  location     Location  @relation(fields: [locationId], references: [id])
  label        String    // e.g. "Computer 4"
  active       Boolean   @default(true) // kill-switch — no approval needed to start, but can be disabled any time
  lastSeenAt   DateTime?
  createdAt    DateTime  @default(now())
  deviceTokens DeviceToken[]
}

model DeviceToken {
  id         String    @id @default(uuid())
  deviceId   String
  device     Device    @relation(fields: [deviceId], references: [id])
  token      String    @unique
  revoked    Boolean   @default(false)
  createdAt  DateTime  @default(now())
}
```

## Auth Design

### Human users (JWT)
- `POST /auth/login` — email + password → access token (short-lived, ~15 min) + refresh token (long-lived, ~7-30 days)
- `POST /auth/refresh` — exchange refresh token for new access token
- Passwords hashed with bcrypt (cost factor 12+), never stored/logged in plaintext
- JWT payload includes: `userId`, `role`, `kioskId` (null for admin)

### Machine clients (device tokens)
- Device tokens are opaque, high-entropy strings (min 32 bytes, base64url), stored hashed in DB (not plaintext) — compare via hash on each request
- Issued immediately once a `Device` record is created via a valid `LocationSetupCode` — **no approval step**. The device is functional the moment it registers, since the parent kiosk being `ACTIVE` is the only gate.
- Device registration flow (used by the desktop agent in Phase 4): agent submits the location setup code + basic machine metadata → backend validates the code is `active` and its parent kiosk `status = ACTIVE` → creates the `Device` record, issues a token immediately, returns it in the same response.
- If the parent kiosk is later set to `INACTIVE`, or the specific `Device.active` is set to `false`, existing device tokens should fail auth on next use (check kiosk status + device active flag on every machine-authenticated request, not just at issuance).
- Machine requests authenticate via `Authorization: Bearer <device_token>` header, routed through a separate `DeviceAuthGuard` — never the same guard as human JWT routes.

## RBAC Rules

- `ADMIN` — full access to all endpoints, all tenants. Can also manage each kiosk's own user accounts and roles (not just the kiosk owner managing themselves).
- `KIOSK_OWNER` — full access to their own `kioskId`'s resources only (locations, devices, announcements, their own commission/payout view). Enforced via a `TenantScopeGuard` that compares the JWT's `kioskId` against the resource being accessed on every request.
- `LOCATION_MANAGER` — same as kiosk-owner but further restricted to `managedLocationIds`.
- Every controller method must be decorated with an explicit `@Roles(...)` guard — no endpoint should be reachable without an explicit role check. Default-deny, not default-allow.

## API Endpoints (this phase)

**Auth**
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

**Kiosks** (admin only, except GET own for kiosk-owner)
- `POST /kiosks` — create kiosk (admin), defaults to `status: ACTIVE`
- `GET /kiosks` — list all (admin)
- `GET /kiosks/:id` — get one (admin, or kiosk-owner if it's their own)
- `PATCH /kiosks/:id` — update (admin) — includes `status` and `revenueSharePct`
- `PATCH /kiosks/:id/status` — dedicated toggle endpoint (admin) — sets `ACTIVE`/`INACTIVE`

**Kiosk User Management** (admin manages any kiosk's users; kiosk-owner manages their own)
- `POST /kiosks/:id/users` — admin creates a user under a specific kiosk (owner or location-manager)
- `GET /kiosks/:id/users`
- `PATCH /kiosks/:id/users/:userId` — role changes, disable account, etc.

**Locations** (kiosk-owner scoped to own kiosk, admin all)
- `POST /locations`
- `GET /locations`
- `GET /locations/:id`
- `PATCH /locations/:id` — includes `tags`
- `DELETE /locations/:id`
- `POST /locations/:id/setup-codes` — generate a new `LocationSetupCode` (kiosk-owner or admin)
- `GET /locations/:id/setup-codes`
- `PATCH /locations/:id/setup-codes/:codeId` — revoke/deactivate a code

**Devices** (kiosk-owner scoped, admin all)
- `GET /devices`
- `GET /devices/:id`
- `PATCH /devices/:id` — includes `active` toggle (the kill-switch — kiosk-owner can disable their own devices, admin can disable any)
- `DELETE /devices/:id`
- `POST /devices/register` — machine-initiated, no human auth required but rate-limited; accepts a `LocationSetupCode` + machine metadata, returns a device token immediately if valid

**Users**
- `GET /users/me`

## Definition of Done

- [ ] Admin can log in and create a kiosk (defaults to active, no approval step)
- [ ] Admin can toggle a kiosk's status and this immediately affects whether its devices can authenticate
- [ ] Kiosk-owner can log in and only ever see/modify their own kiosk's locations and devices (verify with automated tests that cross-tenant access returns 403/404)
- [ ] A kiosk-owner can generate a reusable location setup code, and multiple devices can register against it without any approval step
- [ ] A device can be individually disabled (`active: false`) by the kiosk-owner or admin, and its token immediately stops working
- [ ] Admin can create/manage user accounts under any kiosk, not just kiosk-owners managing themselves
- [ ] All endpoints have explicit role guards — no endpoint is reachable without one
- [ ] `revenueSharePct` is editable per kiosk by admin only
