import { Types } from 'mongoose';
import Apartment from '@/models/Apartment';
import Resident from '@/models/Resident';
import Charge from '@/models/Charge';
import Payment from '@/models/Payment';
import MaintenanceTicket from '@/models/MaintenanceTicket';
import NotificationBatch from '@/models/NotificationBatch';
import NotificationItem from '@/models/NotificationItem';
import AuditLog from '@/models/AuditLog';
import Building from '@/models/Building';
import { getBuildingTotals } from '@/lib/balance';
import { AuditAction } from '@/lib/types';

interface AttentionItem {
  count: number;
  href: string;
}

interface EmptyStateHint {
  key: string;
  title: string;
  description: string;
  href: string;
}

interface RecentActivityItem {
  id: string;
  actionLabelHe: string;
  actor: string;
  timestamp: string;
  summary?: string;
  href?: string;
}

export interface ExecutiveSummaryResponse {
  period: string;
  currency: string;
  scopes: {
    financialSnapshot: 'period';
    totalOpenBalance: 'all_time';
  };
  currencyContext: {
    buildingCurrency: string;
    periodCurrency: string;
    totalOpenBalanceCurrency: string;
    isPeriodCurrencyDerivedFromCharges: boolean;
  };
  kpis: {
    totalApartments: number;
    activeResidents: number;
    unpaidApartments: number;
    unpaidResidents: number;
    totalOpenBalance: number;
    totalPaidThisMonth: number;
    openTickets: number;
    notificationsSentThisMonth: number;
    notificationsOpenedThisMonth: number;
    notificationDeliveryRatePct: number;
    notificationReadRatePct: number;
    notificationFailureRatePct: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    netPosition: number;
    topExpenseVendorName: string;
    topExpenseVendorAmount: number;
    openTicketsWithoutInvoice: number;
    pendingApprovalBatches: number;
    totalOpenBalanceScope: 'all_time';
  };
  financialSnapshot: {
    scope: 'period';
    totalCharged: number;
    totalPaid: number;
    remainingBalance: number;
    collectionRatePct: number;
    breakdown: {
      paid: number;
      partial: number;
      unpaid: number;
      noCharge: number;
    };
  };
  attentionRequired: {
    unpaidApartments: AttentionItem;
    openTickets: AttentionItem;
    pendingApprovalBatches: AttentionItem;
    failedNotifications: AttentionItem;
    openTicketsWithoutInvoice: AttentionItem;
    residentsMissingPhone: AttentionItem;
    apartmentsWithoutResidents: AttentionItem;
  };
  recentActivity: RecentActivityItem[];
  emptyStateHints: EmptyStateHint[];
}

function getMonthDateRange(period: string) {
  const [year, month] = period.split('-').map(Number);
  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
  return { startOfMonth, endOfMonth };
}

function getCurrentPeriod() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

function getActiveResidentMatch(now: Date): Record<string, unknown> {
  const hasIsActive = Boolean(Resident.schema.path('isActive'));
  if (hasIsActive) {
    return { isActive: true };
  }

  return {
    moveInAt: { $lte: now },
    $or: [{ moveOutAt: null }, { moveOutAt: { $exists: false } }, { moveOutAt: { $gt: now } }],
  };
}

function mapActionToHebrew(action: AuditAction): string {
  const labels: Partial<Record<AuditAction, string>> = {
    create: 'נוצר',
    update: 'עודכן',
    void: 'בוטל',
    delete: 'נמחק',
    login: 'התחבר',
    generate_charges: 'הופקו חיובים',
    import_data: 'בוצע יבוא נתונים',
    import_apartments: 'יובאו דירות',
    import_residents: 'יובאו דיירים',
    export_billing_monthly: 'יוצא דוח חיובים חודשי',
    export_apartments: 'יוצא דוח דירות',
    export_residents: 'יוצא דוח דיירים',
    export_payments: 'יוצא דוח תשלומים',
    export_audit: 'יוצא דוח פעילות',
    whatsapp_reminder_copied: 'הועתקה תזכורת WhatsApp',
    notification_open_whatsapp: 'נפתחה הודעת WhatsApp',
    invoice_view: 'נצפתה חשבונית',
    invoice_download: 'הורדה חשבונית',
    invoice_issued: 'הופקה חשבונית',
    invoice_pdf_download: 'הורד PDF חשבונית',
    ticket_closed: 'קריאה נסגרה',
    notification_batch_created: 'נוצר קמפיין התראות',
    notification_item_opened_manual: 'סומנה הודעה כנפתחה',
    notification_retry_requested: 'התבקשה שליחה חוזרת',
    notification_marked_sent: 'הודעה סומנה כנשלחה',
    notification_marked_failed: 'הודעה סומנה כנכשלה',
    notification_batch_cancelled: 'קמפיין התראות בוטל',
    notification_batch_approved: 'קמפיין התראות אושר',
    notification_template_created: 'תבנית התראה נוצרה',
    notification_template_updated: 'תבנית התראה עודכנה',
    notification_settings_updated: 'הגדרות התראות עודכנו',
    notification_batch_auto_created: 'נוצר קמפיין אוטומטי',
    notification_batch_auto_skipped: 'קמפיין אוטומטי דולג',
    notification_batch_already_exists: 'קמפיין כבר קיים',
    notification_provider_send_started: 'החלה שליחת התראות',
    notification_provider_send_succeeded: 'שליחת התראות הצליחה',
    notification_provider_send_failed: 'שליחת התראות נכשלה',
    notification_webhook_received: 'התקבל Webhook התראות',
    notification_delivery_updated: 'עודכן סטטוס מסירה',
    notification_template_blocked: 'תבנית התראות נחסמה',
    notification_delivered: 'עודכן כסטטוס נמסר',
    notification_read: 'עודכן כסטטוס נקרא',
    notification_failed: 'עודכן כסטטוס נכשל',
    notification_retry_started: 'החל ניסיון שליחה חוזר',
    notification_retry_completed: 'הושלם ניסיון שליחה חוזר',
    login_success: 'התחברות הצליחה',
    login_failed: 'ניסיון התחברות נכשל',
    password_reset_requested: 'התבקש איפוס סיסמה',
    password_reset_completed: 'איפוס סיסמה הושלם',
    rate_limit_triggered: 'הופעלה הגבלת קצב',
    report_exported: 'יוצא דוח כספי',
  };

  return labels[action] || 'פעולה';
}

function getEntityHref(entityType: string, entityId?: string): string | undefined {
  if (entityType === 'payment' || entityType === 'charge') return '/billing';
  if (entityType === 'ticket') return entityId ? `/tickets/${entityId}` : '/tickets';
  if (entityType === 'resident') return '/residents';
  if (entityType === 'apartment') return '/apartments';
  if (entityType === 'notification_batch' || entityType === 'notification_item') return '/notifications';
  if (entityType === 'document') return '/documents';
  return '/audit-log';
}

function summarizeMetadata(metadata: Record<string, unknown> | undefined): string | undefined {
  if (!metadata) return undefined;

  const month = typeof metadata.month === 'string' ? metadata.month : undefined;
  const itemCount = typeof metadata.itemCount === 'number' ? metadata.itemCount : undefined;
  const amount = typeof metadata.amount === 'number' ? metadata.amount : undefined;
  const reference = typeof metadata.reference === 'string' ? metadata.reference : undefined;

  if (month && typeof itemCount === 'number') {
    return `${month} • ${itemCount} נמענים`;
  }
  if (typeof amount === 'number' && reference) {
    return `${amount.toLocaleString('he-IL')} • ${reference}`;
  }
  if (typeof amount === 'number') {
    return amount.toLocaleString('he-IL');
  }
  if (month) {
    return month;
  }
  return undefined;
}

export async function getExecutiveDashboardSummary(
  buildingId: string,
  requestedPeriod?: string
): Promise<ExecutiveSummaryResponse> {
  const period = requestedPeriod && /^\d{4}-\d{2}$/.test(requestedPeriod) ? requestedPeriod : getCurrentPeriod();
  const now = new Date();
  const buildingObjectId = new Types.ObjectId(buildingId);
  const { startOfMonth, endOfMonth } = getMonthDateRange(period);
  const activeResidentMatch = getActiveResidentMatch(now);

  const [
    building,
    buildingTotals,
    totalApartments,
    activeResidents,
    openTickets,
    pendingApprovalBatches,
    notificationSentCount,
    notificationOpenedManualCount,
    notificationDeliveredCount,
    notificationReadCount,
    failedNotifications,
    residentsMissingPhone,
    activeResidentApartmentGroups,
    recentLogs,
    chargeByApartment,
    paymentByApartment,
    periodChargeCurrencies,
    allOpenChargeCurrencies,
    monthlyExpenseAgg,
    topExpenseVendorAgg,
    openCostTickets,
  ] = await Promise.all([
    Building.findById(buildingObjectId).select('settings.currency').lean(),
    getBuildingTotals(buildingId),
    Apartment.countDocuments({ buildingId: buildingObjectId, status: 'active' }),
    Resident.countDocuments({ buildingId: buildingObjectId, ...activeResidentMatch }),
    MaintenanceTicket.countDocuments({
      buildingId: buildingObjectId,
      status: { $nin: ['resolved', 'closed'] },
    }),
    NotificationBatch.countDocuments({
      buildingId: buildingObjectId,
      status: 'ready_for_review',
    }),
    NotificationItem.countDocuments({
      buildingId: buildingObjectId,
      sentAt: { $gte: startOfMonth, $lte: endOfMonth },
    }),
    NotificationItem.countDocuments({
      buildingId: buildingObjectId,
      status: 'opened_manual',
      lastAttemptAt: { $gte: startOfMonth, $lte: endOfMonth },
    }),
    NotificationItem.countDocuments({
      buildingId: buildingObjectId,
      deliveredAt: { $gte: startOfMonth, $lte: endOfMonth },
    }),
    NotificationItem.countDocuments({
      buildingId: buildingObjectId,
      readAt: { $gte: startOfMonth, $lte: endOfMonth },
    }),
    NotificationItem.countDocuments({
      buildingId: buildingObjectId,
      status: 'failed',
      $or: [
        { failedAt: { $gte: startOfMonth, $lte: endOfMonth } },
        {
          failedAt: { $exists: false },
          updatedAt: { $gte: startOfMonth, $lte: endOfMonth },
        },
      ],
    }),
    Resident.countDocuments({
      buildingId: buildingObjectId,
      ...activeResidentMatch,
      $or: [
        { phone: { $exists: false } },
        { phone: null },
        { phone: '' },
      ],
    }),
    Resident.aggregate([
      { $match: { buildingId: buildingObjectId, ...activeResidentMatch } },
      { $group: { _id: '$apartmentId' } },
      { $count: 'count' },
    ]),
    AuditLog.find({ buildingId: buildingObjectId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('_id action entityType entityId actorName metadata createdAt')
      .lean(),
    Charge.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          type: 'monthly_due',
          period,
          status: 'open',
        },
      },
      {
        $group: {
          _id: '$apartmentId',
          amount: { $sum: '$amount' },
        },
      },
    ]),
    Payment.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          status: 'confirmed',
          paidAt: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      {
        $group: {
          _id: '$apartmentId',
          amount: { $sum: '$amount' },
        },
      },
    ]),
    Charge.distinct('currency', {
      buildingId: buildingObjectId,
      type: 'monthly_due',
      period,
      status: 'open',
    }),
    Charge.distinct('currency', {
      buildingId: buildingObjectId,
      status: 'open',
    }),
    MaintenanceTicket.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          costAmount: { $gt: 0 },
          closedAt: { $gte: startOfMonth, $lte: endOfMonth },
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
          closedAt: { $gte: startOfMonth, $lte: endOfMonth },
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
        },
      },
      { $sort: { total: -1 } },
      { $limit: 1 },
    ]),
    MaintenanceTicket.aggregate([
      {
        $match: {
          buildingId: buildingObjectId,
          costAmount: { $gt: 0 },
          status: { $in: ['open', 'in_progress', 'waiting_vendor'] },
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
            { $project: { _id: 1 } },
          ],
          as: 'invoiceDocument',
        },
      },
      {
        $addFields: {
          invoiceFileStatus: {
            $switch: {
              branches: [
                { case: { $eq: ['$invoiceDocumentId', null] }, then: 'missing_invoice_file' },
                { case: { $gt: [{ $size: '$invoiceDocument' }, 0] }, then: 'invoice_attached' },
              ],
              default: 'broken_file_reference',
            },
          },
        },
      },
      {
        $match: {
          invoiceFileStatus: { $in: ['missing_invoice_file', 'broken_file_reference'] },
        },
      },
      { $count: 'count' },
    ]),
  ]);

  const paymentMap = new Map<string, number>(
    paymentByApartment.map((item) => [item._id.toString(), Number(item.amount) || 0])
  );

  let totalCharged = 0;
  let totalPaid = 0;
  let remainingBalance = 0;
  let paidCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;
  const unpaidApartmentIds: Types.ObjectId[] = [];

  for (const charge of chargeByApartment) {
    const apartmentId = charge._id.toString();
    const due = Number(charge.amount) || 0;
    const paid = paymentMap.get(apartmentId) || 0;
    const remaining = Math.max(0, due - paid);

    totalCharged += due;
    totalPaid += paid;
    remainingBalance += remaining;

    if (remaining <= 0) {
      paidCount += 1;
    } else if (paid > 0) {
      partialCount += 1;
      unpaidApartmentIds.push(new Types.ObjectId(apartmentId));
    } else {
      unpaidCount += 1;
      unpaidApartmentIds.push(new Types.ObjectId(apartmentId));
    }
  }

  const noChargeCount = Math.max(0, totalApartments - chargeByApartment.length);
  const unpaidApartments = partialCount + unpaidCount;
  const unpaidResidents = unpaidApartmentIds.length
    ? await Resident.countDocuments({
        buildingId: buildingObjectId,
        ...activeResidentMatch,
        apartmentId: { $in: unpaidApartmentIds },
      })
    : 0;

  const apartmentsWithResidents = activeResidentApartmentGroups[0]?.count || 0;
  const apartmentsWithoutResidents = Math.max(0, totalApartments - apartmentsWithResidents);
  const notificationsOpenedThisMonth = notificationOpenedManualCount + notificationReadCount;
  const notificationTrackedBase = notificationSentCount + notificationDeliveredCount + notificationReadCount + failedNotifications;
  const notificationDeliveryRatePct = notificationTrackedBase > 0
    ? Number((((notificationDeliveredCount + notificationReadCount) / notificationTrackedBase) * 100).toFixed(1))
    : 0;
  const notificationReadRatePct = (notificationDeliveredCount + notificationReadCount) > 0
    ? Number(((notificationReadCount / (notificationDeliveredCount + notificationReadCount)) * 100).toFixed(1))
    : 0;
  const notificationFailureRatePct = notificationTrackedBase > 0
    ? Number(((failedNotifications / notificationTrackedBase) * 100).toFixed(1))
    : 0;
  const monthlyExpenses = Number(monthlyExpenseAgg[0]?.total || 0);
  const monthlyIncome = totalPaid;
  const netPosition = monthlyIncome - monthlyExpenses;
  const topExpenseVendorName = String(topExpenseVendorAgg[0]?.vendorName || '—');
  const topExpenseVendorAmount = Number(topExpenseVendorAgg[0]?.total || 0);
  const openTicketsWithoutInvoice = Number(openCostTickets[0]?.count || 0);
  const buildingCurrency = building?.settings?.currency || 'ILS';
  const periodCurrency =
    periodChargeCurrencies.length === 1 ? String(periodChargeCurrencies[0]) : buildingCurrency;
  const totalOpenBalanceCurrency =
    allOpenChargeCurrencies.length === 1 ? String(allOpenChargeCurrencies[0]) : buildingCurrency;
  const currency = periodCurrency;
  const collectionRateRaw = totalCharged > 0 ? (totalPaid / totalCharged) * 100 : 0;
  const collectionRatePct = Math.max(0, Math.min(100, Number(collectionRateRaw.toFixed(1))));

  const emptyStateHints: EmptyStateHint[] = [];
  if (totalApartments === 0) {
    emptyStateHints.push({
      key: 'no_apartments',
      title: 'עדיין אין דירות פעילות',
      description: 'כדי להתחיל, הוסיפו דירות או בצעו יבוא קובץ דירות.',
      href: '/apartments?import=true',
    });
  }
  if (activeResidents === 0) {
    emptyStateHints.push({
      key: 'no_residents',
      title: 'עדיין אין דיירים פעילים',
      description: 'הוסיפו דייר ראשון כדי לנהל תקשורת וחיובים.',
      href: '/residents',
    });
  }
  if (totalCharged === 0) {
    emptyStateHints.push({
      key: 'no_monthly_charges',
      title: 'אין חיובים לחודש הנבחר',
      description: 'צרו חיובים חודשיים כדי לראות תמונת גבייה מלאה.',
      href: `/billing?tab=generate&period=${period}`,
    });
  }

  const recentActivity: RecentActivityItem[] = recentLogs.map((log) => ({
    id: log._id.toString(),
    actionLabelHe: mapActionToHebrew(log.action as AuditAction),
    actor: log.actorName || 'מערכת',
    timestamp: log.createdAt.toISOString(),
    summary: summarizeMetadata(log.metadata as Record<string, unknown> | undefined),
    href: getEntityHref(log.entityType, log.entityId?.toString()),
  }));

  return {
    period,
    currency,
    scopes: {
      financialSnapshot: 'period',
      totalOpenBalance: 'all_time',
    },
    currencyContext: {
      buildingCurrency,
      periodCurrency,
      totalOpenBalanceCurrency,
      isPeriodCurrencyDerivedFromCharges: periodChargeCurrencies.length === 1,
    },
    kpis: {
      totalApartments,
      activeResidents,
      unpaidApartments,
      unpaidResidents,
      totalOpenBalance: buildingTotals.outstandingBalance,
      totalPaidThisMonth: totalPaid,
      openTickets,
      notificationsSentThisMonth: notificationSentCount,
      notificationsOpenedThisMonth,
      notificationDeliveryRatePct,
      notificationReadRatePct,
      notificationFailureRatePct,
      monthlyIncome,
      monthlyExpenses,
      netPosition,
      topExpenseVendorName,
      topExpenseVendorAmount,
      openTicketsWithoutInvoice,
      pendingApprovalBatches,
      totalOpenBalanceScope: 'all_time',
    },
    financialSnapshot: {
      scope: 'period',
      totalCharged,
      totalPaid,
      remainingBalance,
      collectionRatePct,
      breakdown: {
        paid: paidCount,
        partial: partialCount,
        unpaid: unpaidCount,
        noCharge: noChargeCount,
      },
    },
    attentionRequired: {
      unpaidApartments: { count: unpaidApartments, href: `/billing?tab=monthly&period=${period}` },
      openTickets: { count: openTickets, href: '/tickets?status=open' },
      pendingApprovalBatches: { count: pendingApprovalBatches, href: '/notifications' },
      failedNotifications: { count: failedNotifications, href: '/notifications' },
      openTicketsWithoutInvoice: { count: openTicketsWithoutInvoice, href: '/invoices?missingFile=true' },
      residentsMissingPhone: { count: residentsMissingPhone, href: '/residents' },
      apartmentsWithoutResidents: { count: apartmentsWithoutResidents, href: '/apartments' },
    },
    recentActivity,
    emptyStateHints,
  };
}
