import { NextResponse } from 'next/server';
import { getSession, createAuditLog } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import Apartment from '@/models/Apartment';
import dbConnect from '@/lib/db';
import { Types } from 'mongoose';
import { createExportWorkbook, workbookToBuffer } from '@/lib/excel/writeExports';

// GET /api/exports/apartments - Export apartments to Excel
export async function GET() {
  const user = await getSession();
  
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageBuilding(user.role)) {
    return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
  }

  try {
    await dbConnect();

    const buildingId = new Types.ObjectId(user.buildingId);

    // Get all apartments
    const apartments = await Apartment.find({ buildingId })
      .sort({ number: 1 })
      .lean();

    // Build export data
    const exportData = apartments.map((apt) => ({
      apartmentNumber: apt.number,
      floor: apt.floor ?? '',
      sizeSqft: apt.size ?? '',
      status: apt.status === 'active' ? 'פעיל' : 'לא פעיל',
    }));

    // Create Excel workbook
    const workbook = await createExportWorkbook({
      sheetName: 'דירות',
      title: 'רשימת דירות',
      columns: [
        { header: 'מספר דירה', key: 'apartmentNumber', width: 15 },
        { header: 'קומה', key: 'floor', width: 10 },
        { header: 'שטח (מ"ר)', key: 'sizeSqft', width: 12 },
        { header: 'סטטוס', key: 'status', width: 12 },
      ],
      data: exportData,
      headerColor: '70AD47',
    });

    const buffer = await workbookToBuffer(workbook);

    // Create audit log
    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'export_apartments',
      entityType: 'apartment',
      entityId: buildingId.toString(),
      metadata: {
        totalRecords: apartments.length,
      },
    });

    const filename = `apartments_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[GET /api/exports/apartments] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to export apartments' 
    }, { status: 500 });
  }
}

