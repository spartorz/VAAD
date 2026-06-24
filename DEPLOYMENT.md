# VAAD Production Deployment (Vercel)

This document is the production deployment checklist for VAAD.

## 1) Required Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

- `MONGODB_URI`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `APP_BASE_URL`
- `CRON_SECRET`
- `NOTIFICATIONS_PROVIDER_ENABLED`

Optional integrations:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `WHATSAPP_API_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_API_VERSION`
- `WHATSAPP_WEBHOOK_SECRET`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

## 2) Vercel Deployment Steps

1. Connect the GitHub repository to Vercel.
2. Configure all required environment variables.
3. Deploy the project.
4. Open the app URL:
   - If DB is empty, you should be redirected to `/setup`.
   - If DB is initialized, login should work normally at `/login`.
5. Complete setup wizard (first deploy only) and verify dashboard access.
6. Verify cron endpoints if used:
   - `/api/cron/auto-billing`
   - `/api/cron/monthly-reminders`
   - Include header: `Authorization: Bearer <CRON_SECRET>`

## 3) First-Run Initialization Rules

- `/setup` is available only while system is uninitialized.
- `POST /api/setup/bootstrap` works only before initialization.
- After initialization, bootstrap returns `409 System already initialized`.
- Do **not** run seed scripts in production.

## 4) Storage Limitation on Vercel

Current uploads are stored on local filesystem under `public/uploads`.

This is **not production-safe** on Vercel because filesystem writes are ephemeral.

Recommended migration path:

1. Introduce storage abstraction (`local`, `blob`, `s3` providers).
2. Add cloud storage provider (Vercel Blob or S3).
3. Store object key + provider in `Document.file`.
4. Serve files through signed URLs / secured download endpoint.
5. Keep local provider only for development.

## 5) Post-Deployment Verification

- Login works with initialized admin user.
- Dashboard loads with correct building-scoped data.
- Import APIs (`apartments`, `residents`) still support dry-run + commit.
- Setup API is locked (`409`) after initialization.
- Audit logs capture setup/import activity.
