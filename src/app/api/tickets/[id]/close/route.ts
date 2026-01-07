import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import MaintenanceTicket from '@/models/MaintenanceTicket';
import Apartment from '@/models/Apartment';
import Document from '@/models/Document';
import { Types } from 'mongoose';
import { z } from 'zod';

// Ensure models are registered for populate
void Apartment;
void Document;

const closeTicketSchema = z.object({
  resolutionNotes: z.string().min(1, 'Resolution notes are required').max(2000),
  vendorId: z.string().optional(),
  invoiceDocumentId: z.string().optional(),
  costAmount: z.number().min(0).optional(),
  costCurrency: z.string().default('ILS'),
  notify: z.object({
    channel: z.enum(['whatsapp']),
    target: z.enum(['resident', 'building']),
    mode: z.enum(['open_whatsapp', 'copy_only']),
  }).optional(),
});

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
    ticket.vendorId = new Types.ObjectId(validation.data.vendorId);
  }

  // Validate invoiceDocumentId if provided
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

  // Also set resolvedAt if not already set
  if (!ticket.resolvedAt) {
    ticket.resolvedAt = new Date();
  }

  // Add timeline entry
  ticket.timeline.push({
    byUserId: new Types.ObjectId(user.id),
    byUserName: user.name,
    message: `Ticket closed. Resolution: ${validation.data.resolutionNotes.substring(0, 100)}${validation.data.resolutionNotes.length > 100 ? '...' : ''}`,
    createdAt: new Date(),
  });

  await ticket.save();

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
      notifyTarget: validation.data.notify?.target,
    },
  });

  // Re-populate for response
  await ticket.populate('apartmentId', 'number floor');
  await ticket.populate('createdBy', 'name email');
  await ticket.populate('vendorId', 'name category phone email');
  await ticket.populate('closedByUserId', 'name');
  await ticket.populate('invoiceDocumentId', 'title url');
  await ticket.populate('timeline.byUserId', 'name');

  return successResponse(ticket);
});

