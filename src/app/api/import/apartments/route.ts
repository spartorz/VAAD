import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import dbConnect from '@/lib/db';
import { Types } from 'mongoose';
import { runApartmentsImportFromBuffer } from '@/lib/import/apartments-import-service';

// POST /api/import/apartments - Import apartments from Excel
export async function POST(request: NextRequest) {
  const user = await getSession();
  
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageBuilding(user.role)) {
    return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') !== '0';

  try {
    await dbConnect();

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx')) {
      return NextResponse.json({ success: false, error: 'Invalid file type. Please upload an Excel file (.xlsx)' }, { status: 400 });
    }

    const importResult = await runApartmentsImportFromBuffer(await file.arrayBuffer(), {
      buildingId: new Types.ObjectId(user.buildingId),
      dryRun,
      actor: {
        userId: user.id,
        userName: user.name,
      },
    });

    return NextResponse.json({
      success: true,
      data: importResult,
    });
  } catch (error) {
    console.error('[POST /api/import/apartments] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to import apartments' 
    }, { status: 500 });
  }
}

