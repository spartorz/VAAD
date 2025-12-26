# VAAD API Reference

All API endpoints are located under `src/app/api/`.

## Authentication

All endpoints (except `/api/auth/*`) require authentication via NextAuth session.

**Common Error Responses**:

| Code | Meaning |
|------|---------|
| 401 | Unauthorized - No valid session |
| 403 | Forbidden - Insufficient role permissions |
| 400 | Bad Request - Validation error |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Duplicate resource |
| 500 | Server Error - Unexpected error |

**Response Format**:
```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": "Error message" }

// Paginated
{
  "success": true,
  "data": {
    "data": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

---

## Auth Endpoints

### POST /api/auth/[...nextauth]

**Description**: NextAuth.js handler (login, logout, session, CSRF)

**No custom implementation** - handled by NextAuth.

---

## Apartments

### GET /api/apartments

**Description**: List apartments with pagination and search.

**Auth**: Required (All roles)

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Items per page (max 100) |
| search | string | - | Search by apartment number |
| sortBy | string | createdAt | Sort field |
| sortOrder | asc/desc | desc | Sort direction |

**Response**:
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "_id": "...",
        "buildingId": "...",
        "number": "101",
        "floor": 1,
        "size": 850,
        "status": "active",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 50, "totalPages": 3 }
  }
}
```

**Notes**: Residents only see their own apartment.

---

### POST /api/apartments

**Description**: Create new apartment.

**Auth**: Required (BOARD, MANAGEMENT, ADMIN)

**Zod Schema**: `apartmentSchema`

**Request Body**:
```json
{
  "number": "102",
  "floor": 1,
  "size": 900,
  "status": "active"
}
```

**Response**: `201` with created apartment.

**Errors**:
- `409` - Apartment number already exists

---

### GET /api/apartments/[id]

**Description**: Get single apartment.

**Auth**: Required (Residents: own apartment only)

**Response**: Single apartment object.

---

### PATCH /api/apartments/[id]

**Description**: Update apartment.

**Auth**: Required (BOARD, MANAGEMENT, ADMIN)

**Zod Schema**: `apartmentUpdateSchema`

**Request Body** (partial):
```json
{
  "number": "102A",
  "status": "inactive"
}
```

---

### DELETE /api/apartments/[id]

**Description**: Soft-delete apartment (sets status to inactive).

**Auth**: Required (BOARD, MANAGEMENT, ADMIN)

---

## Residents

### GET /api/residents

**Description**: List residents with pagination.

**Auth**: Required (Residents: own apartment's residents only)

**Query Parameters**: Same as apartments, plus:
| Param | Type | Description |
|-------|------|-------------|
| apartmentId | ObjectId | Filter by apartment |
| isActive | boolean | Filter by active status |

---

### POST /api/residents

**Description**: Create new resident.

**Auth**: Required (BOARD, MANAGEMENT, ADMIN)

**Zod Schema**: `residentSchema`

**Request Body**:
```json
{
  "apartmentId": "...",
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "type": "owner",
  "isActive": true
}
```

---

### GET /api/residents/[id]

**Description**: Get single resident.

**Auth**: Required (Residents: own apartment only)

---

### PATCH /api/residents/[id]

**Description**: Update resident.

**Auth**: Required (BOARD, MANAGEMENT, ADMIN)

**Zod Schema**: `residentUpdateSchema`

---

### DELETE /api/residents/[id]

**Description**: Deactivate resident (sets isActive to false, moveOutAt to now).

**Auth**: Required (BOARD, MANAGEMENT, ADMIN)

---

### POST /api/residents/[id]/move-out

**Description**: Move out a resident (sets moveOutAt, isActive=false, disables linked user).

**Auth**: Required (BOARD, MANAGEMENT)

**Zod Schema**: `residentMoveOutSchema`

**Request Body**:
```json
{
  "moveOutAt": "2024-03-15T00:00:00.000Z",
  "note": "Relocated to another city"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Resident moved out successfully",
    "resident": { ... },
    "userDisabled": true
  }
}
```

**Notes**:
- `moveOutAt` defaults to now if not provided
- If resident has a linked user account, that user is disabled (cannot login)
- Creates audit log entry

---

### POST /api/apartments/[id]/move-in

**Description**: Move in a new resident to an apartment.

**Auth**: Required (BOARD, MANAGEMENT)

**Zod Schema**: `residentMoveInSchema`

**Request Body**:
```json
{
  "fullName": "John Doe",
  "phone": "+1 234 567 890",
  "email": "john@example.com",
  "type": "owner",
  "moveInAt": "2024-03-15T00:00:00.000Z"
}
```

**Response**: `201` with created resident.

**Notes**:
- `moveInAt` defaults to now if not provided
- Creates a new resident record (does not move existing resident)
- Creates audit log entry

---

### GET /api/apartments/[id]/residents

**Description**: Get all residents for an apartment (active and history).

**Auth**: Required (Residents: own apartment only)

**Response**:
```json
{
  "success": true,
  "data": {
    "apartment": { "_id": "...", "number": "101", "floor": 1, "status": "active" },
    "activeResidents": [
      {
        "_id": "...",
        "fullName": "John Doe",
        "email": "john@example.com",
        "type": "owner",
        "isActive": true,
        "moveInAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "residentHistory": [
      {
        "_id": "...",
        "fullName": "Jane Smith",
        "type": "tenant",
        "isActive": false,
        "moveInAt": "2022-06-01T00:00:00.000Z",
        "moveOutAt": "2023-12-31T00:00:00.000Z",
        "moveOutNote": "Lease ended"
      }
    ],
    "totalActive": 1,
    "totalHistory": 1
  }
}
```

---

## Charges

### GET /api/charges

**Description**: List charges with pagination.

**Auth**: Required (Residents: own apartment only)

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| apartmentId | ObjectId | Filter by apartment |
| status | open/voided | Filter by status |
| period | YYYY-MM | Filter by period |
| type | string | Filter by charge type |

---

### POST /api/charges

**Description**: Create new charge.

**Auth**: Required (BOARD, TREASURER, MANAGEMENT, ADMIN)

**Zod Schema**: `chargeSchema`

**Request Body**:
```json
{
  "apartmentId": "...",
  "type": "monthly_due",
  "title": "January Maintenance",
  "amount": 250,
  "dueDate": "2024-01-15",
  "period": "2024-01"
}
```

**Errors**:
- `409` - Monthly charge already exists for this apartment/period

---

### GET /api/charges/[id]

**Description**: Get single charge.

**Auth**: Required (Residents: own apartment only)

---

### PATCH /api/charges/[id]

**Description**: Void a charge (ONLY status change allowed).

**Auth**: Required (BOARD, TREASURER, MANAGEMENT, ADMIN)

**Zod Schema**: `chargeUpdateSchema`

**Request Body**:
```json
{
  "status": "voided"
}
```

**⚠️ LEDGER RULE**: No other fields can be modified. Audit log created.

---

### POST /api/charges/generate

**Description**: Generate monthly charges for all active apartments.

**Auth**: Required (TREASURER+)

**Zod Schema**: `generateChargesSchema`

**Request Body**:
```json
{
  "period": "2024-02",
  "amount": 250,
  "title": "February Maintenance",
  "dueDate": "2024-02-01"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Created 45 charges for period 2024-02",
    "created": 45,
    "skipped": 5,
    "charges": ["id1", "id2", ...]
  }
}
```

**⚠️ IDEMPOTENT**: Apartments with existing open charges for the period are skipped.

---

## Payments

### GET /api/payments

**Description**: List payments with pagination.

**Auth**: Required (Residents: own apartment only)

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| apartmentId | ObjectId | Filter by apartment |
| status | string | Filter by status |
| method | string | Filter by payment method |
| startDate | ISO date | Filter from date |
| endDate | ISO date | Filter to date |

---

### POST /api/payments

**Description**: Record new payment.

**Auth**: Required (BOARD, TREASURER, MANAGEMENT, ADMIN)

**Zod Schema**: `paymentSchema`

**Request Body**:
```json
{
  "apartmentId": "...",
  "amount": 250,
  "method": "bank_transfer",
  "reference": "TXN123456",
  "paidAt": "2024-01-10"
}
```

---

### GET /api/payments/[id]

**Description**: Get single payment.

**Auth**: Required (Residents: own apartment only)

---

### PATCH /api/payments/[id]

**Description**: Void a payment (ONLY status change allowed).

**Auth**: Required (BOARD, TREASURER, MANAGEMENT, ADMIN)

**Zod Schema**: `paymentUpdateSchema`

**Request Body**:
```json
{
  "status": "voided"
}
```

**⚠️ LEDGER RULE**: No other fields can be modified. Audit log created.

---

## Statements

### GET /api/statements/[apartmentId]

**Description**: Get apartment statement with balance and transaction history.

**Auth**: Required (Residents: own apartment only)

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| startDate | ISO date | Filter from date |
| endDate | ISO date | Filter to date |

**Response**:
```json
{
  "success": true,
  "data": {
    "apartment": { "_id": "...", "number": "101", "floor": 1 },
    "balance": {
      "totalCharges": 1000,
      "totalPayments": 750,
      "balance": 250,
      "currency": "USD"
    },
    "statement": [
      {
        "_id": "...",
        "date": "2024-01-01T00:00:00.000Z",
        "type": "charge",
        "title": "January Maintenance",
        "amount": 250,
        "balance": 250,
        "status": "open"
      },
      {
        "_id": "...",
        "date": "2024-01-10T00:00:00.000Z",
        "type": "payment",
        "title": "Payment - bank_transfer",
        "amount": -250,
        "balance": 0,
        "status": "confirmed"
      }
    ]
  }
}
```

---

## Tickets

### GET /api/tickets

**Description**: List maintenance tickets.

**Auth**: Required (Residents: own apartment or self-created only)

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| apartmentId | ObjectId | Filter by apartment |
| status | string | Filter by status |
| priority | string | Filter by priority |
| search | string | Search title/description |

---

### POST /api/tickets

**Description**: Create new ticket.

**Auth**: Required (All roles)

**Zod Schema**: `ticketSchema`

**Request Body**:
```json
{
  "title": "Leaky faucet",
  "description": "Bathroom faucet dripping constantly",
  "priority": "medium",
  "apartmentId": "..."
}
```

**Note**: Residents can only create tickets for their own apartment.

---

### GET /api/tickets/[id]

**Description**: Get single ticket with timeline.

**Auth**: Required (Residents: own tickets only)

---

### PATCH /api/tickets/[id]

**Description**: Update ticket.

**Auth**: Required
- Residents: Can only update title/description of own tickets
- Board+: Can update all fields including status/vendor

**Zod Schema**: `ticketUpdateSchema`

---

### POST /api/tickets/[id]/comments

**Description**: Add comment to ticket timeline.

**Auth**: Required (Residents: own tickets only)

**Zod Schema**: `ticketCommentSchema`

**Request Body**:
```json
{
  "message": "I've scheduled a plumber for tomorrow"
}
```

---

## Vendors

### GET /api/vendors

**Description**: List vendors.

**Auth**: Required (All roles)

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| category | string | Filter by category |
| search | string | Search by name |

---

### POST /api/vendors

**Description**: Create new vendor.

**Auth**: Required (BOARD, MANAGEMENT, ADMIN)

**Zod Schema**: `vendorSchema`

---

### GET /api/vendors/[id]

**Description**: Get single vendor.

**Auth**: Required (All roles)

---

### PATCH /api/vendors/[id]

**Description**: Update vendor.

**Auth**: Required (BOARD, MANAGEMENT, ADMIN)

---

### DELETE /api/vendors/[id]

**Description**: Delete vendor.

**Auth**: Required (BOARD, MANAGEMENT, ADMIN)

---

## Documents

### GET /api/documents

**Description**: List documents.

**Auth**: Required
- Residents: See public + residents_only
- Board+: See all

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| category | string | Filter by category |
| search | string | Search by title |

---

### POST /api/documents

**Description**: Create document record.

**Auth**: Required (BOARD, MANAGEMENT, ADMIN)

**Zod Schema**: `documentSchema`

**Request Body**:
```json
{
  "title": "Building Insurance 2024",
  "category": "insurance",
  "visibility": "board_only",
  "file": {
    "url": "/uploads/.../file.pdf",
    "name": "insurance.pdf",
    "mimeType": "application/pdf",
    "size": 1024000
  }
}
```

---

### DELETE /api/documents/[id]

**Description**: Delete document.

**Auth**: Required (BOARD, MANAGEMENT, ADMIN)

---

## Upload

### POST /api/upload

**Description**: Upload file to server.

**Auth**: Required (All roles)

**Content-Type**: `multipart/form-data`

**Form Data**:
| Field | Type | Description |
|-------|------|-------------|
| file | File | The file to upload |

**Response**:
```json
{
  "success": true,
  "data": {
    "url": "/uploads/buildingId/1234567890-filename.pdf",
    "name": "filename.pdf",
    "mimeType": "application/pdf",
    "size": 102400
  }
}
```

**Limits**: Max 10MB (configurable via `MAX_FILE_SIZE` env)

---

## Import

### POST /api/import

**Description**: Import apartments and residents from CSV data.

**Auth**: Required (BOARD+)

**Request Body**:
```json
{
  "mode": "preview",
  "data": [
    {
      "apartmentNumber": "101",
      "floor": "1",
      "residentName": "John Doe",
      "residentEmail": "john@example.com"
    }
  ]
}
```

**Modes**:
- `preview` - Validate and return counts without creating
- `import` - Actually create records

**Response**:
```json
{
  "success": true,
  "data": {
    "valid": [{ "row": 2, "apartment": "101", "resident": "John Doe" }],
    "errors": [{ "row": 3, "error": "Invalid email" }],
    "created": { "apartments": 10, "residents": 10 },
    "skipped": { "apartments": 2, "residents": 0 }
  }
}
```

---

## Dashboard

### GET /api/dashboard

**Description**: Get role-based dashboard data.

**Auth**: Required (All roles)

**Response** (RESIDENT):
```json
{
  "success": true,
  "data": {
    "type": "resident",
    "apartment": { "_id": "...", "number": "101", "floor": 1 },
    "balance": {
      "totalCharges": 500,
      "totalPayments": 250,
      "balance": 250,
      "currency": "USD"
    },
    "recentTickets": [...]
  }
}
```

**Response** (BOARD/TREASURER/MANAGEMENT):
```json
{
  "success": true,
  "data": {
    "type": "management",
    "overview": {
      "totalApartments": 50,
      "outstandingBalance": 12500,
      "totalOpenCharges": 25000,
      "totalConfirmedPayments": 12500
    },
    "tickets": { "open": 5, "urgent": 1, "byStatus": {...} },
    "paymentsThisMonth": { "total": 5000, "count": 20 },
    "recentActivity": [...]
  }
}
```

---

## Audit Logs

### GET /api/audit-logs

**Description**: Query audit logs.

**Auth**: Required (BOARD, MANAGEMENT, ADMIN)

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| entityType | string | Filter by entity type |
| action | string | Filter by action |
| actorUserId | ObjectId | Filter by actor |
| startDate | ISO date | Filter from date |
| endDate | ISO date | Filter to date |

**Response**:
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "_id": "...",
        "action": "void",
        "entityType": "charge",
        "actorUserId": { "_id": "...", "name": "Board Admin" },
        "before": { "status": "open" },
        "after": { "status": "voided" },
        "createdAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {...}
  }
}
```

