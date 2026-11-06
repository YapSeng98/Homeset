import type { Region } from './schema';

export type Currency = 'MYR' | 'SGD';
export type Lang = 'en' | 'ms' | 'zh';

export interface DisclosureField {
  key: string;
  label: string;
  example: string;
  required: boolean;
}

export interface RegionConfig {
  code: Region;
  name: string;
  currency: Currency;
  currencySymbol: string;
  locale: string;
  phoneCountryCode: string;
  tax: { name: string; rate: number };
  languages: Lang[];
  /** Registration details an agent must show on listings. */
  agentDisclosure: DisclosureField[];
}

/**
 * Per-country settings. Tax rates and disclosure rules change over time:
 * keep them here (later: in the admin panel), never hard-coded in features.
 */
export const REGIONS: Record<Region, RegionConfig> = {
  MY: {
    code: 'MY',
    name: 'Malaysia',
    currency: 'MYR',
    currencySymbol: 'RM',
    locale: 'en-MY',
    phoneCountryCode: '60',
    tax: { name: 'SST', rate: 0.08 },
    languages: ['en', 'ms', 'zh'],
    agentDisclosure: [
      { key: 'agentRegNo', label: 'REN / REA / PEA No.', example: 'REN 12345', required: true },
      { key: 'agencyName', label: 'Agency', example: 'ABC Realty Sdn Bhd', required: true },
      { key: 'agencyRegNo', label: 'Firm Reg. No.', example: 'E (1) 1234', required: true },
    ],
  },
  SG: {
    code: 'SG',
    name: 'Singapore',
    currency: 'SGD',
    currencySymbol: 'S$',
    locale: 'en-SG',
    phoneCountryCode: '65',
    tax: { name: 'GST', rate: 0.09 },
    languages: ['en', 'zh', 'ms'],
    agentDisclosure: [
      { key: 'agentRegNo', label: 'CEA Reg. No.', example: 'R123456A', required: true },
      { key: 'agencyName', label: 'Agency', example: 'ABC Realty Pte Ltd', required: true },
      { key: 'agencyRegNo', label: 'Agency Licence No.', example: 'L3001234A', required: true },
    ],
  },
};

export function formatMoney(amount: number, region: Region): string {
  const cfg = REGIONS[region];
  return `${cfg.currencySymbol} ${amount.toLocaleString(cfg.locale, { maximumFractionDigits: 0 })}`;
}
