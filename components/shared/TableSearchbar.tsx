"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuSearch } from "react-icons/lu";
import CameraBarcodeScanner from "@/components/shared/CameraBarcodeScanner";

interface SearchbarProps {
  placeholder: string;
  searchKey?: string;
  /** زر مسح الباركود بالكاميرا */
  withScanner?: boolean;
}

const TableSearchbar = ({
  placeholder,
  searchKey = "search",
  withScanner = false,
}: SearchbarProps) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [value, setValue] = useState(searchParams.get(searchKey) ?? "");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (term: string, immediate = false) => {
    setValue(term);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const apply = () => {
      const params = new URLSearchParams(searchParams.toString());

      params.set("page", "1");

      const trimmedTerm = term.trim();

      if (trimmedTerm) {
        params.set(searchKey, trimmedTerm);
      } else {
        params.delete(searchKey);
      }

      router.replace(`${pathname}?${params.toString()}`);
    };

    if (immediate) apply();
    else timerRef.current = setTimeout(apply, 400);
  };

  const input = (
    <div className="relative grow">
      <LuSearch className="absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />

      <input
        type="search"
        value={value}
        onChange={(event) => handleSearch(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-300 bg-gray-50 px-6 py-2 text-sm text-gray-700 placeholder-gray-600 outline-none transition focus:border-red-500/20 focus:bg-white focus:ring focus:ring-red-200 md:rounded-lg md:px-8"
      />
    </div>
  );

  if (!withScanner) return input;

  return (
    <div className="flex grow items-center gap-2">
      {input}
      <CameraBarcodeScanner onDetected={(code) => handleSearch(code, true)} />
    </div>
  );
};

export default TableSearchbar;
