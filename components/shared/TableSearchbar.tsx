"use client";

import { useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuSearch } from "react-icons/lu";

type SearchbarProps = {
  placeholder: string;
  searchKey?: string;
};

const TableSearchbar = ({
  placeholder,
  searchKey = "search",
}: SearchbarProps) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = (term: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      params.set("page", "1");

      if (term) {
        params.set(searchKey, term);
      } else {
        params.delete(searchKey);
      }

      replace(`${pathname}?${params.toString()}`);
    }, 1500);
  };

  return (
    <div className="relative grow">
      <LuSearch className="h-4 w-4 text-gray-500 absolute inset-s-3 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        defaultValue={searchParams.get(searchKey)?.toString() || ""}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md md:rounded-lg bg-gray-50 px-6 md:px-8 py-2 text-sm text-gray-700 placeholder-gray-600 border border-gray-300 focus:border-red-500/20 focus:bg-white focus:outline-none focus:ring focus:ring-red-200"
      />
    </div>
  );
};

export default TableSearchbar;
