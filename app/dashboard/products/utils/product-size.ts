export interface ProductMeasurement {
  label: string;
  value: string;
}

const MEASUREMENTS_PREFIX = "__product_measurements_v1__:";

export function encodeProductMeasurements(
  measurements: ProductMeasurement[],
): string {
  return `${MEASUREMENTS_PREFIX}${JSON.stringify(measurements)}`;
}

export function decodeProductMeasurements(
  value: unknown,
): ProductMeasurement[] | null {
  if (typeof value !== "string" || !value.startsWith(MEASUREMENTS_PREFIX)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value.slice(MEASUREMENTS_PREFIX.length));
    if (!Array.isArray(parsed)) return null;

    return parsed.flatMap((row): ProductMeasurement[] => {
      if (
        typeof row !== "object" ||
        row === null ||
        !("label" in row) ||
        !("value" in row) ||
        typeof row.label !== "string" ||
        typeof row.value !== "string"
      ) {
        return [];
      }

      return [{ label: row.label, value: row.value }];
    });
  } catch {
    return null;
  }
}

export function formatProductSize(value: unknown): string {
  if (typeof value !== "string" || !value) return "";

  const measurements = decodeProductMeasurements(value);
  if (!measurements) return value;

  return measurements
    .filter((measurement) => measurement.label.trim() && measurement.value.trim())
    .map((measurement) => `${measurement.label.trim()}: ${measurement.value.trim()}`)
    .join("، ");
}

export function isCustomProductSize(value: unknown): boolean {
  return decodeProductMeasurements(value) !== null;
}
