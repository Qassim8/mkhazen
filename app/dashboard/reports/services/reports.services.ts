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
  const bytes = await serverFetch<number[]>("/api/reports/export", {
    params: Object.fromEntries(filtersToSearchParams(filters)),
    responseType: "bytes",
  });

  return {
    fileName: `تقرير-${filters.from}-${filters.to}.xlsx`,
    bytes,
  };
}
