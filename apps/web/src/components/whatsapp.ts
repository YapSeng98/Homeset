import { REGIONS, type Region } from '@homeset/core';

/** Normalises a local or international phone number into wa.me format (digits, with country code). */
export function waNumber(phone: string, region: Region): string {
  let digits = phone.replace(/\D/g, '');
  const cc = REGIONS[region].phoneCountryCode;
  if (phone.trim().startsWith('+')) return digits;
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!digits.startsWith(cc) || digits.length <= 8) digits = cc + digits;
  return digits;
}

export const waChatUrl = (phone: string, region: Region, text: string) => `https://wa.me/${waNumber(phone, region)}?text=${encodeURIComponent(text)}`;
export const waShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
