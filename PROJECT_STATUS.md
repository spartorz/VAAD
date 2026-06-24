# VAAD — Project Status Document

> **Last Updated:** April 2026  
> **Status:** Active Development — Phase 2.6 Complete  
> **Purpose:** Source-of-truth technical and product reference for the VAAD platform.

---

## 1. Project Overview

**VAAD** (ועד בית) is a multi-tenant residential building management platform built for Israeli HOA (homeowners' association) administrators.

### Who it is for
- **Building boards (ועד בית):** Day-to-day building management
- **Treasurers:** Billing, charges, payment tracking
- **Management companies:** Multi-building oversight (ADMIN role)
- **Residents:** View-only portal access (limited scope, not yet fully built out)

### Core Use Cases
- Track residents and apartments in a building
- Generate and manage monthly charges and one-off fees
- Record payments and produce PDF invoices
- Send payment reminders via WhatsApp (manual copy-paste or automated API)
- Manage maintenance tickets and vendor assignments
- Store and share building documents
- Full audit trail of all actions across the system

---

## 2. System Capabilities

### Resident & Apartment Management
- Create, update, deactivate apartments with `active` / `inactive` status
- Residents linked to apartments with type (`owner` / `tenant`)
- Move-in / move-out flows with date tracking
- CSV import for bulk apartment and resident creation
- CSV/Excel exports for residents, apartments
- `whatsappOptIn` flag per resident for WhatsApp consent tracking (Phase 2.6)

### Billing & Charges
- Monthly due generation (bulk `generate_charges` action)
- Charge types: `monthly_due`, `one_time`, `repair`, `fund`
- Charge statuses: `open`, `voided`
- Payment methods: `bank_transfer`, `cash`, `credit_card`, `other`
- Payment statuses: `confirmed`, `pending`, `voided`
- Per-apartment statement view
- Monthly billing export (Excel)
- Payment export (Excel)

### Invoices
- PDF invoice generation via Puppeteer
- Sequential invoice numbering per building with configurable prefix
- Invoice view + PDF download, both audit-logged

### Notifications Engine (full feature, see Section 4)
- Payment reminder batches with targeting and scheduling
- Template system with variable substitution
- Multi-channel: `whatsapp_manual`, `whatsapp_api`, `email` (UI only), `sms` (UI only)
- Approval workflows, cooldown enforcement, consent checks
- WhatsApp Business API integration with Meta-compliant template sending (Phase 2.6)
- Scheduled cron job for auto-generation

### Maintenance Tickets
- Create, assign, comment, close tickets
- Priority levels: `low`, `medium`, `high`, `urgent`
- Statuses: `open`, `in_progress`, `waiting_vendor`, `resolved`, `closed`
- Vendor assignment per ticket

### Vendor Management
- Vendor directory per building
- Categories: `cleaning`, `elevator`, `electric`, `plumbing`, `security`, `landscaping`, `other`

### Document Storage
- File uploads attached to building
- Visibility tiers: `public`, `residents_only`, `board_only`
- Categories: `insurance`, `protocol`, `receipt`, `contract`, `other`

### Audit Logs
- Every significant action emits a structured `AuditLog` entry
- Entities tracked: charges, payments, tickets, documents, residents, apartments, vendors, buildings, users, notification batches, items, templates, settings
- Audit log viewer in the dashboard with export to Excel
- Security events: login success/fail, password reset, rate limit triggers

### Settings
- Per-building currency, due day, monthly due amount, invoice prefix
- Bank info storage (masked display)
- Notification settings sub-document (see Section 4)

---

## 3. Architecture Overview

### Framework & Runtime
- **Next.js 14** — App Router, server components, server actions via API routes
- **TypeScript** — strict, end-to-end typed
- **Node.js** runtime on Vercel (serverless functions)

### Frontend Structure
```
src/app/
  (dashboard)/
    dashboard/         — Summary stats
    apartments/        — Apartment list
    residents/         — Resident list
    billing/           — Charges + payments
    billing/invoice/   — Invoice viewer
    notifications/     — Notification center (batches, items, history)
    notifications/settings/ — Templates + notification settings
    tickets/           — Maintenance tickets
    vendors/           — Vendor directory
    documents/         — File library
    audit-log/         — Audit trail viewer
    settings/          — Building settings
  api/                 — All API route handlers (Next.js Route Handlers)
  auth/                — Login page
```

- **UI Library:** shadcn/ui (Radix UI primitives) + Tailwind CSS v4
- **Forms:** react-hook-form + Zod resolvers
- **Tables:** @tanstack/react-table
- **Toasts:** sonner
- **Locale:** Hebrew (RTL), `next-intl` for date formatting, `date-fns` for date math

### Backend / API Routes
All API routes live under `src/app/api/`. Key groups:

| Group | Purpose |
|---|---|
| `/api/auth/[...nextauth]` | NextAuth credentials auth |
| `/api/auth/forgot-password`, `/reset-password` | Password reset via JWT |
| `/api/apartments`, `/api/residents` | CRUD + move-in/move-out |
| `/api/charges`, `/api/payments` | Billing operations |
| `/api/billing/monthly` | Monthly billing summary |
| `/api/invoices/[chargeId]` | Invoice view + PDF |
| `/api/notifications/batches` | Batch CRUD, preview, approve, cancel, send |
| `/api/notifications/items` | Item list, retry, open-manual |
| `/api/notifications/templates` | Template CRUD + set-default |
| `/api/notifications/settings` | Notification settings read/write |
| `/api/notifications/candidates` | Targeting preview |
| `/api/notifications/history` | Cross-batch history |
| `/api/notifications/log` | Manual log entry |
| `/api/notifications/jobs/trigger` | Manual cron trigger from UI |
| `/api/cron/monthly-reminders` | Scheduled cron endpoint |
| `/api/webhooks/whatsapp` | Meta webhook: verify + delivery events |
| `/api/tickets`, `/api/vendors`, `/api/documents` | Operational modules |
| `/api/exports/*` | Excel exports for all entity types |
| `/api/import/*` | CSV bulk import |
| `/api/audit-logs` | Audit log query |
| `/api/dashboard` | Dashboard summary stats |
| `/api/health` | Health check |

### Database
- **MongoDB** via **Mongoose 9**
- One MongoDB Atlas cluster (or self-hosted)
- Connection pooling managed by `src/lib/db.ts` with singleton pattern

### Database Models

| Model | Collection | Key Fields |
|---|---|---|
| `Building` | `buildings` | name, address, timezone, bankInfo, settings, counters |
| `User` | `users` | buildingId, email, passwordHash, role, isActive |
| `Apartment` | `apartments` | buildingId, number, floor, status |
| `Resident` | `residents` | buildingId, apartmentId, name, phone, type, whatsappOptIn |
| `Charge` | `charges` | buildingId, apartmentId, type, amount, status, dueDate |
| `Payment` | `payments` | buildingId, chargeId, amount, method, status |
| `MaintenanceTicket` | `maintenancetickets` | buildingId, title, priority, status, assignedVendorId |
| `Vendor` | `vendors` | buildingId, name, category, phone, email |
| `Document` | `documents` | buildingId, title, category, visibility, url |
| `AuditLog` | `auditlogs` | buildingId, actorUserId, action, entityType, entityId, metadata |
| `PasswordResetToken` | `passwordresettokens` | userId, token, expiresAt |
| `NotificationTemplate` | `notificationtemplates` | buildingId, name, channel, bodyTemplate, whatsappTemplateName, whatsappComponents |
| `NotificationSettings` | `notificationsettings` | buildingId, reminderMode, cooldownDays, activeChannels, ... |
| `NotificationBatch` | `notificationbatches` | buildingId, templateId, channel, status, scheduledFor, stats |
| `NotificationItem` | `notificationitems` | batchId, residentId, status, skipReason, providerMessageId, whatsappTemplateName |

### Multi-Tenancy
- Every document (except `Building` itself) carries a `buildingId: ObjectId` field
- All API handlers validate `session.buildingId` against the requested resource
- `withAuth()` middleware enforces role + building scope on every route
- No cross-building data leakage is possible at the API layer
- ADMIN role can operate across buildings; all other roles are strictly scoped

### Authentication
- **NextAuth v4** with Credentials provider
- JWT session strategy; session payload includes `id`, `email`, `name`, `role`, `buildingId`, `residentId`, `apartmentId`
- Password hashing: `bcryptjs` (12 salt rounds)
- Roles: `ADMIN > MANAGEMENT > BOARD > TREASURER > RESIDENT`
- Role hierarchy enforced via `hasPermission(role, requiredRole)` utility

---

## 4. Notifications Module (Detailed)

### Overview
The notifications module manages the full lifecycle of outbound payment reminders: from targeting and batch generation, through template rendering, approval, delivery, and webhook-based status tracking.

### Core Models

#### `NotificationTemplate`
Defines the message content and delivery channel for a class of notifications.

- `channel`: `whatsapp_manual` | `whatsapp_api` | `email` | `sms`
- `type`: `payment_reminder` (only type currently)
- `bodyTemplate`: Free-text with `{{variable}}` placeholders
- `isDefault`: One default template per building
- `isActive`: Soft-disable without deleting
- `whatsappTemplateName`: Meta-approved template name (Phase 2.6)
- `whatsappLanguageCode`: Defaults to `he` (Phase 2.6)
- `whatsappComponents`: Array of component mappings (`header`, `body`, `button`) with variable name lists (Phase 2.6)

#### `NotificationBatch`
A single send event targeting a set of residents.

- `channel`: Channel used for this batch
- `templateId`: Linked template
- `status`: `draft` → `ready_for_review` → `approved` → `ready` → `processing` → `completed` / `failed` / `cancelled`
- `scheduledFor`: Optional send time (used by cron)
- `targetMonth`: YYYY-MM reference period
- `stats`: Aggregated counts — `total`, `pending`, `sent`, `failed`, `cancelled`, `delivered`, `read`
- `generatedBy`: `manual` | `cron`

#### `NotificationItem`
One record per resident per batch. Represents a single message attempt.

- `status`: `pending` → `queued` → `sent` → `delivered` → `read` | `failed` | `cancelled` | `opened_manual`
- `skipReason`: `no_phone` | `recently_contacted` | `inactive_resident` | `manually_excluded` | `no_consent`
- `providerMessageId`: Meta `wamid` (assigned on successful API send)
- `whatsappTemplateName`: Template used for this message (compliance record, Phase 2.6)
- `retryCount`, `failureReason`, `sentAt`, `deliveredAt`, `readAt`
- `metadata.renderContext`: Full variable context stored at generation time (used for Meta template parameter building)
- `metadata.whatsappLink`: Pre-built `wa.me` link for manual channel

### Targeting System
Batch generation evaluates each apartment in the building and applies skip filters:

1. **No active residents** → skip (`inactive_resident`)
2. **No phone number on primary resident** → skip (`no_phone`)
3. **Recently contacted** — apartment last received a notification within `cooldownDays` → skip (`recently_contacted`), if `skipRecentlyContactedResidents = true`
4. **Manually excluded** → skip (`manually_excluded`)
5. **No WhatsApp consent** — `resident.whatsappOptIn === false` for `whatsapp_api` channel → skip (`no_consent`) at send time (Phase 2.6)

A `/api/notifications/candidates` endpoint provides a live targeting preview without creating a batch.

### Cooldown Logic
- `NotificationSettings.cooldownDays` (default: 14)
- At batch generation, the most recent `NotificationItem` with status in `{sent, delivered, read, opened_manual, queued}` for each apartment is checked
- If `lastContactedAt` falls within the cooldown window, the item is generated with `status: cancelled` and `skipReason: recently_contacted`

### Approval Flow
Controlled by `requireApprovalBeforeSending` in `NotificationSettings`:

- `false` (default): Batches land in `ready` status and can be sent immediately
- `true`: Batches land in `ready_for_review`; a BOARD+ user must call `POST /api/notifications/batches/[batchId]/approve` before sending is permitted

### Templates & Variable Substitution
- Template body uses `{{variableName}}` placeholders
- `template-renderer.ts` resolves placeholders from a `TemplateRenderContext`:
  - `residentName`, `apartmentNumber`, `monthLabel`, `buildingName`
  - `balance`, `dueDate`, `reference`, `invoiceUrl`
- Rendered message stored in `NotificationItem.renderedMessage`
- Full `renderContext` also stored in `item.metadata.renderContext` for WhatsApp API parameter building

### Notification Channels

#### `whatsapp_manual`
- No API call; a pre-built `wa.me/?text=...` link is generated for each item
- Admin opens the link from the VAAD UI to launch WhatsApp Web
- Item transitions to `opened_manual` when the link is clicked
- No delivery confirmation available

#### `whatsapp_api`
- Sends via Meta WhatsApp Business Cloud API
- Requires Meta-approved templates (see Section 5)
- Full delivery tracking: `queued` → `delivered` → `read` via webhook
- `NOTIFICATIONS_PROVIDER_ENABLED=false` disables all API sends (safe mode)

#### `email` / `sms`
- Channels are defined in the type system and settings UI
- No provider implementation exists yet; reserved for future phases

### Scheduling (Cron)
- Endpoint: `GET /api/cron/monthly-reminders`
- Intended to run daily via Vercel Cron (configured in `vercel.json`)
- Auth: `Authorization: Bearer <CRON_SECRET>` header, or ADMIN/BOARD session
- Logic:
  1. Checks `reminderDayOfMonth` against today's date (skips if not the right day)
  2. Checks `paymentRemindersEnabled` and `reminderMode` (`scheduled_review` or `fully_automatic`)
  3. Queries all buildings (or a specific one if `?building_id=` is provided)
  4. Calls `batch-service.generateBatch()` per eligible building
  5. Auto-approves batch if `reminderMode = fully_automatic`
  6. Fully idempotent: re-running on the same day for the same building returns `already_exists`
- Supports `?dry_run=true` (no DB writes), `?month=YYYY-MM` (override month), `?building_id=` (single building)

### Reminder Modes
| Mode | Behavior |
|---|---|
| `manual_only` | Cron skips; admin must manually trigger batch generation from UI |
| `scheduled_review` | Cron generates batches; they land in `ready_for_review` for human approval |
| `fully_automatic` | Cron generates and auto-approves; send begins immediately (no human gate) |

### UX Flow (Frontend)
1. **Notifications page (`/notifications`):**
   - `StatusBanner` component shows the active batch if one exists in `ready_for_review`, `approved`, `ready`, or `processing`
   - Batch list shows all batches with status badges and item counts
   - Review view shows per-item targeting results with skip reason explanations

2. **Review & Send flow:**
   - Admin selects channel + template → preview candidate list
   - Create batch → review items → approve (if required) → send
   - Real-time progress visible during `processing`
   - Delivery status (delivered, read) updates asynchronously via webhook

3. **History tab:** Cross-batch item history, filterable by status and channel

4. **Settings page (`/notifications/settings`):**
   - Configure reminder mode, grace period, cooldown, approval requirements, active channels
   - Template management: create, edit, set default, toggle active
   - WhatsApp API section in template editor (Phase 2.6): template name, language code, variable mappings

---

## 5. WhatsApp Business Integration (Phase 2.6)

### Overview
Phase 2.6 upgraded the `whatsapp_api` channel from free-text sending to Meta-compliant template-based sending, as required by the WhatsApp Business API for business-initiated conversations.

**Rule:** All outbound business-initiated messages MUST use a Meta-approved template. Free-text sending is blocked for `whatsapp_api`.

### Meta Compliance Rules
- Business-initiated conversations require pre-approved message templates
- Templates are submitted to and approved by Meta via the Meta Business Manager
- Each template has a unique `name` (e.g., `payment_reminder_monthly`) and a `language` (e.g., `he`)
- Variables inside templates are positional (`{{1}}`, `{{2}}`) per component (header, body)
- VAAD maps named internal variables (e.g., `residentName`) to positional parameters

### Provider Abstraction
`src/lib/notifications/providers/`

```
providers/
  types.ts              — ProviderSendParams, NotificationProvider interface,
                          MetaTemplateComponent, MetaTemplateParameter
  whatsapp-business.ts  — WhatsAppBusinessProvider (Meta Graph API)
  index.ts              — getProviderForChannel() factory
```

`ProviderSendParams`:
```typescript
{
  to: string;              // phone number (E.164 format)
  message: string;         // rendered text (used for logging / manual fallback)
  template?: {             // when present → sends template payload
    name: string;
    languageCode: string;
    components: MetaTemplateComponent[];
  };
  referenceId?: string;
}
```

`WhatsAppBusinessProvider.send()` builds one of two Meta API payloads:
- **Template payload:** `{ type: "template", template: { name, language: { code }, components } }`
- **Text payload:** `{ type: "text", text: { body } }` — used only when no `template` is present (manual/legacy)

The factory `getProviderForChannel('whatsapp_api')` returns `null` when `NOTIFICATIONS_PROVIDER_ENABLED=false`, cleanly disabling all API sends.

### Send Pipeline (`send-service.ts`)

1. **Load batch + template** from DB
2. **Block if template not configured:** If `channel === 'whatsapp_api'` and `whatsappTemplateName` is absent → emit `notification_template_blocked` audit log → throw error, abort entire batch send
3. **Load all pending items** for the batch
4. **Batch-fetch consent status** — one DB query for all `residentId`s in the batch
5. **Per item:**
   - If `resident.whatsappOptIn === false` → mark `cancelled` with `skipReason: no_consent`, increment `consentSkipped`
   - Retrieve `renderContext` from `item.metadata.renderContext`
   - Call `buildWhatsAppComponents(template.whatsappComponents, renderContext)` → `MetaTemplateComponent[]`
   - Call `provider.send({ to, message, template: { name, languageCode, components } })`
   - On success: set `status: queued`, `providerMessageId: wamid`, `whatsappTemplateName` (compliance record), `sentAt`
   - On failure: set `status: failed`, `failureReason`, increment `retryCount`
6. **Refresh batch stats** after all items are processed
7. **Emit audit logs** for send start, each item success/failure

### Variable Mapping Engine (`template-renderer.ts`)

`buildWhatsAppComponents()` takes the template's `whatsappComponents` mapping and a `TemplateRenderContext`, and returns a `MetaTemplateComponent[]` ready for the Meta API.

For each component (header, body, button):
- Iterates `variableNames` in order
- Looks up each name in the render context
- Converts to `{ type: "text", text: value }` parameter
- Missing variables resolve to an empty string (safe degradation, no throw)

This mapping is stored in `NotificationTemplate.whatsappComponents`:
```typescript
// Example
whatsappComponents: [
  { type: 'body', variableNames: ['residentName', 'monthLabel', 'balance'] },
  { type: 'header', variableNames: ['buildingName'] },
]
```

### Webhook Handling (`/api/webhooks/whatsapp`)

**Verification (GET):**  
Meta sends a `GET` with `hub.mode`, `hub.verify_token`, and `hub.challenge`. The handler validates `hub.verify_token` against `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and echoes back the challenge.

**Delivery Events (POST):**
1. HMAC-SHA256 signature validated against `WHATSAPP_WEBHOOK_SECRET` (optional; skipped if env not set)
2. Payload parsed via `provider.parseWebhookEvents()`
3. Each event matched to a `NotificationItem` by `providerMessageId`
4. Status transitions applied — **forward only** (strict `STATUS_ORDER` guard):
   - `sent` → `delivered` (sets `deliveredAt`)
   - `delivered` → `read` (sets `readAt`)
   - Any → `failed` (sets `failureReason`, increments `retryCount`)
5. `refreshBatchStats()` called for each affected batch
6. Audit log emitted per event
7. Always returns HTTP 200 to prevent Meta retries

### Delivery Status Lifecycle
```
pending → queued → sent → delivered → read
                       ↘ failed
cancelled (skipped at generation or send time)
opened_manual (whatsapp_manual channel only)
```

### Consent Model (`whatsappOptIn`)
- Field: `Resident.whatsappOptIn?: boolean`
- `undefined` (no value set): consent assumed — backward compatible with existing residents
- `true`: explicitly opted in
- `false`: explicitly opted out — item skipped with `skipReason: no_consent`
- Only evaluated for `whatsapp_api` channel
- The `whatsapp_manual` channel is unaffected by this flag

---

## 6. Environment Variables

All variables should be set in Vercel's project environment settings (or `.env.local` for development).

### Database
| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB connection string (Atlas or self-hosted) |

### Authentication
| Variable | Required | Description |
|---|---|---|
| `NEXTAUTH_SECRET` | ✅ | Random secret for NextAuth JWT signing (min 32 chars) |
| `NEXTAUTH_URL` | ✅ | Full deployment URL, e.g. `https://vaad.yourdomain.com` |

### Password Reset
| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | ✅ | Secret for password-reset token signing |
| `APP_URL` | ✅ | Public app URL, used in password reset email links |

### Email (Resend)
| Variable | Required | Description |
|---|---|---|
| `RESEND_API_KEY` | ⚠️ Optional | Resend API key for password reset emails |
| `EMAIL_FROM` | ⚠️ Optional | Sender address, e.g. `noreply@yourdomain.com` |

### WhatsApp Business API
| Variable | Required | Description |
|---|---|---|
| `WHATSAPP_API_TOKEN` | ✅ for API sends | Meta Graph API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | ✅ for API sends | Meta phone number ID for the sender |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | ✅ for webhooks | Arbitrary token for Meta webhook subscription verification |
| `WHATSAPP_WEBHOOK_SECRET` | ⚠️ Recommended | App secret for HMAC-SHA256 webhook signature validation |

### Notification Provider
| Variable | Required | Description |
|---|---|---|
| `NOTIFICATIONS_PROVIDER_ENABLED` | ⚠️ Optional | Set to `false` to disable all API sends (safe mode for staging) |

### Cron
| Variable | Required | Description |
|---|---|---|
| `CRON_SECRET` | ✅ for production cron | Bearer token used by Vercel Cron to authenticate `GET /api/cron/monthly-reminders` |

---

## 7. Deployment Notes

### Platform
- Designed for **Vercel** deployment (serverless Next.js)
- Compatible with any Node.js-capable PaaS that supports Next.js 14

### Vercel Setup
1. Connect the GitHub repository to Vercel
2. Set all required environment variables in **Project Settings → Environment Variables**
   - Set `NEXTAUTH_URL` to the production domain
   - Use separate variable values per environment (production / preview / development)
3. Configure **Vercel Cron** in `vercel.json`:
   ```json
   {
     "crons": [{
       "path": "/api/cron/monthly-reminders",
       "schedule": "0 7 * * *"
     }]
   }
   ```
   Set `CRON_SECRET` and configure Vercel to send `Authorization: Bearer <CRON_SECRET>` with cron requests.

### Database
- MongoDB Atlas (recommended): create a cluster, whitelist `0.0.0.0/0` for Vercel serverless IPs, copy the connection string into `MONGODB_URI`
- Ensure the database user has `readWrite` permissions on the target database

### WhatsApp Production Setup
1. Create a Meta Business account and a WhatsApp Business app
2. Obtain a permanent access token and the phone number ID
3. Register webhook URL: `https://yourdomain.com/api/webhooks/whatsapp`
4. Set `WHATSAPP_WEBHOOK_VERIFY_TOKEN` to any secure random string and enter the same value in the Meta webhook configuration
5. Get `WHATSAPP_WEBHOOK_SECRET` from Meta app settings
6. Submit message templates for approval in Meta Business Manager before any sends

### Initial Data
- Run `npm run seed` to seed an initial building and admin user (development only)
- In production, the first building and admin user must be created directly in MongoDB or via a controlled seed script

---

## 8. Current Development Status

### Phase 1 — Core Platform ✅
- Building, apartment, resident data models
- User authentication (NextAuth credentials + JWT)
- Role-based access control
- Dashboard with summary stats
- Billing: charges, payments, invoice generation
- Maintenance tickets + vendor management
- Document library
- Audit log
- CSV import / Excel export

### Phase 2 — Notifications Engine ✅

#### Phase 2.1 — Foundation ✅
- `NotificationTemplate`, `NotificationBatch`, `NotificationItem` models
- `NotificationSettings` model (per-building)
- Batch generation logic with targeting and skip reasons
- Manual WhatsApp link generation (`whatsapp_manual`)
- Basic notifications UI

#### Phase 2.2 — Approval & Cooldown ✅
- `requireApprovalBeforeSending` workflow
- `ready_for_review` → `approved` status transition
- Cooldown enforcement at batch generation time
- Skip reason classification

#### Phase 2.3 — Template System ✅
- Template CRUD with variable substitution engine
- Default template per building
- Template active/inactive toggle
- Template editor in settings UI

#### Phase 2.4 — Provider & API Sending ✅
- `NotificationProvider` interface abstraction
- `WhatsAppBusinessProvider` (Meta Graph API)
- Provider factory with `NOTIFICATIONS_PROVIDER_ENABLED` guard
- `send-service.ts` orchestrating per-item sends
- `notification_provider_send_*` audit events

#### Phase 2.5 — Scheduling & Cron ✅
- `cron-service.ts` with `runMonthlyReminders()`
- `GET /api/cron/monthly-reminders` with CRON_SECRET + session auth
- Three reminder modes: `manual_only`, `scheduled_review`, `fully_automatic`
- Dry-run support, month override, building scope override
- Idempotency guard (no duplicate batches per building/month)

#### Phase 2.5.1 — UX Fast Flow ✅
- `StatusBanner` for active batch awareness on the notifications page
- Streamlined review → approve → send flow
- Improved item status display and skip reason labels

#### Phase 2.6 — WhatsApp Business Production Integration ✅
- Meta-compliant template-based sending for `whatsapp_api`
- `NotificationTemplate` extended with `whatsappTemplateName`, `whatsappLanguageCode`, `whatsappComponents`
- `buildWhatsAppComponents()` variable mapping engine
- `send-service.ts` rewritten: template validation gate, consent check, template parameter building
- `Resident.whatsappOptIn` consent model
- `NotificationItem.whatsappTemplateName` compliance record
- Webhook delivery status tracking (delivered, read, failed) with forward-only guard
- HMAC-SHA256 webhook signature validation
- `notification_template_blocked` audit event
- Template editor UI: WhatsApp API config section, missing-template warning badges

---

## 9. Known Limitations / Technical Debt

### WhatsApp API
- **No live Meta template validation:** VAAD does not call the Meta API to verify that `whatsappTemplateName` actually exists or is approved. A misconfigured template name will cause a failed API call at send time, not at configuration time.
- **Template component ordering is not validated:** The `whatsappComponents` mapping is trusting — if variable count does not match what Meta expects, the send will fail with a Meta API error.
- **Phone number formatting:** Phone numbers are stored as entered by the admin. VAAD does not enforce E.164 format. Invalid formats will cause Meta API rejections. No normalization layer exists.
- **`whatsapp_manual` and consent:** The `whatsappOptIn` flag is only enforced for `whatsapp_api`. The manual link channel bypasses consent checks entirely.

### Consent Model
- **Opt-in assumed for existing residents:** `whatsappOptIn === undefined` is treated as consent to maintain backward compatibility. This may not be suitable for strict GDPR / Israeli Privacy Law compliance without an explicit opt-in collection flow.
- **No UI to set `whatsappOptIn`:** The field exists in the model and is enforced in the send pipeline, but there is no admin UI or resident self-service UI to manage consent. Must be set directly in the database.

### Notification Engine
- **`email` and `sms` channels:** Types, settings, and UI references exist, but no provider implementation is wired. Selecting these channels has no effect beyond batch creation.
- **Retry logic:** `retryCount` is tracked but there is no automated retry scheduler. Retries must be manually triggered via `POST /api/notifications/items/[itemId]/retry`.
- **Batch sending is synchronous per item:** Items are sent sequentially in the `send-service`. For large buildings this could approach Vercel's function timeout limits. No queue/worker architecture exists.
- **Webhook events with no building scope:** The webhook handler uses a placeholder `buildingId` for the batch-level audit log entry, since a single webhook call can contain events from multiple buildings.

### General
- **No automated test suite:** No unit, integration, or E2E tests exist. All testing is manual.
- **No rate limiting on most endpoints:** Only some auth endpoints have rate limiting. API endpoints are not protected against abuse.
- **Resident portal is incomplete:** `RESIDENT` role users exist in the auth model but the resident-facing UI is not built.
- **Single database:** No read replica or connection pooling beyond Mongoose's built-in singleton. May not scale horizontally without changes.
- **Puppeteer for PDF generation:** Puppeteer is a heavyweight dependency for invoice PDFs; it may be slow on cold starts in serverless environments.

---

## 10. Next Steps

### Phase 2.6.1 — Meta Account Validation & Live Checks (Recommended)
- Add a "Test Connection" button in the WhatsApp API settings that calls the Meta API to verify `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`
- Add a Meta template validator: call `GET /{phone-number-id}/message_templates` to verify that the configured `whatsappTemplateName` exists, is approved, and matches the expected component/variable structure
- Phone number normalization: auto-format stored phone numbers to E.164 on save or at send time
- Display template status (APPROVED / PENDING / REJECTED) in the template editor

### Phase 2.7 — Consent Management UI
- Admin UI to view and set `whatsappOptIn` per resident
- Resident self-service opt-out via a link in WhatsApp messages
- Consent audit trail (who changed the flag, when)
- Bulk consent import from CSV

### Phase 2.8 — Automated Retry
- Scheduled retry job for `failed` items within a configurable window
- Retry backoff policy (e.g. retry after 1h, 6h, 24h)
- Max retry count enforcement with final `permanently_failed` status

### Phase 2.9 — Additional Channels
- Email channel via Resend (templates already stored, provider stub exists)
- SMS channel via a configurable provider (Twilio, 019, etc.)
- Channel fallback: if primary channel fails, attempt secondary

### Phase 3 — Resident Portal
- Resident login with read-only access to their apartment's charges and payments
- Self-service payment confirmation upload
- Notification history view
- Document access based on visibility tier

### Phase 4 — Reporting & Analytics
- Monthly income summary report (charges vs. payments)
- Notification delivery analytics (open rates, delivery rates per channel)
- Building-level dashboard with trend charts
- Export scheduler (automated monthly report emails to board)
