import { Types } from 'mongoose';
import TicketSlaPolicy from '@/models/TicketSlaPolicy';
import { TicketPriority } from '@/lib/types';

export interface EffectiveSlaPolicy {
  responseTargetsMinutes: Record<TicketPriority, number>;
  resolutionTargetsMinutes: Record<TicketPriority, number>;
  gracePeriodMinutes: number;
  businessHoursOnly: boolean;
  version: number;
}

const DEFAULT_POLICY: EffectiveSlaPolicy = {
  responseTargetsMinutes: {
    low: 24 * 60,
    medium: 8 * 60,
    high: 4 * 60,
    urgent: 60,
  },
  resolutionTargetsMinutes: {
    low: 7 * 24 * 60,
    medium: 3 * 24 * 60,
    high: 24 * 60,
    urgent: 6 * 60,
  },
  gracePeriodMinutes: 0,
  businessHoursOnly: false,
  version: 1,
};

export async function getEffectiveSlaPolicy(buildingId: string): Promise<EffectiveSlaPolicy> {
  const policy = await TicketSlaPolicy.findOne({ buildingId: new Types.ObjectId(buildingId) }).lean();
  if (!policy) return DEFAULT_POLICY;

  return {
    responseTargetsMinutes: {
      low: policy.responseTargetsMinutes.low,
      medium: policy.responseTargetsMinutes.medium,
      high: policy.responseTargetsMinutes.high,
      urgent: policy.responseTargetsMinutes.urgent,
    },
    resolutionTargetsMinutes: {
      low: policy.resolutionTargetsMinutes.low,
      medium: policy.resolutionTargetsMinutes.medium,
      high: policy.resolutionTargetsMinutes.high,
      urgent: policy.resolutionTargetsMinutes.urgent,
    },
    gracePeriodMinutes: policy.gracePeriodMinutes,
    businessHoursOnly: policy.businessHoursOnly,
    version: policy.version,
  };
}

export function calculateSlaDueDates(params: {
  createdAt: Date;
  priority: TicketPriority;
  policy: EffectiveSlaPolicy;
}) {
  const { createdAt, priority, policy } = params;
  const responseDueAt = new Date(createdAt.getTime() + policy.responseTargetsMinutes[priority] * 60 * 1000);
  const resolutionDueAt = new Date(createdAt.getTime() + policy.resolutionTargetsMinutes[priority] * 60 * 1000);
  return { responseDueAt, resolutionDueAt };
}

export function evaluateSlaFlags(params: {
  now: Date;
  responseDueAt?: Date;
  resolutionDueAt?: Date;
  firstAssignedAt?: Date;
  resolvedAt?: Date;
}) {
  const { now, responseDueAt, resolutionDueAt, firstAssignedAt, resolvedAt } = params;

  const responseMet =
    responseDueAt && firstAssignedAt ? firstAssignedAt.getTime() <= responseDueAt.getTime() : undefined;
  const resolutionMet =
    resolutionDueAt && resolvedAt ? resolvedAt.getTime() <= resolutionDueAt.getTime() : undefined;

  let slaBreached = false;
  let slaBreachReason: string | undefined;

  if (responseDueAt && !firstAssignedAt && now.getTime() > responseDueAt.getTime()) {
    slaBreached = true;
    slaBreachReason = 'response_overdue';
  } else if (resolutionDueAt && !resolvedAt && now.getTime() > resolutionDueAt.getTime()) {
    slaBreached = true;
    slaBreachReason = 'resolution_overdue';
  } else if (responseMet === false) {
    slaBreached = true;
    slaBreachReason = 'response_missed';
  } else if (resolutionMet === false) {
    slaBreached = true;
    slaBreachReason = 'resolution_missed';
  }

  return { responseMet, resolutionMet, slaBreached, slaBreachReason };
}
