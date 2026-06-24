import { Types } from 'mongoose';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import { ticketAssignVendorSchema } from '@/lib/validations';
import MaintenanceTicket from '@/models/MaintenanceTicket';
import Vendor from '@/models/Vendor';
import { evaluateSlaFlags } from '@/lib/tickets/sla-service';

// POST /api/tickets/[id]/assign-vendor
export const POST = withAuth(async (request, { user, params }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const id = params?.id;
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid ticket ID', 400);
  }

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON body', 400);

  const parsed = ticketAssignVendorSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.errors[0]?.message || 'Validation failed', 400);
  }

  const ticket = await MaintenanceTicket.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });
  if (!ticket) return errorResponse('Ticket not found', 404);

  const vendor = await Vendor.findOne({
    _id: new Types.ObjectId(parsed.data.vendorId),
    buildingId: new Types.ObjectId(user.buildingId),
  }).lean();
  if (!vendor) return errorResponse('Vendor not found', 404);
  if (vendor.isActive === false) return errorResponse('Vendor is inactive', 409);

  const before = ticket.toObject();
  const now = new Date();

  ticket.vendorId = new Types.ObjectId(parsed.data.vendorId);
  if (!ticket.firstAssignedAt) {
    ticket.firstAssignedAt = now;
  }

  // Keep status semantics intact; only set waiting_vendor from open when requested.
  if (parsed.data.setWaitingVendorStatus && ticket.status === 'open') {
    ticket.status = 'waiting_vendor';
  }

  const slaFlags = evaluateSlaFlags({
    now,
    responseDueAt: ticket.responseDueAt,
    resolutionDueAt: ticket.resolutionDueAt,
    firstAssignedAt: ticket.firstAssignedAt,
    resolvedAt: ticket.resolvedAt,
  });
  if (typeof slaFlags.responseMet !== 'undefined') ticket.responseMet = slaFlags.responseMet;
  if (typeof slaFlags.resolutionMet !== 'undefined') ticket.resolutionMet = slaFlags.resolutionMet;
  ticket.slaBreached = slaFlags.slaBreached;
  ticket.slaBreachReason = slaFlags.slaBreachReason;

  ticket.timeline.push({
    byUserId: new Types.ObjectId(user.id),
    byUserName: user.name,
    message: `Vendor assigned: ${vendor.name}${ticket.status === 'waiting_vendor' ? ' (status: waiting_vendor)' : ''}`,
    createdAt: now,
  });

  await ticket.save();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'ticket_vendor_assigned',
    entityType: 'ticket',
    entityId: ticket._id.toString(),
    before,
    after: ticket.toObject(),
    metadata: {
      vendorId: vendor._id.toString(),
      vendorName: vendor.name,
      setWaitingVendorStatus: parsed.data.setWaitingVendorStatus,
    },
  });

  await ticket.populate('vendorId', 'name category phone email isActive');

  return successResponse(ticket);
});
