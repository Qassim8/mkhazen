"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type filterOption = {
  label: string;
  value: string;
};

interface TableFilterProps {
  label: string;
  paramKey?: string;
  options: filterOption[];
}

const TableFilter = ({
  label,
  paramKey = "filter",
  options,
}: TableFilterProps) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const currentValue = searchParams.get(paramKey) ?? "";

  const handleFilterChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    // أي تغيير في الفلتر يبدأ من الصفحة الأولى
    params.set("page", "1");

    if (value) {
      params.set(paramKey, value);
    } else {
      params.delete(paramKey);
    }

    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="relative">
      <select
        value={currentValue}
        onChange={(event) => handleFilterChange(event.target.value)}
        className="cursor-pointer rounded-md border border-gray-300 bg-gray-50 px-3 py-1 text-sm text-gray-700 placeholder-gray-600 outline-none transition focus:border-red-500/20 focus:bg-white focus:ring focus:ring-red-200 md:rounded-lg md:px-6 md:py-2"
      >
        <option value="">{label}</option>

        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default TableFilter;
