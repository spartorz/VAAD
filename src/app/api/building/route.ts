import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { buildingSettingsUpdateSchema } from '@/lib/validations';
import { canManageBuilding } from '@/lib/auth';
import Building from '@/models/Building';
import { Types } from 'mongoose';

// GET /api/building - Get current building (by session.buildingId)
export const GET = withAuth(async (request, { user }) => {
  const building = await Building.findById(user.buildingId).lean();

  if (!building) {
    return errorResponse('Building not found', 404);
  }

  // Mask sensitive bank info for non-BOARD/MANAGEMENT
  if (user.role === 'RESIDENT') {
    // Residents can see limited info
    return successResponse({
      _id: building._id,
      name: building.name,
      address: building.address,
      city: building.city,
      country: building.country,
      settings: {
        currency: building.settings?.currency || 'ILS',
        dueDay: building.settings?.dueDay || 1,
      },
    });
  }

  // TREASURER can view but with partially masked bank info
  if (user.role === 'TREASURER') {
    const maskedBuilding = {
      ...building,
      bankInfo: building.bankInfo ? {
        bankName: building.bankInfo.bankName,
        accountNumber: building.bankInfo.accountNumber 
          ? `****${building.bankInfo.accountNumber.slice(-4)}`
          : undefined,
        notes: building.bankInfo.notes,
      } : undefined,
    };
    return successResponse(maskedBuilding);
  }

  // BOARD, MANAGEMENT, ADMIN get full access
  return successResponse(building);
});

// PATCH /api/building - Update building settings
export const PATCH = withAuth(async (request, { user }) => {
  // Only BOARD and MANAGEMENT can update building settings
  // TREASURER can optionally update financial settings (we allow partial access)
  const allowedRoles = ['ADMIN', 'BOARD', 'MANAGEMENT'];
  const financialOnlyRoles = ['TREASURER'];
  
  const canFullEdit = allowedRoles.includes(user.role);
  const canFinancialEdit = financialOnlyRoles.includes(user.role);
  
  if (!canFullEdit && !canFinancialEdit) {
    return errorResponse('Permission denied', 403);
  }

  const body = await request.json();
  
  // Validate the update payload
  const validation = buildingSettingsUpdateSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const building = await Building.findById(user.buildingId);
  if (!building) {
    return errorResponse('Building not found', 404);
  }

  const before = building.toObject();
  const updateData = validation.data;

  // TREASURER can only update financial settings
  if (canFinancialEdit && !canFullEdit) {
    // Only allow settings.monthlyDueAmount, settings.dueDay, settings.currency, bankInfo.notes
    const allowedFields: Partial<typeof updateData> = {};
    
    if (updateData.settings) {
      allowedFields.settings = {
        currency: updateData.settings.currency,
        dueDay: updateData.settings.dueDay,
        monthlyDueAmount: updateData.settings.monthlyDueAmount,
      };
    }
    if (updateData.bankInfo?.notes !== undefined) {
      allowedFields.bankInfo = { notes: updateData.bankInfo.notes };
    }

    // Merge settings
    if (allowedFields.settings) {
      building.settings = {
        ...building.settings,
        ...allowedFields.settings,
      };
    }
    if (allowedFields.bankInfo) {
      building.bankInfo = {
        ...building.bankInfo,
        ...allowedFields.bankInfo,
      };
    }
  } else {
    // Full update for BOARD/MANAGEMENT/ADMIN
    if (updateData.name !== undefined) building.name = updateData.name;
    if (updateData.address !== undefined) building.address = updateData.address;
    if (updateData.city !== undefined) building.city = updateData.city;
    if (updateData.country !== undefined) building.country = updateData.country;
    if (updateData.timezone !== undefined) building.timezone = updateData.timezone;
    
    if (updateData.settings) {
      building.settings = {
        ...building.settings,
        ...updateData.settings,
      };
    }
    
    if (updateData.bankInfo) {
      building.bankInfo = {
        ...building.bankInfo,
        ...updateData.bankInfo,
      };
    }
  }

  await building.save();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'update',
    entityType: 'building',
    entityId: building._id.toString(),
    before,
    after: building.toObject(),
  });

  return successResponse(building);
});

