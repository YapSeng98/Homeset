/**
 * Subscription tiers → features. Upgrading a customer changes data, not code.
 * Developer Pro features are listed now so the data model is ready for them.
 */
export type PlanId = 'free' | 'agent_pro' | 'agency' | 'id_studio' | 'developer_pro';
export type OrgType = 'agency' | 'id_firm' | 'developer';

export interface PlanFeatures {
  maxActiveTours: number;
  watermark: boolean;
  videoExport: boolean;
  analytics: boolean;
  boq: boolean;
  stackPlan: boolean;
}

export const PLANS: Record<PlanId, PlanFeatures> = {
  free: { maxActiveTours: 1, watermark: true, videoExport: false, analytics: false, boq: false, stackPlan: false },
  agent_pro: { maxActiveTours: 50, watermark: false, videoExport: true, analytics: true, boq: false, stackPlan: false },
  agency: { maxActiveTours: 500, watermark: false, videoExport: true, analytics: true, boq: false, stackPlan: false },
  id_studio: { maxActiveTours: 200, watermark: false, videoExport: true, analytics: true, boq: true, stackPlan: false },
  developer_pro: { maxActiveTours: 5000, watermark: false, videoExport: true, analytics: true, boq: true, stackPlan: true },
};
