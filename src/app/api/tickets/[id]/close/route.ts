import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import MaintenanceTicket from '@/models/MaintenanceTicket';
import Apartment from '@/models/Apartment';
import Document from '@/models/Document';
import Vendor from '@/models/Vendor';
import { Types } from 'mongoose';
import { z } from 'zod';
import { evaluateSlaFlags } from '@/lib/tickets/sla-service';

// Ensure models are registered for populate
void Apartment;
void Document;
void Vendor;

const closeTicketSchema = z.object({
  resolutionNotes: z.string().min(1, 'Resolution notes are required').max(2000),
  vendorId: z.string().optional(),
  invoiceDocumentId: z.string().optional(),
  invoiceNumber: z.string().trim().min(1).max(120).optional(),
  invoiceDate: z.string().or(z.date())
    .transform((val) => new Date(val))
    .refine((value) => !Number.isNaN(value.getTime()), 'Invalid invoice date')
    .optional(),
  costAmount: z.number().min(0).optional(),
  costCurrency: z.enum(['ILS', 'USD', 'EUR']).default('ILS'),
  invoiceSource: z.enum(['ticket_close', 'manual_upload']).default('ticket_close'),
  notify: z.object({
    channel: z.enum(['whatsapp']),
    target: z.enum(['resident', 'building']),
    mode: z.enum(['open_whatsapp', 'copy_only']),
  }).optional(),
});

const allowedInvoiceMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

// POST /api/tickets/[id]/close - Close a ticket with documentation
export const POST = withAuth(async (request, { user, params }) => {
  // RBAC: Only BOARD, MANAGEMENT, ADMIN can close tickets
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid ticket ID');
  }

  const body = await request.json();
  const validation = closeTicketSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message, 400);
  }

  const ticket = await MaintenanceTicket.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  }).populate('apartmentId', 'number');

  if (!ticket) {
    return errorResponse('Ticket not found', 404);
  }

  // Get apartment number from populated field
  const apartmentNumber = ticket.apartmentId 
    ? (ticket.apartmentId as unknown as { number: string }).number 
    : null;

  // Check if already closed
  if (ticket.status === 'closed') {
    return errorResponse('Ticket is already closed', 409);
  }

  // Validate vendorId if provided
  if (validation.data.vendorId && Types.ObjectId.isValid(validation.data.vendorId)) {
    const vendor = await Vendor.findOne({
      _id: new Types.ObjectId(validation.data.vendorId),
      buildingId: new Types.ObjectId(user.buildingId),
    }).lean();
    if (!vendor) {
      return errorResponse('Vendor not found in current building', 404);
    }
    ticket.vendorId = new Types.ObjectId(validation.data.vendorId);
  } else if (validation.data.vendorId) {
    return errorResponse('Invalid vendor ID', 400);
  }

  // Validate invoiceDocumentId if provided
  let invoiceDocumentExists = false;
  let documentForInvoiceUpdate: {
    _id: Types.ObjectId;
    file: { url: string; name: string; mimeType?: string; size: number };
    metadata?: Record<string, unknown>;
  } | null = null;
  if (validation.data.invoiceDocumentId) {
    if (!Types.ObjectId.isValid(validation.data.invoiceDocumentId)) {
      return errorResponse('Invalid invoice document ID', 400);
    }
    // Verify document belongs to same building
    const doc = await Document.findOne({
      _id: new Types.ObjectId(validation.data.invoiceDocumentId),
      buildingId: new Types.ObjectId(user.buildingId),
    });
    if (!doc) {
      return errorResponse('Invoice document not found', 404);
    }
    if (!allowedInvoiceMimeTypes.has(doc.file.mimeType || '')) {
      return errorResponse('Invalid invoice file type. Allowed: PDF/JPG/PNG/WEBP/HEIC', 400);
    }
    invoiceDocumentExists = Boolean(ticket.invoiceDocumentId);
    documentForInvoiceUpdate = {
      _id: doc._id,
      file: {
        url: doc.file.url,
        name: doc.file.name,
        mimeType: doc.file.mimeType,
        size: doc.file.size,
      },
      metadata: (doc.metadata as Record<string, unknown> | undefined) || undefined,
    };
    ticket.invoiceDocumentId = new Types.ObjectId(validation.data.invoiceDocumentId);
  }

  const before = ticket.toObject();

  // Update ticket fields
  ticket.status = 'closed';
  ticket.closedAt = new Date();
  ticket.closedByUserId = new Types.ObjectId(user.id);
  ticket.resolutionNotes = validation.data.resolutionNotes;
  
  if (validation.data.costAmount !== undefined) {
    ticket.costAmount = validation.data.costAmount;
    ticket.costCurrency = validation.data.costCurrency || 'ILS';
  }
  if (validation.data.invoiceNumber !== undefined) {
    ticket.invoiceNumber = validation.data.invoiceNumber;
  }
  if (validation.data.invoiceDate !== undefined) {
    ticket.invoiceDate = validation.data.invoiceDate;
  }

  // Also set resolvedAt if not already set
  if (!ticket.resolvedAt) {
    ticket.resolvedAt = new Date();
  }

  const slaFlags = evaluateSlaFlags({
    now: new Date(),
    responseDueAt: ticket.responseDueAt,
    resolutionDueAt: ticket.resolutionDueAt,
    firstAssignedAt: ticket.firstAssignedAt,
    resolvedAt: ticket.resolvedAt,
  });
  if (typeof slaFlags.responseMet !== 'undefined') ticket.responseMet = slaFlags.responseMet;
  if (typeof slaFlags.resolutionMet !== 'undefined') ticket.resolutionMet = slaFlags.resolutionMet;
  ticket.slaBreached = slaFlags.slaBreached;
  ticket.slaBreachReason = slaFlags.slaBreachReason;

  // Add timeline entry
  ticket.timeline.push({
    byUserId: new Types.ObjectId(user.id),
    byUserName: user.name,
    message: `Ticket closed. Resolution: ${validation.data.resolutionNotes.substring(0, 100)}${validation.data.resolutionNotes.length > 100 ? '...' : ''}`,
    createdAt: new Date(),
  });

  await ticket.save();

  if (documentForInvoiceUpdate) {
    await Document.updateOne(
      {
        _id: documentForInvoiceUpdate._id,
        buildingId: new Types.ObjectId(user.buildingId),
      },
      {
        $set: {
          metadata: {
            ...documentForInvoiceUpdate.metadata,
            ticketId: ticket._id.toString(),
            vendorId: ticket.vendorId?.toString(),
            invoiceNumber: ticket.invoiceNumber,
            invoiceDate: ticket.invoiceDate,
            amount: ticket.costAmount,
            currency: ticket.costCurrency,
            source: validation.data.invoiceSource,
          },
        },
      }
    );
  }

  // Audit log
  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'ticket_closed',
    entityType: 'ticket',
    entityId: ticket._id.toString(),
    before,
    after: ticket.toObject(),
    metadata: {
      ticketId: ticket._id.toString(),
      ticketTitle: ticket.title,
      apartmentNumber,
      vendorId: validation.data.vendorId,
      costAmount: validation.data.costAmount,
      costCurrency: validation.data.costCurrency,
      invoiceDocumentId: validation.data.invoiceDocumentId,
      invoiceNumber: validation.data.invoiceNumber,
      invoiceDate: validation.data.invoiceDate,
      notifyTarget: validation.data.notify?.target,
    },
  });

  if (validation.data.invoiceDocumentId) {
    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'ticket_invoice_uploaded',
      entityType: 'ticket',
      entityId: ticket._id.toString(),
      metadata: {
        ticketId: ticket._id.toString(),
        vendorId: ticket.vendorId?.toString(),
        documentId: validation.data.invoiceDocumentId,
        invoiceNumber: ticket.invoiceNumber,
        amount: ticket.costAmount,
        currency: ticket.costCurrency,
        source: validation.data.invoiceSource,
      },
    });

    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: invoiceDocumentExists ? 'ticket_invoice_replaced' : 'ticket_invoice_attached',
      entityType: 'ticket',
      entityId: ticket._id.toString(),
      metadata: {
        ticketId: ticket._id.toString(),
        vendorId: ticket.vendorId?.toString(),
        documentId: validation.data.invoiceDocumentId,
        invoiceNumber: ticket.invoiceNumber,
        amount: ticket.costAmount,
        currency: ticket.costCurrency,
      },
    });
  }

  if (ticket.slaBreached) {
    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'ticket_sla_breached',
      entityType: 'ticket',
      entityId: ticket._id.toString(),
      metadata: {
        reason: ticket.slaBreachReason,
        responseMet: ticket.responseMet,
        resolutionMet: ticket.resolutionMet,
      },
    });
  }

  // Re-populate for response
  await ticket.populate('apartmentId', 'number floor');
  await ticket.populate('createdBy', 'name email');
  await ticket.populate('vendorId', 'name category phone email');
  await ticket.populate('closedByUserId', 'name');
  await ticket.populate('invoiceDocumentId', 'title visibility file metadata createdAt');
  await ticket.populate('timeline.byUserId', 'name');

  return successResponse(ticket);
});

