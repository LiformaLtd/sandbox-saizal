// LOCAL DEV ONLY: the hair grouping, colours and ethnicity rules now live in the Experience Studio package
// (packages/experience-studio/src/lib/hairStyles.ts, 2026-10-04) so the character page and the Experience Studio's character
// panel share one hair picker. This file keeps the app's existing imports working.
export * from '../../../packages/experience-studio/src/lib/hairStyles';
