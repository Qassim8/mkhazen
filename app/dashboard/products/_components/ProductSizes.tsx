"use client";

import { LuPlus, LuRuler, LuTrash2 } from "react-icons/lu";
import {
  decodeProductMeasurements,
  encodeProductMeasurements,
  ProductMeasurement,
} from "../utils/product-size";

interface ProductSizesProps {
  value?: unknown;
  legacyLength?: number | string | null;
  legacyWidth?: number | string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
}

const inputClassName =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium outline-hidden focus:border-(--primary-red) disabled:bg-gray-100";

function getInitialMeasurements(
  value: unknown,
  legacyLength: number | string | null | undefined,
  legacyWidth: number | string | null | undefined,
): ProductMeasurement[] {
  const saved = decodeProductMeasurements(value);
  if (saved) return saved;

  const measurements: ProductMeasurement[] = [];
  if (typeof value === "string" && value.trim()) {
    measurements.push({ label: "المقاس", value: value.trim() });
  }
  if (legacyLength != null) {
    measurements.push({ label: "الطول", value: String(legacyLength) });
  }
  if (legacyWidth != null) {
    measurements.push({ label: "العرض", value: String(legacyWidth) });
  }

  return measurements.length
    ? measurements
    : [
        { label: "الطول", value: "" },
        { label: "الصدر", value: "" },
      ];
}

export default function ProductSizes({
  value,
  legacyLength,
  legacyWidth,
  disabled = false,
  onChange,
}: ProductSizesProps) {
  const measurements = getInitialMeasurements(value, legacyLength, legacyWidth);

  const updateMeasurements = (next: ProductMeasurement[]) => {
    onChange(encodeProductMeasurements(next));
  };

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold text-gray-800">
            <LuRuler className="h-4 w-4 text-(--primary-red)" />
            مقاسات الجلابية
          </h4>
          <p className="mt-1 text-xs text-gray-500">
            أضف اسم كل قياس وقيمته، مثل الطول والصدر.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            updateMeasurements([...measurements, { label: "", value: "" }])
          }
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-(--primary-red) transition hover:bg-red-100 disabled:opacity-50"
        >
          <LuPlus className="h-3.5 w-3.5" />
          إضافة قياس
        </button>
      </div>

      {measurements.length === 0 ? (
        <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
          لم تتم إضافة مقاسات. استخدم زر «إضافة قياس» للبدء.
        </p>
      ) : (
        <div className="space-y-2">
          {measurements.map((measurement, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
            >
              <label className="block text-xs font-semibold text-gray-600">
                اسم القياس
                <input
                  type="text"
                  disabled={disabled}
                  value={measurement.label}
                  onChange={(event) => {
                    const next = measurements.map((row, rowIndex) =>
                      rowIndex === index
                        ? { ...row, label: event.target.value }
                        : row,
                    );
                    updateMeasurements(next);
                  }}
                  placeholder="مثال: الطول"
                  className={`${inputClassName} mt-1`}
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600">
                القيمة
                <input
                  type="number"
                  min="0"
                  step="any"
                  disabled={disabled}
                  value={measurement.value}
                  onChange={(event) => {
                    const next = measurements.map((row, rowIndex) =>
                      rowIndex === index
                        ? { ...row, value: event.target.value }
                        : row,
                    );
                    updateMeasurements(next);
                  }}
                  placeholder="مثال: 1.5"
                  className={`${inputClassName} mt-1`}
                />
              </label>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  updateMeasurements(
                    measurements.filter((_, rowIndex) => rowIndex !== index),
                  )
                }
                aria-label="حذف القياس"
                className="mb-0.5 rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <LuTrash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
