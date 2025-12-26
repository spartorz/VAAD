# VAAD Known Gaps and Next Phase

> ⚠️ **PLANNING DOCUMENT ONLY**
> 
> This document identifies gaps and proposes improvements. 
> **Do not modify code yet** - this is for planning purposes.

## Current Gaps by Priority

### P0 - Must Fix Before Any Users

| Gap | Current State | Risk | Proposed Fix |
|-----|--------------|------|--------------|
| **Rate Limiting** | None | Brute force attacks, API abuse | Add rate limiter middleware (5 login attempts/15min, 100 API calls/min) |
| **Error Tracking** | Console only | Bugs go unnoticed | Integrate Sentry for error monitoring |
| **Password Reset** | Not implemented | Users locked out | Build email-based reset flow |
| **Production Secrets** | Dev values in examples | Security breach | Generate strong NEXTAUTH_SECRET, rotate keys |
| **MongoDB Security** | Likely open IP allowlist | Database exposure | Restrict to app server IPs only |

### P1 - Required Before Paid Launch

| Gap | Current State | Risk | Proposed Fix |
|-----|--------------|------|--------------|
| **File Storage** | Local `/public/uploads` | Data loss, no CDN, public URLs | Migrate to S3 with signed URLs |
| **File Validation** | No MIME check | Malicious uploads | Whitelist PDF, images only |
| **Email Notifications** | None | Poor UX, missed charges | Integrate Resend/SendGrid |
| **Backups** | None | Data loss | MongoDB Atlas auto-backup + test restore |
| **Logging** | Console | No debugging in prod | Structured JSON logs + aggregation |
| **Health Checks** | None | No monitoring | Add `/api/health` endpoint |
| **Transaction Safety** | None | Inconsistent state | MongoDB transactions for ledger+audit pairs |
| **Tests** | None | Regressions undetected | Add unit/integration/e2e tests |

### P2 - Required for Scale

| Gap | Current State | Risk | Proposed Fix |
|-----|--------------|------|--------------|
| **Multi-Building** | User has single buildingId | Can't serve management companies | Add UserBuilding junction, switcher UI |
| **Auto Charge Generation** | Manual button only | Forgotten charges | Vercel cron job for monthly auto-gen |
| **Payment Gateway** | Manual recording | Friction, errors | Stripe integration for online payments |
| **WhatsApp Notifications** | None | Users prefer WhatsApp | Twilio/WhatsApp Business API |
| **Excel Export** | None | Manual data extraction | Add export buttons to all tables |
| **Reports** | Basic dashboard | No insights | Date-range reports, charts, delinquency lists |
| **Full-Text Search** | Regex only | Poor search UX | MongoDB Atlas Search or Algolia |
| **Ticket Attachment Cleanup** | Never deleted | Storage bloat | TTL policy or archival |
| **Mobile App** | Responsive web only | Native UX expected | React Native or PWA |

## UX/Product Improvements

### Tables and Data Management

| Issue | Impact | Proposed Fix |
|-------|--------|--------------|
| No inline editing | Extra clicks | Add inline edit mode |
| No bulk actions | Tedious repetition | Add multi-select + bulk void/delete |
| No column customization | Fixed layout | Add column visibility toggles |
| No export | Manual copying | Add CSV/Excel export buttons |

### Resident Experience

| Issue | Impact | Proposed Fix |
|-------|--------|--------------|
| No pay button | Confusion on how to pay | Add "Pay Now" with instructions/gateway |
| No PDF statement | Can't print/share | Generate downloadable PDF |
| No charge notifications | Surprised by balance | Email/push when charge created |
| No payment confirmation | Uncertainty | Email receipt when payment recorded |

### Board/Treasurer Dashboards

| Issue | Impact | Proposed Fix |
|-------|--------|--------------|
| No date filtering | Current month only | Add date range picker |
| No charts | Hard to see trends | Add Recharts visualizations |
| No delinquency report | Chasing payments manually | List apartments by days overdue |
| No collection metrics | No KPIs | Show collection rate, avg days to pay |

### Mobile Experience

| Issue | Impact | Proposed Fix |
|-------|--------|--------------|
| Dense tables on phone | Unusable | Card-based views on mobile |
| Small touch targets | Mis-taps | Larger buttons, more spacing |
| No swipe actions | Extra taps | Add swipe to edit/void |

## Proposed Next Phase Plan

### Phase 1: Security Hardening (Week 1-2)

**Goal**: Make system secure enough for real users

- [ ] Add rate limiting to login and all API routes
- [ ] Integrate Sentry for error tracking
- [ ] Implement password reset via email
- [ ] Generate production-grade secrets
- [ ] Configure MongoDB IP allowlist
- [ ] Add file type validation for uploads
- [ ] Write critical RBAC tests

**Acceptance Criteria**:
- Rate limiting triggers after 5 failed logins
- Errors appear in Sentry dashboard
- Password reset email flow works end-to-end
- All tests pass in CI

### Phase 2: Production Infrastructure (Week 2-3)

**Goal**: Production-ready infrastructure

- [ ] Migrate file uploads to S3
- [ ] Implement signed URLs for private documents
- [ ] Set up MongoDB Atlas backups
- [ ] Add structured logging
- [ ] Create health check endpoint
- [ ] Deploy to Vercel with proper env vars

**Acceptance Criteria**:
- Files stored in S3, not local disk
- Private documents inaccessible without valid session
- Daily backups running
- Logs queryable in aggregation service

### Phase 3: Notifications (Week 3-4)

**Goal**: Users notified of important events

- [ ] Set up email provider (Resend/SendGrid)
- [ ] Send welcome email on account creation
- [ ] Send email when charge created
- [ ] Send email when payment recorded
- [ ] Send weekly digest for open tickets (Board)

**Acceptance Criteria**:
- All transactional emails delivered reliably
- Users can view charges without manually checking

### Phase 4: Beta Testing (Week 4-6)

**Goal**: Validate with real buildings

- [ ] Onboard 2-3 real buildings
- [ ] Import their data
- [ ] Train board members
- [ ] Collect feedback systematically
- [ ] Fix critical bugs weekly

**Acceptance Criteria**:
- 2+ buildings actively using system
- Feedback collected and prioritized
- No P0 bugs open

### Phase 5: V1 Features (Week 6-10)

**Goal**: Feature-complete for launch

- [ ] Add payment gateway (Stripe)
- [ ] Automate monthly charge generation
- [ ] Build reports module
- [ ] Add multi-building support
- [ ] Polish mobile experience

**Acceptance Criteria**:
- Residents can pay online
- Charges auto-generated monthly
- Board can run delinquency report

---

## Questions for Consideration

1. **Email Provider**: Resend vs SendGrid vs AWS SES?
2. **Payment Gateway**: Stripe only or also PayPal?
3. **Target Markets**: Israel first? US? Both?
4. **Pricing Model**: Per apartment? Per building? Tiered?
5. **WhatsApp Priority**: Before or after V1?

---

> 📌 **Reminder**: This document is for planning only.
> Code changes should be tracked separately with proper PRs.

