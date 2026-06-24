export type AutoBillingMode = 'preview' | 'manual' | 'cron';

export type AutoBillingSkipReason =
  | 'inactive_apartment'
  | 'charge_already_exists'
  | 'missing_billing_amount'
  | 'apartment_excluded';

export interface AutoBillingApartmentResult {
  apartmentId: string;
  apartmentNumber: string;
  floor?: number;
  status: string;
  amount?: number;
  reason?: AutoBillingSkipReason;
}

export interface AutoBillingPreviewResult {
  period: string;
  currency: string;
  dueDate: string;
  eligibleCount: number;
  skippedCount: number;
  totalAmount: number;
  eligibleApartments: AutoBillingApartmentResult[];
  skippedApartments: AutoBillingApartmentResult[];
}

export interface AutoBillingRunResult extends AutoBillingPreviewResult {
  mode: AutoBillingMode;
  approvalRequired: boolean;
  createdCount: number;
  skippedExistingCount: number;
  createdChargeIds: string[];
}
