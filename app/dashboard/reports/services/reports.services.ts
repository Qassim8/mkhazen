import { serverFetch } from "@/lib/api-client";
import {
  filtersToSearchParams,
  type ReportFilters,
  type ReportData,
} from "@/lib/reports/report-filters";

export async function getReportsData(period: string = "month") {
  const response = await serverFetch<{ data: ReportData }>("/api/reports", {
    params: { period },
  });

  return response.data;
}

export async function exportReportXlsx(filters: ReportFilters) {
  // 1. توحيد نمط الاستجابة مع جلب ArrayBuffer للملفات
  const response = await serverFetch<{ data: number[] }>(
    "/api/reports/export",
    {
      params: Object.fromEntries(filtersToSearchParams(filters)),
      responseType: "arraybuffer", // أو بحسب ما يدعمه api-client لديك
    },
  );

  // 2. ضمان تحويل التواريخ/القيم إلى نصوص صريحة ومنع ظهور undefined
  const fromStr = filters.from ? String(filters.from) : "البداية";
  const toStr = filters.to ? String(filters.to) : "النهاية";

  return {
    fileName: `تقرير-${fromStr}-${toStr}.xlsx`,
    bytes: response.data ?? response, // للتعامل مع النمطين سواء كانت ملفوفة بـ data أم لا
  };
}
