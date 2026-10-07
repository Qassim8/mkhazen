"use client";

/**
 * جدول تقارير بسيط: ترتيب بالضغط على العنوان + صف إجماليات + مناسب للطباعة
 */

import { ReactNode, useMemo, useState } from "react";
import { LuArrowDown, LuArrowUp, LuArrowUpDown } from "react-icons/lu";

export interface ReportColumn<T> {
  key: string;
  header: string;
  /** القيمة المستخدمة في الترتيب */
  value: (row: T) => string | number | null;
  render?: (row: T) => ReactNode;
  align?: "start" | "end";
  total?: ReactNode;
  className?: string;
}

interface Props<T> {
  columns: ReportColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyText?: string;
  showTotals?: boolean;
  defaultSort?: { key: string; direction: "asc" | "desc" };
}

export default function ReportTable<T>({
  columns,
  rows,
  rowKey,
  emptyText = "لا توجد بيانات للفترة والفلاتر المحددة",
  showTotals = false,
  defaultSort,
}: Props<T>) {
  const [sort, setSort] = useState(defaultSort ?? null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column) return rows;

    return [...rows].sort((a, b) => {
      const va = column.value(a);
      const vb = column.value(b);
      if (va === vb) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const result =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "ar");
      return sort.direction === "asc" ? result : -result;
    });
  }, [rows, columns, sort]);

  function toggleSort(key: string) {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
        : { key, direction: "desc" },
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white print:overflow-visible print:rounded-none">
      <table className="w-full border-collapse text-sm print:text-[10px]">
        <thead>
          <tr className="bg-gray-50 text-gray-600 print:bg-gray-100">
            {columns.map((column) => {
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  className={`whitespace-nowrap border-b border-gray-200 px-4 py-3 font-bold print:px-2 print:py-1.5 ${
                    column.align === "end" ? "text-left" : "text-right"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className="inline-flex items-center gap-1 hover:text-gray-900 print:pointer-events-none"
                  >
                    {column.header}
                    <span className="print:hidden">
                      {active ? (
                        sort?.direction === "asc" ? (
                          <LuArrowUp className="h-3 w-3" />
                        ) : (
                          <LuArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <LuArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100">
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-sm font-semibold text-gray-400">
                {emptyText}
              </td>
            </tr>
          ) : (
            sortedRows.map((row) => (
              <tr key={rowKey(row)} className="break-inside-avoid hover:bg-gray-50/60">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`whitespace-nowrap px-4 py-2.5 print:px-2 print:py-1 ${
                      column.align === "end" ? "text-left" : "text-right"
                    } ${column.className ?? ""}`}
                    dir={column.align === "end" ? "ltr" : undefined}
                  >
                    {column.render ? column.render(row) : column.value(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>

        {showTotals && sortedRows.length > 0 && (
          <tfoot>
            <tr className="bg-gray-100 font-black text-gray-900">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`whitespace-nowrap border-t-2 border-gray-300 px-4 py-3 print:px-2 print:py-1.5 ${
                    column.align === "end" ? "text-left" : "text-right"
                  }`}
                  dir={column.align === "end" ? "ltr" : undefined}
                >
                  {column.total ?? ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
