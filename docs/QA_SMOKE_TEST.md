# QA Smoke Test Checklist

This document provides step-by-step smoke tests to verify core functionality after deployments or significant changes.

## Prerequisites

1. MongoDB is accessible (check `/api/health` returns `{"status":"ok","db":"connected"}`)
2. Dev server running: `npm run dev`
3. Seed data loaded: `npm run seed`
4. Demo accounts available:
   - **BOARD**: `board@demo.com` / `demo123`
   - **TREASURER**: `treasurer@demo.com` / `demo123`
   - **RESIDENT**: `resident@demo.com` / `demo123`

---

## BOARD Flow (Full Access)

### 1. Login
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.1 | Navigate to `/login` | Login page displays |
| 1.2 | Enter `board@demo.com` / `demo123` | Redirects to `/dashboard` |
| 1.3 | Verify header | Shows "Board Admin" and BOARD role badge |

### 2. Settings
| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.1 | Navigate to Settings (`/settings`) | Building settings form displays |
| 2.2 | Change monthly due amount to `500` | Field updates |
| 2.3 | Click Save | Success toast appears |
| 2.4 | Refresh page | Value persists as `500` |
| 2.5 | Revert to `450` and save | Restored to original |

### 3. Apartments CRUD
| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.1 | Navigate to Apartments (`/apartments`) | Apartment list displays (20 apartments from seed) |
| 3.2 | Click on apartment row | Apartment detail/edit dialog opens |
| 3.3 | View residents tab | Shows current resident(s) |
| 3.4 | Close dialog | Returns to list |

### 4. Residents Edit
| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.1 | Navigate to Residents (`/residents`) | Resident list displays |
| 4.2 | Click Edit on any resident | Edit dialog opens |
| 4.3 | Change phone number | Field updates |
| 4.4 | Click Save | Success toast, dialog closes |
| 4.5 | Verify in list | Phone number updated |

### 5. Move-Out / Move-In
| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.1 | Navigate to Residents | Resident list displays |
| 5.2 | Click Move Out on active resident | Move-out dialog opens |
| 5.3 | Enter move-out date and note | Fields populate |
| 5.4 | Confirm move-out | Resident marked as inactive, success toast |
| 5.5 | Navigate to Apartments | Find the apartment |
| 5.6 | Click Move In on empty apartment | Move-in dialog opens |
| 5.7 | Enter new resident details | Fields populate |
| 5.8 | Confirm move-in | New resident appears, success toast |

### 6. Generate Charges
| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.1 | Navigate to Billing (`/billing`) | Billing page displays |
| 6.2 | Click "Generate Monthly Charges" | Confirmation dialog appears |
| 6.3 | Select period (current month) | Period selected |
| 6.4 | Confirm generation | Charges created, success toast |
| 6.5 | Verify charges in list | New charges appear for apartments |

### 7. Record Payment
| Step | Action | Expected Result |
|------|--------|-----------------|
| 7.1 | In Billing, find apartment with open charges | Apartment row shows balance |
| 7.2 | Click "Record Payment" | Payment dialog opens |
| 7.3 | Enter amount, method, reference | Fields populate |
| 7.4 | Submit payment | Success toast, balance updated |

### 8. Invoice View + PDF
| Step | Action | Expected Result |
|------|--------|-----------------|
| 8.1 | In Billing, click on a charge | Invoice page opens (`/billing/invoice/[chargeId]`) |
| 8.2 | Verify invoice details | Shows charge info, amount, due date |
| 8.3 | Click "Download PDF" | PDF downloads with invoice details |
| 8.4 | Open PDF | Readable, contains correct data |

### 9. Tickets
| Step | Action | Expected Result |
|------|--------|-----------------|
| 9.1 | Navigate to Tickets (`/tickets`) | Ticket list displays |
| 9.2 | Click "New Ticket" | Create ticket dialog opens |
| 9.3 | Fill title, description, priority | Fields populate |
| 9.4 | Submit | Ticket created, appears in list |
| 9.5 | Click on ticket | Ticket detail page opens |
| 9.6 | Add a comment | Comment appears in timeline |
| 9.7 | Change status to "In Progress" | Status updates |

### 10. Documents
| Step | Action | Expected Result |
|------|--------|-----------------|
| 10.1 | Navigate to Documents (`/documents`) | Document list displays |
| 10.2 | Click "Upload Document" | Upload dialog opens |
| 10.3 | Select file, enter title, category | Fields populate |
| 10.4 | Submit | Document uploaded, appears in list |
| 10.5 | Click to view/download | Document opens/downloads |

### 11. Audit Log
| Step | Action | Expected Result |
|------|--------|-----------------|
| 11.1 | Navigate to Audit Log (`/audit-log`) | Audit log displays |
| 11.2 | Verify recent actions | Shows recent CRUD operations |
| 11.3 | Filter by action type | List filters correctly |
| 11.4 | Filter by date range | List filters correctly |

---

## RESIDENT Flow (Limited Access)

### 1. Login
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.1 | Navigate to `/login` | Login page displays |
| 1.2 | Enter `resident@demo.com` / `demo123` | Redirects to `/dashboard` |
| 1.3 | Verify header | Shows resident name and RESIDENT role badge |
| 1.4 | Verify sidebar | Limited menu (no Settings, Audit Log) |

### 2. View Statement
| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.1 | Navigate to Billing (`/billing`) | Shows only own apartment's charges |
| 2.2 | Verify balance displayed | Correct balance for apartment |
| 2.3 | View charge history | Only own apartment's charges visible |

### 3. Invoice View + PDF
| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.1 | Click on a charge | Invoice page opens |
| 3.2 | Verify invoice details | Shows own apartment's charge info |
| 3.3 | Click "Download PDF" | PDF downloads |
| 3.4 | Open PDF | Contains correct apartment data |

### 4. Create Ticket
| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.1 | Navigate to Tickets (`/tickets`) | Ticket list displays (own tickets only) |
| 4.2 | Click "New Ticket" | Create ticket dialog opens |
| 4.3 | Fill title, description | Fields populate |
| 4.4 | Submit | Ticket created with resident's apartment |
| 4.5 | Verify ticket in list | New ticket appears |
| 4.6 | Click to view | Can view own ticket details |

---

## Error Handling Tests

### 1. Invalid Login
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.1 | Enter wrong password | Error: "Invalid credentials" |
| 1.2 | Enter non-existent email | Error: "Invalid credentials" |

### 2. Database Down (if testable)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.1 | Disconnect DB, attempt login | Hebrew error: "בעיה זמנית בהתחברות למסד הנתונים. נסה שוב בעוד רגע." |
| 2.2 | Check `/api/health` | Returns `{"status":"error","db":"disconnected"}` |

### 3. Unauthorized Access
| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.1 | As RESIDENT, try `/settings` | Redirected or 403 error |
| 3.2 | As RESIDENT, try `/audit-log` | Redirected or 403 error |

---

## Build Verification

```bash
# Must pass without errors
npm run build

# Expected output: 
# ✓ Compiled successfully
# ✓ Linting and checking validity of types
# ✓ Collecting page data
# ✓ Generating static pages
```

---

## Quick Health Check

```bash
# Check API health
curl http://localhost:3000/api/health

# Expected: {"status":"ok","db":"connected","version":"0.1.0"}
```

---

## Sign-Off

| Test Suite | Pass/Fail | Tester | Date |
|------------|-----------|--------|------|
| BOARD Flow | | | |
| RESIDENT Flow | | | |
| Error Handling | | | |
| Build Verification | | | |

