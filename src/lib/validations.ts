import { z } from 'zod';

// Common validation helpers
const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

// Building Validation
export const buildingSchema = z.object({
  name: z.string().min(1, 'Building name is required').max(100),
  address: z.string().min(1, 'Address is required').max(200),
  city: z.string().min(1, 'City is required').max(100),
  country: z.string().min(1, 'Country is required').max(100),
  timezone: z.string().default('UTC'),
  bankInfo: z.object({
    bankName: z.string().optional(),
    accountNumber: z.string().optional(),
    routingNumber: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
  settings: z.object({
    currency: z.string().default('ILS'),
    dueDay: z.number().min(1).max(28).default(10),
    monthlyDueAmount: z.number().min(0).optional(),
  }).default({ currency: 'ILS', dueDay: 10 }),
});

export const buildingUpdateSchema = buildingSchema.partial();

// Building Settings Update Schema (for /api/building PATCH)
// This is what BOARD/MANAGEMENT can update - not creating a new building
export const buildingSettingsUpdateSchema = z.object({
  name: z.string().min(1, 'Building name is required').max(100).optional(),
  address: z.string().min(1, 'Address is required').max(200).optional(),
  city: z.string().min(1, 'City is required').max(100).optional(),
  country: z.string().min(1, 'Country is required').max(100).optional(),
  timezone: z.string().optional(),
  bankInfo: z.object({
    bankName: z.string().max(100).optional(),
    accountNumber: z.string().max(50).optional(),
    routingNumber: z.string().max(50).optional(),
    notes: z.string().max(500).optional(),
  }).optional(),
  settings: z.object({
    currency: z.string().max(10).optional(),
    dueDay: z.number().min(1).max(28).optional(),
    monthlyDueAmount: z.number().min(0).optional(),
  }).optional(),
});

export type BuildingSettingsUpdateInput = z.infer<typeof buildingSettingsUpdateSchema>;

// Apartment Validation
export const apartmentSchema = z.object({
  buildingId: objectIdSchema,
  number: z.string().min(1, 'Apartment number is required').max(20),
  floor: z.number().optional(),
  size: z.number().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const apartmentUpdateSchema = apartmentSchema.partial().omit({ buildingId: true });

// Resident Validation
export const residentSchema = z.object({
  buildingId: objectIdSchema,
  apartmentId: objectIdSchema,
  fullName: z.string().min(1, 'Full name is required').max(100),
  phone: z.string().max(20).optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  type: z.enum(['owner', 'tenant']).default('owner'),
  isActive: z.boolean().default(true),
  moveInAt: z.string().or(z.date()).transform((val) => new Date(val)).optional(),
});

export const residentUpdateSchema = residentSchema.partial().omit({ buildingId: true, moveInAt: true });

// Resident Move-Out Validation
export const residentMoveOutSchema = z.object({
  moveOutAt: z.string().or(z.date()).transform((val) => new Date(val)).optional(),
  note: z.string().max(500, 'Note is too long').optional(),
});

// Resident Move-In Validation (for POST /api/apartments/[id]/move-in)
export const residentMoveInSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(100),
  phone: z.string().max(20).optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  type: z.enum(['owner', 'tenant']).default('owner'),
  moveInAt: z.string().or(z.date()).transform((val) => new Date(val)).optional(),
});

// User Validation
export const userSchema = z.object({
  buildingId: objectIdSchema,
  residentId: objectIdSchema.optional(),
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['ADMIN', 'BOARD', 'TREASURER', 'RESIDENT', 'MANAGEMENT']).default('RESIDENT'),
});

export const userUpdateSchema = userSchema.partial().omit({ buildingId: true, password: true });

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

// Charge Validation
export const chargeSchema = z.object({
  buildingId: objectIdSchema,
  apartmentId: objectIdSchema,
  type: z.enum(['monthly_due', 'one_time', 'repair', 'fund']),
  title: z.string().min(1, 'Title is required').max(200),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().default('USD'),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM format').optional().nullable(),
  dueDate: z.string().or(z.date()).transform((val) => new Date(val)),
  status: z.enum(['open', 'voided']).default('open'),
});

export const chargeUpdateSchema = z.object({
  status: z.enum(['open', 'voided']),
});

export const generateChargesSchema = z.object({
  buildingId: objectIdSchema,
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM format'),
  amount: z.number().positive('Amount must be positive'),
  title: z.string().min(1, 'Title is required').max(200).default('Monthly Maintenance Fee'),
  dueDate: z.string().or(z.date()).transform((val) => new Date(val)).optional(),
});

// Payment Validation
export const paymentSchema = z.object({
  buildingId: objectIdSchema,
  apartmentId: objectIdSchema,
  residentId: objectIdSchema.optional(),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().default('USD'),
  method: z.enum(['bank_transfer', 'cash', 'credit_card', 'other']),
  reference: z.string().max(200).optional(),
  paidAt: z.string().or(z.date()).transform((val) => new Date(val)),
  status: z.enum(['confirmed', 'pending', 'voided']).default('confirmed'),
});

export const paymentUpdateSchema = z.object({
  status: z.enum(['confirmed', 'pending', 'voided']),
});

// Maintenance Ticket Validation
export const ticketSchema = z.object({
  buildingId: objectIdSchema,
  apartmentId: objectIdSchema.optional(),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(2000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  status: z.enum(['open', 'in_progress', 'waiting_vendor', 'resolved', 'closed']).default('open'),
  vendorId: objectIdSchema.optional(),
  attachments: z.array(z.object({
    url: z.string(),
    name: z.string(),
    type: z.string().optional(),
    size: z.number(),
  })).default([]),
});

export const ticketUpdateSchema = ticketSchema.partial().omit({ buildingId: true });

export const ticketCommentSchema = z.object({
  message: z.string().min(1, 'Message is required').max(1000),
});

// Vendor Validation
export const vendorSchema = z.object({
  buildingId: objectIdSchema,
  name: z.string().min(1, 'Name is required').max(100),
  phone: z.string().max(20).optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  category: z.enum(['cleaning', 'elevator', 'electric', 'plumbing', 'security', 'landscaping', 'other']),
  contractStart: z.string().or(z.date()).transform((val) => new Date(val)).optional(),
  contractEnd: z.string().or(z.date()).transform((val) => new Date(val)).optional(),
  notes: z.string().max(1000).optional(),
  documents: z.array(z.object({
    url: z.string(),
    name: z.string(),
  })).default([]),
});

export const vendorUpdateSchema = vendorSchema.partial().omit({ buildingId: true });

// Document Validation
export const documentSchema = z.object({
  buildingId: objectIdSchema,
  title: z.string().min(1, 'Title is required').max(200),
  category: z.enum(['insurance', 'protocol', 'receipt', 'contract', 'other']),
  visibility: z.enum(['public', 'residents_only', 'board_only']).default('board_only'),
  file: z.object({
    url: z.string(),
    name: z.string(),
    mimeType: z.string(),
    size: z.number(),
  }),
});

export const documentUpdateSchema = documentSchema.partial().omit({ buildingId: true, file: true });

// Pagination & Filter Schemas
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Type exports
export type BuildingInput = z.infer<typeof buildingSchema>;
export type ApartmentInput = z.infer<typeof apartmentSchema>;
export type ResidentInput = z.infer<typeof residentSchema>;
export type ResidentMoveOutInput = z.infer<typeof residentMoveOutSchema>;
export type ResidentMoveInInput = z.infer<typeof residentMoveInSchema>;
export type UserInput = z.infer<typeof userSchema>;
export type ChargeInput = z.infer<typeof chargeSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type TicketInput = z.infer<typeof ticketSchema>;
export type VendorInput = z.infer<typeof vendorSchema>;
export type DocumentInput = z.infer<typeof documentSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;

