import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, getPaginationParams, buildSortObject, createAuditLog } from '@/lib/api-utils';
import { ticketSchema, paginationSchema } from '@/lib/validations';
import MaintenanceTicket from '@/models/MaintenanceTicket';
import Apartment from '@/models/Apartment';
import Vendor from '@/models/Vendor';
import User from '@/models/User';
import { Types } from 'mongoose';
import { calculateSlaDueDates, getEffectiveSlaPolicy } from '@/lib/tickets/sla-service';

// Ensure models are registered for populate (side-effect imports)
void Apartment;
void Vendor;
void User;

// GET /api/tickets - List tickets for the building
export const GET = withAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url);
  const params = getPaginationParams(request);
  const validation = paginationSchema.safeParse(params);
  
  if (!validation.success) {
    return errorResponse('Invalid pagination parameters', 400);
  }

  const { page, limit, search, sortBy, sortOrder } = validation.data;
  const skip = (page - 1) * limit;

  // Always scope to user's building
  const query: Record<string, unknown> = { buildingId: new Types.ObjectId(user.buildingId) };
  
  // Filter by apartment (if provided, verify it belongs to the same building)
  const apartmentIdParam = searchParams.get('apartmentId');
  if (apartmentIdParam && Types.ObjectId.isValid(apartmentIdParam)) {
    const apartment = await Apartment.findOne({ 
      _id: new Types.ObjectId(apartmentIdParam),
      buildingId: new Types.ObjectId(user.buildingId)
    }).lean();
    
    if (!apartment) {
      return errorResponse('Apartment not found or access denied', 404);
    }
    query.apartmentId = new Types.ObjectId(apartmentIdParam);
  }

  // Filter by status
  const status = searchParams.get('status');
  if (status && ['open', 'in_progress', 'waiting_vendor', 'resolved', 'closed'].includes(status)) {
    query.status = status;
  }

  // Filter by priority
  const priority = searchParams.get('priority');
  if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority)) {
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
        { apartmentId: null }, // Building-wide tickets visible to all residents
      ];
    } else {
      query.createdBy = new Types.ObjectId(user.id);
    }
  }

  try {
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
      data: tickets || [],
      pagination: {
        page,
        limit,
        total: total || 0,
        totalPages: Math.ceil((total || 0) / limit),
      },
    });
  } catch (error) {
    console.error('[GET /api/tickets] Query error:', error);
    // Return empty result instead of 500 for query errors
    return successResponse({
      data: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0,
      },
    });
  }
});

// POST /api/tickets - Create new ticket
export const POST = withAuth(async (request, { user }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }
  
  // Determine apartmentId
  let apartmentId: string | undefined | null = body.apartmentId;
  
  // Residents can only create tickets for their own apartment
  if (user.role === 'RESIDENT' && user.apartmentId) {
    apartmentId = user.apartmentId;
  }
  
  // Handle "none" value from frontend (building-wide ticket)
  if (apartmentId === 'none' || apartmentId === '') {
    apartmentId = undefined;
  }

  // If apartmentId is provided, verify it belongs to user's building
  if (apartmentId && Types.ObjectId.isValid(apartmentId)) {
    const apartment = await Apartment.findOne({
      _id: new Types.ObjectId(apartmentId),
      buildingId: new Types.ObjectId(user.buildingId),
    }).lean();
    
    if (!apartment) {
      return errorResponse('Apartment not found or access denied', 404);
    }
  }

  const validation = ticketSchema.safeParse({
    ...body,
    buildingId: user.buildingId,
    apartmentId: apartmentId || undefined,
  });

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message, 400);
  }

  try {
    const policy = await getEffectiveSlaPolicy(user.buildingId);
    const createdAt = new Date();
    const dueDates = calculateSlaDueDates({
      createdAt,
      priority: validation.data.priority,
      policy,
    });

    const ticketData: Record<string, unknown> = {
      ...validation.data,
      buildingId: new Types.ObjectId(user.buildingId),
      createdBy: new Types.ObjectId(user.id),
      responseDueAt: dueDates.responseDueAt,
      resolutionDueAt: dueDates.resolutionDueAt,
      slaSource: 'ticket_sla_policy',
      slaPolicyVersion: policy.version,
      responseMet: undefined,
      resolutionMet: undefined,
      slaBreached: false,
      timeline: [{
        byUserId: new Types.ObjectId(user.id),
        byUserName: user.name,
        message: 'Ticket created',
        createdAt: new Date(),
      }],
    };
    
    // Only include apartmentId if provided (building-wide tickets have no apartmentId)
    if (validation.data.apartmentId) {
      ticketData.apartmentId = new Types.ObjectId(validation.data.apartmentId);
    }
    
    const ticket = await MaintenanceTicket.create(ticketData);

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
  } catch (error) {
    console.error('[POST /api/tickets] Create error:', error);
    return errorResponse('Failed to create ticket', 500);
  }
});

