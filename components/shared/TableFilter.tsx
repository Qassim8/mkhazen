"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type filterOption = {
  label: string;
  value: string;
};

type filterProps = {
  label: string;
  paramKey?: string;
  options: filterOption[];
};

const TableFilter = ({ label, paramKey = "filter", options }: filterProps) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  const handleFilterChange = (value: string) => {
    const params = new URLSearchParams(searchParams);

    // إعادة الترقيم للصفحة الأولى عند الفلترة
    params.set("page", "1");

    if (value) {
      params.set(paramKey, value);
    } else {
      params.delete(paramKey);
    }

    replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="relative">
      <select
        value={searchParams.get(paramKey)?.toString() || ""}
        onChange={(e) => handleFilterChange(e.target.value)}
        className="w-full rounded-md md:rounded-lg bg-gray-50 px-3 md:px-6 py-1 md:py-2 text-sm text-gray-700 border border-gray-300 placeholder-gray-600 focus:border-red-500/20 focus:bg-white focus:outline-none focus:ring focus:ring-red-200 cursor-pointer"
      >
        <option value="">{label}</option>
        {options.map(({ label: optionLabel, value }) => (
          <option key={value} value={value}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
};

export default TableFilter;
