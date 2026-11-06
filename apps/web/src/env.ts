/** Static build (GitHub Pages): no server, so projects, tours and leads live in this browser (see browserApi.ts). */
export const BROWSER_ONLY = import.meta.env.VITE_BACKEND === 'browser';

/** Exposes window.__api / __store / __viewer for the e2e test: on the dev server, or in a build made with VITE_E2E=1. */
export const TEST_HOOKS = import.meta.env.DEV || import.meta.env.VITE_E2E === '1';
