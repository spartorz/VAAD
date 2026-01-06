# Changelog

## [Unreleased]

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

