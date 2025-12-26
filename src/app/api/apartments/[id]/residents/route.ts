import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canAccessApartment } from '@/lib/auth';
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

  // Get all residents for this apartment, sorted by moveInAt descending
  const allResidents = await Resident.find({
    buildingId: new Types.ObjectId(user.buildingId),
    apartmentId: new Types.ObjectId(apartmentId),
  })
    .sort({ moveInAt: -1 })
    .lean();

  // Separate active and inactive (history)
  const activeResidents = allResidents.filter(r => r.isActive);
  const residentHistory = allResidents.filter(r => !r.isActive);

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
  });
});

