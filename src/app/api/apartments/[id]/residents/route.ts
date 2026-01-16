import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canAccessApartment, canManageApartmentResidents } from '@/lib/auth';
import Apartment from '@/models/Apartment';
import Resident from '@/models/Resident';
import { Types } from 'mongoose';

// GET /api/apartments/[id]/residents - Get all residents for an apartment (active + history)
export const GET = withAuth(async (request, { user, params }) => {
  const apartmentId = params?.id;
  
  if (!apartmentId || !Types.ObjectId.isValid(apartmentId)) {
    return errorResponse('Invalid apartment ID');
  }

  // Check apartment access for residents
  if (!canAccessApartment(user, apartmentId)) {
    return errorResponse('Permission denied', 403);
  }

  // Verify apartment exists and belongs to same building
  const apartment = await Apartment.findOne({
    _id: new Types.ObjectId(apartmentId),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!apartment) {
    return errorResponse('Apartment not found', 404);
  }

  // Filter out rejected residents older than 24 hours
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Get all residents for this apartment
  const allResidents = await Resident.find({
    buildingId: new Types.ObjectId(user.buildingId),
    apartmentId: new Types.ObjectId(apartmentId),
    $or: [
      { invitationStatus: { $ne: 'rejected' } },
      { invitationStatus: 'rejected', rejectedAt: { $gte: twentyFourHoursAgo } },
      { invitationStatus: null },
      { rejectedAt: null },
    ],
  })
    .sort({ isPrimaryContact: -1, moveInAt: -1 })
    .lean();

  // Separate active and inactive (history)
  const activeResidents = allResidents.filter(r => r.isActive);
  const residentHistory = allResidents.filter(r => !r.isActive);

  // Auto-set primary contact if needed
  const hasPrimaryContact = activeResidents.some(r => r.isPrimaryContact);
  if (!hasPrimaryContact && activeResidents.length > 0) {
    const owner = activeResidents.find(r => r.type === 'owner');
    if (owner) {
      await Resident.updateOne(
        { _id: owner._id },
        { $set: { isPrimaryContact: true } }
      );
      // Update the owner in the array
      const ownerIndex = activeResidents.findIndex(r => r._id.toString() === owner._id.toString());
      if (ownerIndex !== -1) {
        activeResidents[ownerIndex].isPrimaryContact = true;
      }
    }
  }

  // Check if user can manage residents (only apartment owners or ADMIN/BOARD/MANAGEMENT)
  const canManage = await canManageApartmentResidents(user, apartmentId);

  return successResponse({
    apartment: {
      _id: apartment._id,
      number: apartment.number,
      floor: apartment.floor,
      status: apartment.status,
    },
    activeResidents,
    residentHistory,
    totalActive: activeResidents.length,
    totalHistory: residentHistory.length,
    canManageResidents: canManage,
  });
});

