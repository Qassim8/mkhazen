/** نص الخطأ من أي قيمة اتمسكت في catch (اللي نوعها unknown) */
export function errorMessage(error: unknown, fallback = "حدث خطأ غير متوقع"): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}
