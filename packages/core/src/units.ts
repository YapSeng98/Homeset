export const MM_PER_FOOT = 304.8;
export const SQMM_PER_SQFT = MM_PER_FOOT * MM_PER_FOOT;

export function feetInches(mm: number): string {
  const totalInches = Math.round(mm / 25.4);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}' ${inches}"`;
}

/** e.g. "3,600 mm · 11' 10"" */
export function formatLength(mm: number): string {
  return `${Math.round(mm).toLocaleString('en')} mm · ${feetInches(mm)}`;
}

export const sqft = (mm2: number): number => mm2 / SQMM_PER_SQFT;
export const sqm = (mm2: number): number => mm2 / 1_000_000;

/** Malaysian and Singaporean listings quote sq ft first. e.g. "215 sq ft (20.0 m²)" */
export function formatArea(mm2: number): string {
  return `${Math.round(sqft(mm2)).toLocaleString('en')} sq ft (${sqm(mm2).toFixed(1)} m²)`;
}
