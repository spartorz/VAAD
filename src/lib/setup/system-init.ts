import dbConnect from '@/lib/db';
import Building from '@/models/Building';
import User from '@/models/User';

export interface SystemInitializationState {
  isInitialized: boolean;
  hasBuilding: boolean;
  hasPrivilegedUser: boolean;
}

export async function getSystemInitializationState(): Promise<SystemInitializationState> {
  await dbConnect();

  const [buildingCount, privilegedUserCount] = await Promise.all([
    Building.countDocuments({}),
    User.countDocuments({ role: { $in: ['ADMIN', 'BOARD'] } }),
  ]);

  const hasBuilding = buildingCount > 0;
  const hasPrivilegedUser = privilegedUserCount > 0;
  return {
    isInitialized: hasBuilding && hasPrivilegedUser,
    hasBuilding,
    hasPrivilegedUser,
  };
}
