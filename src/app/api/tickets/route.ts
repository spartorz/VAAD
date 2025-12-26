import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, getPaginationParams, buildSortObject, createAuditLog } from '@/lib/api-utils';
import { ticketSchema, paginationSchema } from '@/lib/validations';
import { canManageBuilding, canAccessApartment } from '@/lib/auth';
import MaintenanceTicket from '@/models/MaintenanceTicket';
import { Types } from 'mongoose';

// GET /api/tickets - List tickets for the building
export const GET = withAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url);
  const params = getPaginationParams(request);
  const validation = paginationSchema.safeParse(params);
  
  if (!validation.success) {
    return errorResponse('Invalid pagination parameters');
  }

  const { page, limit, search, sortBy, sortOrder } = validation.data;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { buildingId: new Types.ObjectId(user.buildingId) };
  
  // Filter by apartment
  const apartmentId = searchParams.get('apartmentId');
  if (apartmentId && Types.ObjectId.isValid(apartmentId)) {
    query.apartmentId = new Types.ObjectId(apartmentId);
  }

  // Filter by status
  const status = searchParams.get('status');
  if (status) {
    query.status = status;
  }

  // Filter by priority
  const priority = searchParams.get('priority');
  if (priority) {
    query.priority = priority;
  }

  // Search by title/description
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }

  // For residents, only show their apartment tickets or tickets they created
  if (user.role === 'RESIDENT') {
    if (user.apartmentId) {
      query.$or = [
        { apartmentId: new Types.ObjectId(user.apartmentId) },
        { createdBy: new Types.ObjectId(user.id) },
      ];
    } else {
      query.createdBy = new Types.ObjectId(user.id);
    }
  }

  const [tickets, total] = await Promise.all([
    MaintenanceTicket.find(query)
      .populate('apartmentId', 'number floor')
      .populate('createdBy', 'name')
      .populate('vendorId', 'name category')
      .sort(buildSortObject(sortBy, sortOrder))
      .skip(skip)
      .limit(limit)
      .lean(),
    MaintenanceTicket.countDocuments(query),
  ]);

  return successResponse({
    data: tickets,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// POST /api/tickets - Create new ticket
export const POST = withAuth(async (request, { user }) => {
  const body = await request.json();
  
  // Residents can only create tickets for their own apartment
  let apartmentId = body.apartmentId;
  if (user.role === 'RESIDENT' && user.apartmentId) {
    apartmentId = user.apartmentId;
  }

  const validation = ticketSchema.safeParse({
    ...body,
    buildingId: user.buildingId,
    apartmentId,
  });

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const ticket = await MaintenanceTicket.create({
    ...validation.data,
    buildingId: new Types.ObjectId(user.buildingId),
    apartmentId: validation.data.apartmentId ? new Types.ObjectId(validation.data.apartmentId) : undefined,
    createdBy: new Types.ObjectId(user.id),
    timeline: [{
      byUserId: new Types.ObjectId(user.id),
      byUserName: user.name,
      message: 'Ticket created',
      createdAt: new Date(),
    }],
  });

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'create',
    entityType: 'ticket',
    entityId: ticket._id.toString(),
    after: ticket.toObject(),
  });

  return successResponse(ticket, 201);
});

