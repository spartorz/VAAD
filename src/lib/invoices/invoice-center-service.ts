import { Types } from 'mongoose';
import type { PipelineStage } from 'mongoose';
import MaintenanceTicket from '@/models/MaintenanceTicket';

export type InvoiceFileStatus = 'invoice_attached' | 'missing_invoice_file' | 'broken_file_reference';

interface InvoiceCenterQuery {
  buildingId: string;
  month?: number;
  year?: number;
  vendorId?: string;
  amountMin?: number;
  amountMax?: number;
  hasFile?: boolean;
  missingFile?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface InvoiceCenterRow {
  ticketId: string;
  ticketTitle: string;
  vendorId?: string;
  vendorName?: string;
  vendorCategory?: string;
  invoiceNumber?: string;
  amount: number;
  currency: string;
  invoiceDate?: string;
  uploadedDate?: string;
  fileStatus: InvoiceFileStatus;
  fileUrl?: string;
  fileName?: string;
  invoiceDocumentId?: string;
  closedAt?: string;
}

export interface InvoiceCenterResponse {
  period: string;
  kpis: {
    invoicesThisMonth: number;
    totalExpensesThisMonth: number;
    totalExpensesSelectedPeriod: number;
    vendorsInvoiced: number;
    invoicesMissingFiles: number;
  };
  rows: InvoiceCenterRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface InvoiceCenterExpenseResponse {
  period: string;
  currentMonthExpenses: number;
  totalExpensesSelectedPeriod: number;
  last12MonthsTrend: Array<{ period: string; total: number }>;
  topVendors: Array<{ vendorId?: string; vendorName: string; total: number; count: number }>;
  expenseByVendor: Array<{ vendorId?: string; vendorName: string; total: number; count: number }>;
  expenseByCategory: Array<{ category: string; total: number; count: number }>;
}

function getCurrentPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function toPeriodString(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

function normalizePeriod(month?: number, year?: number) {
  const current = getCurrentPeriod();
  const normalizedYear = year && year >= 2000 && year <= 2100 ? year : current.year;
  const normalizedMonth = month && month >= 1 && month <= 12 ? month : current.month;
  return {
    year: normalizedYear,
    month: normalizedMonth,
    period: toPeriodString(normalizedYear, normalizedMonth),
  };
}

function parseSearch(search?: string) {
  if (!search?.trim()) return undefined;
  return new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function buildTablePipeline({
  buildingObjectId,
  from,
  to,
  vendorId,
  amountMin,
  amountMax,
  hasFile,
  missingFile,
  search,
  page,
  limit,
}: {
  buildingObjectId: Types.ObjectId;
  from: Date;
  to: Date;
  vendorId?: string;
  amountMin?: number;
  amountMax?: number;
  hasFile?: boolean;
  missingFile?: boolean;
  search?: string;
  page: number;
  limit: number;
}): PipelineStage[] {
  const match: Record<string, unknown> = {
    buildingId: buildingObjectId,
    costAmount: { $gt: 0 },
    closedAt: { $gte: from, $lte: to },
  };

  if (vendorId && Types.ObjectId.isValid(vendorId)) {
    match.vendorId = new Types.ObjectId(vendorId);
  }
  if (typeof amountMin === 'number' || typeof amountMax === 'number') {
    const amountQuery: Record<string, number> = {};
    if (typeof amountMin === 'number') amountQuery.$gte = amountMin;
    if (typeof amountMax === 'number') amountQuery.$lte = amountMax;
    match.costAmount = { $gt: 0, ...amountQuery };
  }

  const escapedSearch = parseSearch(search);

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $lookup: {
        from: 'documents',
        let: { invoiceDocumentId: '$invoiceDocumentId', buildingId: '$buildingId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$_id', '$$invoiceDocumentId'] },
                  { $eq: ['$buildingId', '$$buildingId'] },
                ],
              },
            },
          },
          { $project: { _id: 1, title: 1, file: 1, createdAt: 1 } },
        ],
        as: 'invoiceDocument',
      },
    },
    {
      $lookup: {
        from: 'vendors',
        localField: 'vendorId',
        foreignField: '_id',
        as: 'vendor',
      },
    },
    {
      $addFields: {
        invoiceDocumentResolved: { $arrayElemAt: ['$invoiceDocument', 0] },
        vendorResolved: { $arrayElemAt: ['$vendor', 0] },
      },
    },
    {
      $addFields: {
        fileStatus: {
          $switch: {
            branches: [
              {
                case: {
                  $or: [
                    { $eq: ['$invoiceDocumentId', null] },
                    { $eq: [{ $type: '$invoiceDocumentId' }, 'missing'] },
                  ],
                },
                then: 'missing_invoice_file',
              },
              {
                case: { $gt: [{ $size: '$invoiceDocument' }, 0] },
                then: 'invoice_attached',
              },
            ],
            default: 'broken_file_reference',
          },
        },
      },
    },
  ];

  if (hasFile === true) {
    pipeline.push({ $match: { fileStatus: 'invoice_attached' } });
  }
  if (missingFile === true) {
    pipeline.push({ $match: { fileStatus: { $in: ['missing_invoice_file', 'broken_file_reference'] } } });
  }

  if (escapedSearch) {
    pipeline.push({
      $match: {
        $or: [
          { invoiceNumber: escapedSearch },
          { title: escapedSearch },
          { 'vendorResolved.name': escapedSearch },
        ],
      },
    });
  }

  pipeline.push(
    {
      $facet: {
        rows: [
          { $sort: { closedAt: -1, updatedAt: -1 } },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              title: 1,
              vendorId: '$vendorResolved._id',
              vendorName: '$vendorResolved.name',
              vendorCategory: '$vendorResolved.category',
              invoiceNumber: 1,
              costAmount: 1,
              costCurrency: 1,
              invoiceDate: 1,
              closedAt: 1,
              fileStatus: 1,
              invoiceDocumentId: '$invoiceDocumentResolved._id',
              file: '$invoiceDocumentResolved.file',
              uploadedDate: '$invoiceDocumentResolved.createdAt',
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    }
  );

  return pipeline;
}

async function getKpis(buildingObjectId: Types.ObjectId, selectedFrom: Date, selectedTo: Date) {
  const now = new Date();
  const { start: currentFrom, end: currentTo } = getMonthRange(now.getFullYear(), now.getMonth() + 1);

  const [currentMonthAgg, selectedPeriodAgg, selectedVendorAgg, selectedMissingAgg] = await Promise.all([
    MaintenanceTicket.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          costAmount: { $gt: 0 },
          closedAt: { $gte: currentFrom, $lte: currentTo },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: '$costAmount' },
        },
      },
    ]),
    MaintenanceTicket.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          costAmount: { $gt: 0 },
          closedAt: { $gte: selectedFrom, $lte: selectedTo },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$costAmount' },
        },
      },
    ]),
    MaintenanceTicket.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          costAmount: { $gt: 0 },
          closedAt: { $gte: selectedFrom, $lte: selectedTo },
          vendorId: { $exists: true, $ne: null },
        },
      },
      { $group: { _id: '$vendorId' } },
      { $count: 'count' },
    ]),
    MaintenanceTicket.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          costAmount: { $gt: 0 },
          closedAt: { $gte: selectedFrom, $lte: selectedTo },
        },
      },
      {
        $lookup: {
          from: 'documents',
          let: { invoiceDocumentId: '$invoiceDocumentId', buildingId: '$buildingId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$invoiceDocumentId'] },
                    { $eq: ['$buildingId', '$$buildingId'] },
                  ],
                },
              },
            },
          ],
          as: 'invoiceDocument',
        },
      },
      {
        $addFields: {
          fileStatus: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      { $eq: ['$invoiceDocumentId', null] },
                      { $eq: [{ $type: '$invoiceDocumentId' }, 'missing'] },
                    ],
                  },
                  then: 'missing_invoice_file',
                },
                { case: { $gt: [{ $size: '$invoiceDocument' }, 0] }, then: 'invoice_attached' },
              ],
              default: 'broken_file_reference',
            },
          },
        },
      },
      {
        $match: {
          fileStatus: { $in: ['missing_invoice_file', 'broken_file_reference'] },
        },
      },
      { $count: 'count' },
    ]),
  ]);

  return {
    invoicesThisMonth: Number(currentMonthAgg[0]?.count || 0),
    totalExpensesThisMonth: Number(currentMonthAgg[0]?.total || 0),
    totalExpensesSelectedPeriod: Number(selectedPeriodAgg[0]?.total || 0),
    vendorsInvoiced: Number(selectedVendorAgg[0]?.count || 0),
    invoicesMissingFiles: Number(selectedMissingAgg[0]?.count || 0),
  };
}

export async function getInvoiceCenterData(query: InvoiceCenterQuery): Promise<InvoiceCenterResponse> {
  const periodInfo = normalizePeriod(query.month, query.year);
  const { start, end } = getMonthRange(periodInfo.year, periodInfo.month);
  const buildingObjectId = new Types.ObjectId(query.buildingId);
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(100, Math.max(1, query.limit || 20));

  const [kpis, listAgg] = await Promise.all([
    getKpis(buildingObjectId, start, end),
    MaintenanceTicket.aggregate(
      buildTablePipeline({
        buildingObjectId,
        from: start,
        to: end,
        vendorId: query.vendorId,
        amountMin: query.amountMin,
        amountMax: query.amountMax,
        hasFile: query.hasFile,
        missingFile: query.missingFile,
        search: query.search,
        page,
        limit,
      })
    ),
  ]);

  const listContainer = listAgg[0] || { rows: [], total: [] };
  const total = Number(listContainer.total?.[0]?.count || 0);

  const rows: InvoiceCenterRow[] = (listContainer.rows || []).map((row: Record<string, unknown>) => ({
    ticketId: String(row._id),
    ticketTitle: String(row.title || ''),
    vendorId: row.vendorId ? String(row.vendorId) : undefined,
    vendorName: row.vendorName ? String(row.vendorName) : undefined,
    vendorCategory: row.vendorCategory ? String(row.vendorCategory) : undefined,
    invoiceNumber: row.invoiceNumber ? String(row.invoiceNumber) : undefined,
    amount: Number(row.costAmount || 0),
    currency: String(row.costCurrency || 'ILS'),
    invoiceDate: row.invoiceDate ? new Date(String(row.invoiceDate)).toISOString() : undefined,
    uploadedDate: row.uploadedDate ? new Date(String(row.uploadedDate)).toISOString() : undefined,
    fileStatus: row.fileStatus as InvoiceFileStatus,
    fileUrl: (row.file as { url?: string } | undefined)?.url,
    fileName: (row.file as { name?: string } | undefined)?.name,
    invoiceDocumentId: row.invoiceDocumentId ? String(row.invoiceDocumentId) : undefined,
    closedAt: row.closedAt ? new Date(String(row.closedAt)).toISOString() : undefined,
  }));

  return {
    period: periodInfo.period,
    kpis,
    rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function getInvoiceCenterExpenseData(query: InvoiceCenterQuery): Promise<InvoiceCenterExpenseResponse> {
  const periodInfo = normalizePeriod(query.month, query.year);
  const { start: selectedFrom, end: selectedTo } = getMonthRange(periodInfo.year, periodInfo.month);
  const buildingObjectId = new Types.ObjectId(query.buildingId);

  const now = new Date();
  const { start: currentFrom, end: currentTo } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
  const trendStart = new Date(periodInfo.year, periodInfo.month - 1 - 11, 1, 0, 0, 0, 0);

  const [currentMonthAgg, selectedAgg, trendAgg, vendorsAgg, categoryAgg] = await Promise.all([
    MaintenanceTicket.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          costAmount: { $gt: 0 },
          closedAt: { $gte: currentFrom, $lte: currentTo },
        },
      },
      { $group: { _id: null, total: { $sum: '$costAmount' } } },
    ]),
    MaintenanceTicket.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          costAmount: { $gt: 0 },
          closedAt: { $gte: selectedFrom, $lte: selectedTo },
        },
      },
      { $group: { _id: null, total: { $sum: '$costAmount' } } },
    ]),
    MaintenanceTicket.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          costAmount: { $gt: 0 },
          closedAt: { $gte: trendStart, $lte: selectedTo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$closedAt' },
            month: { $month: '$closedAt' },
          },
          total: { $sum: '$costAmount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    MaintenanceTicket.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          costAmount: { $gt: 0 },
          closedAt: { $gte: selectedFrom, $lte: selectedTo },
          vendorId: { $exists: true, $ne: null },
        },
      },
      {
        $lookup: {
          from: 'vendors',
          localField: 'vendorId',
          foreignField: '_id',
          as: 'vendor',
        },
      },
      {
        $addFields: {
          vendorResolved: { $arrayElemAt: ['$vendor', 0] },
        },
      },
      {
        $group: {
          _id: '$vendorId',
          vendorName: { $first: '$vendorResolved.name' },
          total: { $sum: '$costAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]),
    MaintenanceTicket.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          costAmount: { $gt: 0 },
          closedAt: { $gte: selectedFrom, $lte: selectedTo },
        },
      },
      {
        $lookup: {
          from: 'vendors',
          localField: 'vendorId',
          foreignField: '_id',
          as: 'vendor',
        },
      },
      {
        $addFields: {
          vendorResolved: { $arrayElemAt: ['$vendor', 0] },
          categoryResolved: {
            $ifNull: [{ $arrayElemAt: ['$vendor.category', 0] }, 'other'],
          },
        },
      },
      {
        $group: {
          _id: '$categoryResolved',
          total: { $sum: '$costAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]),
  ]);

  return {
    period: periodInfo.period,
    currentMonthExpenses: Number(currentMonthAgg[0]?.total || 0),
    totalExpensesSelectedPeriod: Number(selectedAgg[0]?.total || 0),
    last12MonthsTrend: trendAgg.map((item) => ({
      period: toPeriodString(Number(item._id.year), Number(item._id.month)),
      total: Number(item.total || 0),
    })),
    topVendors: vendorsAgg.slice(0, 5).map((item) => ({
      vendorId: item._id ? String(item._id) : undefined,
      vendorName: item.vendorName || 'ללא ספק',
      total: Number(item.total || 0),
      count: Number(item.count || 0),
    })),
    expenseByVendor: vendorsAgg.map((item) => ({
      vendorId: item._id ? String(item._id) : undefined,
      vendorName: item.vendorName || 'ללא ספק',
      total: Number(item.total || 0),
      count: Number(item.count || 0),
    })),
    expenseByCategory: categoryAgg.map((item) => ({
      category: String(item._id || 'other'),
      total: Number(item.total || 0),
      count: Number(item.count || 0),
    })),
  };
}
