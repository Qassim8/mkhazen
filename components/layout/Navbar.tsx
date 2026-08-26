"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  LuMenu,
  LuUser,
  LuLogOut,
  LuChevronDown,
  LuLoader,
} from "react-icons/lu";

import Searchbar from "./Searchbar";
import { getMe, logout } from "@/app/(login)/services/auth.services";
import PageName from "../shared/PageName";
import { useRouter } from "next/navigation";
import NotificationDropdown from "./NotificationsDropdown";

interface UserProfile {
  name: string;
  email: string;
  role: string;
}

export default function Navbar({
  sidebarToggler,
}: {
  sidebarToggler: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchUserData = () => {
    getMe()
      .then((res) => setUser(res))
      .catch(() => {});
  };

  useEffect(() => {
    // جلب البيانات أول مرة
    fetchUserData();

    // 2. الاستماع لحدث التحديث عند تغيير الاسم من الإعدادات
    const handleUserUpdate = () => {
      fetchUserData();
    };

    window.addEventListener("user-updated", handleUserUpdate);

    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      const res = await logout();
      toast.success(res.message || "تم تسجيل الخروج بنجاح");
      router.replace("/");
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ أثناء تسجيل الخروج");
      setIsLoggingOut(false);
    }
  };

  return (
    <nav className="sticky top-0 z-20 w-full bg-white/70 backdrop-blur-xl border-b border-gray-100 py-2.5 px-4">
      <div className="container mx-auto flex justify-between items-center">
        <div className="grow font-bold text-sm hidden md:block text-gray-800">
          <PageName />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => sidebarToggler(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 md:hidden"
          >
            <LuMenu className="h-5 w-5" />
          </button>

          <Searchbar />

          {user?.role === "admin" && <NotificationDropdown />}

          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="flex items-center gap-2.5 p-1.5 pl-3 transition hover:bg-gray-100/80 rounded-full cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-black">
                {user?.name ? user.name.charAt(0) : "U"}
              </div>
              <div className="flex-col text-right hidden sm:flex">
                <h2 className="text-xs font-extrabold text-gray-900 leading-tight">
                  {user?.name || "جاري التحميل..."}
                </h2>
                <span className="text-[10px] font-bold text-gray-400">
                  {user?.role === "admin"
                    ? "المدير"
                    : user?.role === "cashier"
                      ? "كاشير"
                      : "خياط"}
                </span>
              </div>
              <LuChevronDown
                className={`h-4 w-4 text-gray-400 transition ${open ? "rotate-180" : ""}`}
              />
            </button>

            {open && (
              <div className="absolute left-0 mt-2 w-52 bg-white rounded-2xl border border-gray-100 shadow-lg p-1.5 z-50">
                <div className="px-3 py-2 border-b border-gray-100 mb-1">
                  <p className="text-xs font-black text-gray-900">
                    {user?.name}
                  </p>
                  <p className="text-[10px] font-semibold text-gray-400 truncate">
                    {user?.email}
                  </p>
                </div>

                <div className="space-y-0.5 text-xs font-bold text-gray-600">
                  <Link
                    href="/dashboard/settings"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-gray-50 text-gray-700"
                  >
                    <LuUser className="h-4 w-4" />
                    <span>الملف الشخصي</span>
                  </Link>

                  <div className="pt-1 mt-1 border-t border-gray-100">
                    <button
                      type="button"
                      disabled={isLoggingOut}
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-600 hover:bg-red-50 text-xs font-bold"
                    >
                      {isLoggingOut ? (
                        <LuLoader className="h-4 w-4 animate-spin" />
                      ) : (
                        <LuLogOut className="h-4 w-4" />
                      )}
                      <span>
                        {isLoggingOut ? "جاري الخروج..." : "تسجيل الخروج"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
