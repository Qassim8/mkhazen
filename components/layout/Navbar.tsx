"use client";

import { useState } from "react";
import Searchbar from "./Searchbar";
import Link from "next/link";
import PageName from "../shared/PageName";
import { useTable } from "@/store/useTable";
import { LuMenu } from "react-icons/lu";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const sidebarToggler = useTable((state) => state.sidebarToggler);

  return (
    <nav className="sticky top-0 z-10 w-full bg-white/60 backdrop-blur-xl border-b border-gray-200 py-3">
      <div className="container flex justify-between items-center">
        <div className="grow font-medium text-sm hidden md:block">
          <PageName />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => sidebarToggler(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm md:hidden"
            aria-label="Open sidebar"
          >
            <LuMenu className="h-5 w-5" />
          </button>
          <Searchbar />
          <div
            className="flex items-center gap-2 p-2 transition hover:bg-gray-100 rounded-full cursor-pointer"
            onClick={() => setOpen(!open)}
          >
            <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
            <div className="flex flex-col">
              <h2 className="text-xs font-bold">محمد عماد</h2>
              <span className="text-gray-500 text-[10px]">الادمن</span>
            </div>
          </div>
        </div>
      </div>
      {open && (
        <div className="bg-white rounded-lg border border-gray-200 absolute top-16 inset-e-5 w-44 shadow-lg">
          <div className="flex flex-col p-1 text-sm">
            <h2 className="font-semibold p-2 mb-1 border-b border-b-gray-200">
              حسابي
            </h2>
            <Link
              href="/settings"
              className="hover:text-(--primary-red) hover:bg-(--primary-red)/10 p-2 rounded-lg"
            >
              الملف الشخصي
            </Link>
            <Link
              href="/settings"
              className="hover:text-(--primary-red) hover:bg-(--primary-red)/10 p-2 rounded-lg"
            >
              الاعدادات
            </Link>
            <button className="mt-1 border-t border-t-gray-200 hover:text-(--primary-red) hover:bg-(--primary-red)/10 p-2 rounded-lg">
              تسجيل الخروج
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
