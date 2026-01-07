# Changelog

## [Unreleased]

### Added
- Added Notifications tab (`/notifications`) for payment reminders (preview + selection).
- Added WhatsApp click-to-chat sending (single + bulk) from Notifications.
- Added audit action `notification_open_whatsapp` and logging endpoint `/api/notifications/log`.
- Extended billing monthly API to optionally include resident details (`includeResidents=true`).
- Added checkbox UI component for selection.
- Added Hebrew translations for notifications UI.
- Added WhatsApp reminder copy button to Billing Monthly Overview and Invoice pages.
- Added ticket closure workflow with documentation (`POST /api/tickets/[id]/close`).
- Added new ticket fields: `closedAt`, `closedByUserId`, `resolutionNotes`, `invoiceDocumentId`, `costAmount`, `costCurrency`.
- Added audit action `ticket_closed` for tracking ticket closures.
- Added close ticket dialog with resolution summary, vendor selection, cost tracking, and invoice attachment.
- Added Hebrew translations for ticket closure UI.

### Fixed
- WhatsApp message formatting with proper line breaks.
- Invoice page WhatsApp button now only shows for unpaid/partial invoices.
- Fixed Radix Select crash when empty value string was used (vendor select in ticket details).

---

### Planned: i18n + Hebrew Invoices + PDF Export

This section outlines the staged implementation plan for internationalization, Hebrew invoice support, and PDF export functionality.

#### Stage 1: i18n Infrastructure
- [ ] Set up next-intl or similar i18n library for full app localization
- [ ] Extract all hardcoded Hebrew strings to translation files
- [ ] Add language switcher component
- [ ] Configure RTL layout support for Hebrew

#### Stage 2: Invoice Localization
- [ ] Create bilingual invoice templates (Hebrew/English)
- [ ] Add localized date, currency, and number formatting
- [ ] Implement Hebrew-specific invoice fields and labels
- [ ] Support RTL text rendering in invoice views

#### Stage 3: PDF Generation
- [ ] Integrate PDF generation library (e.g., react-pdf, puppeteer)
- [ ] Create PDF invoice template with Hebrew font support
- [ ] Add download/print invoice functionality
- [ ] Implement batch PDF generation for multiple invoices

#### Stage 4: Polish & Testing
- [ ] End-to-end testing for invoice generation flow
- [ ] Performance optimization for PDF generation
- [ ] Accessibility review for RTL support
- [ ] Documentation updates

