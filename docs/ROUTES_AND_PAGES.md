# VAAD Routes and Pages

## UI Routes Overview

| Route | Description | Allowed Roles | Layout |
|-------|-------------|---------------|--------|
| `/login` | Authentication page | Public | None |
| `/` | Redirect to /dashboard | All authenticated | - |
| `/dashboard` | Role-based dashboard | All authenticated | Dashboard |
| `/apartments` | Apartment management | ADMIN, BOARD, TREASURER, MANAGEMENT | Dashboard |
| `/residents` | Resident management | ADMIN, BOARD, TREASURER, MANAGEMENT | Dashboard |
| `/billing` | Charges, payments, statements | All authenticated* | Dashboard |
| `/tickets` | Maintenance ticket list | All authenticated | Dashboard |
| `/tickets/[id]` | Ticket detail view | All authenticated** | Dashboard |
| `/vendors` | Vendor management | ADMIN, BOARD, MANAGEMENT | Dashboard |
| `/documents` | Document management | All authenticated*** | Dashboard |
| `/audit-log` | Audit log viewer | ADMIN, BOARD, MANAGEMENT | Dashboard |

*Residents see limited billing (own apartment only)
**Residents see only their own tickets
***Residents see only public + residents_only documents

## Detailed Page Descriptions

### `/login`

**File**: `src/app/login/page.tsx`

**Description**: Credential-based login form with demo account hints.

**Components Used**:
- `Card`, `CardHeader`, `CardContent` (shadcn)
- `Input`, `Label`, `Button` (shadcn)
- `Alert` for error messages

**Key Features**:
- Email/password form
- Loading state during authentication
- Error display
- Demo credentials reference

---

### `/dashboard`

**File**: `src/app/(dashboard)/dashboard/page.tsx`

**Description**: Role-based dashboard showing relevant metrics and quick actions.

**Components Used**:
- `Header` (layout)
- `Card`, `CardHeader`, `CardContent` (shadcn)
- `Badge` (shadcn)
- `Button` with Link

**Role-Based Views**:

| Role | Displays |
|------|----------|
| RESIDENT | Own apartment info, balance, recent tickets |
| BOARD/TREASURER/MANAGEMENT | Building totals, outstanding balance, open tickets, urgent count, payments this month, recent activity |

**API Dependency**: `GET /api/dashboard`

---

### `/apartments`

**File**: `src/app/(dashboard)/apartments/page.tsx`

**Description**: Apartment list with CRUD operations, CSV import, and resident management.

**Components Used**:
- `Header` (layout)
- `DataTable` (custom component)
- `Dialog` for create/edit/residents modals
- `Tabs` for active/history residents
- `Card` for resident display
- `Input`, `Label`, `Select`, `Button` (shadcn)

**Features**:
- Search by apartment number
- Pagination (server-side)
- Create apartment dialog
- Edit apartment dialog
- CSV import dialog with preview
- **Residents Panel** (view active residents + history)
- **Move-in** new resident to apartment
- **Move-out** resident from apartment

**API Dependencies**:
- `GET /api/apartments`
- `POST /api/apartments`
- `PATCH /api/apartments/[id]`
- `POST /api/import`
- `GET /api/apartments/[id]/residents`
- `POST /api/apartments/[id]/move-in`
- `POST /api/residents/[id]/move-out`

---

### `/residents`

**File**: `src/app/(dashboard)/residents/page.tsx`

**Description**: Resident list with CRUD operations and lifecycle management.

**Components Used**:
- `Header` (layout)
- `DataTable` (custom component)
- `Dialog` for create/edit/move-out modals
- `Input`, `Label`, `Select`, `Button` (shadcn)
- `Badge` for status display

**Features**:
- Search by name, email, phone
- **Filter by status** (Active / Moved Out / All)
- Pagination (server-side)
- Create resident dialog (with apartment selection)
- Edit resident dialog
- **Move-out action** with confirmation and note
- Display move-out date for inactive residents

**API Dependencies**:
- `GET /api/residents`
- `POST /api/residents`
- `PATCH /api/residents/[id]`
- `POST /api/residents/[id]/move-out`
- `GET /api/apartments` (for dropdown)

---

### `/billing`

**File**: `src/app/(dashboard)/billing/page.tsx`

**Description**: Tabbed interface for billing management.

**Components Used**:
- `Header` (layout)
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` (shadcn)
- `DataTable` (custom component)
- `Dialog` for create modals
- `Card` for generate charges form

**Tabs**:

| Tab | Description | Available To |
|-----|-------------|--------------|
| Charges | List/create charges | All (residents see own) |
| Payments | List/record payments | All (residents see own) |
| Generate Charges | Monthly charge batch generation | BOARD, TREASURER, MANAGEMENT |
| My Statement | Apartment statement | RESIDENT only |

**API Dependencies**:
- `GET /api/charges`
- `POST /api/charges`
- `PATCH /api/charges/[id]` (void)
- `POST /api/charges/generate`
- `GET /api/payments`
- `POST /api/payments`
- `GET /api/statements/[apartmentId]`

---

### `/tickets`

**File**: `src/app/(dashboard)/tickets/page.tsx`

**Description**: Maintenance ticket list with filtering.

**Components Used**:
- `Header` (layout)
- `DataTable` (custom component)
- `Dialog` for create modal
- `Select` for status filter
- `Badge` for priority/status display

**Features**:
- Search by title/description
- Filter by status
- Create ticket dialog
- Link to detail view

**API Dependencies**:
- `GET /api/tickets`
- `POST /api/tickets`

---

### `/tickets/[id]`

**File**: `src/app/(dashboard)/tickets/[id]/page.tsx`

**Description**: Ticket detail view with timeline and management.

**Components Used**:
- `Header` (layout)
- `Card` for sections
- `Badge` for priority/status
- `Textarea` for comments
- `Select` for status/vendor assignment

**Features**:
- Full ticket description
- Activity timeline
- Add comments
- Change status (Board+)
- Assign vendor (Board+)

**API Dependencies**:
- `GET /api/tickets/[id]`
- `PATCH /api/tickets/[id]`
- `POST /api/tickets/[id]/comments`
- `GET /api/vendors` (for dropdown)

---

### `/vendors`

**File**: `src/app/(dashboard)/vendors/page.tsx`

**Description**: Vendor directory management.

**Components Used**:
- `Header` (layout)
- `DataTable` (custom component)
- `Dialog` for create/edit modals
- `Badge` for category display

**Features**:
- Search by name
- Create/edit/delete vendors
- Category display

**API Dependencies**:
- `GET /api/vendors`
- `POST /api/vendors`
- `PATCH /api/vendors/[id]`
- `DELETE /api/vendors/[id]`

---

### `/documents`

**File**: `src/app/(dashboard)/documents/page.tsx`

**Description**: Document library with upload capability.

**Components Used**:
- `Header` (layout)
- `DataTable` (custom component)
- `Dialog` for upload modal
- `Badge` for category/visibility

**Features**:
- Search by title
- Upload with visibility selection
- Download links
- Delete (Board+)

**API Dependencies**:
- `GET /api/documents`
- `POST /api/documents`
- `DELETE /api/documents/[id]`
- `POST /api/upload`

---

### `/audit-log`

**File**: `src/app/(dashboard)/audit-log/page.tsx`

**Description**: Audit log viewer for tracking system changes.

**Components Used**:
- `Header` (layout)
- `DataTable` (custom component)
- `Select` for action/entity filters
- `Badge` for action/entity types

**Features**:
- Filter by action type
- Filter by entity type
- Pagination
- Actor and timestamp display

**API Dependencies**:
- `GET /api/audit-logs`

---

## Shared Layout: Dashboard

**File**: `src/app/(dashboard)/layout.tsx`

**Description**: Wraps all authenticated pages with sidebar navigation.

**Components**:
- `Sidebar` (`src/components/layout/sidebar.tsx`)
- Session check with redirect to /login

**Behavior**: Server component that checks session before rendering children.

---

## Shared Components

### DataTable

**File**: `src/components/data-table.tsx`

**Features**:
- Column definitions via TanStack Table
- Server-side pagination support
- Search input (optional)
- Loading skeletons
- Empty state

### Sidebar

**File**: `src/components/layout/sidebar.tsx`

**Features**:
- Navigation links with active state
- Role-based menu filtering
- User dropdown with sign out
- Mobile responsive (Sheet component)

### Header

**File**: `src/components/layout/header.tsx`

**Features**:
- Page title display
- Mobile menu trigger

