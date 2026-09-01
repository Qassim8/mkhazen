"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LuBell, LuKey, LuClock, LuBadgeAlert, LuShoppingCart } from "react-icons/lu";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: "RESET_PASSWORD" | "LOW_STOCK" | "ORDER_DELAY" | "PURCHASE_ORDER" | "SYSTEM";
  link: string;
  is_read: boolean;
  created_out: string;
}

export default function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (e) {
      console.error("فشل جلب الإشعارات:", e);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      if (isMounted) {
        await fetchNotifications();
      }
    };

    loadInitialData();

    const interval = setInterval(() => {
      fetchNotifications();
    }, 20000);

    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      isMounted = false;
      clearInterval(interval);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [fetchNotifications]);

  const handleNotificationClick = async (item: NotificationItem) => {
    // 1️⃣ تحديث الحالة المحلية فوراً (Optimistic UI Update)
    if (!item.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    // 2️⃣ إغلاق القائمة والتوجيه للرابط فوراً بدون انتظار الشبكة
    setIsOpen(false);
    if (item.link) {
      router.push(item.link);
    }

    // 3️⃣ إرسال التحديث للسيرفر في الخلفية
    if (!item.is_read) {
      try {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id }),
        });
      } catch (error) {
        console.error("فشل تحديث حالة الإشعار بالسيرفر:", error);
      }
    }
  };

  // دالة تعليم جميع الإشعارات كمقروءة
  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;

    // 1️⃣ تحديث متفائل فوري للواجهة local state
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    // 2️⃣ إرسال الطلب للسيرفر
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
    } catch (error) {
      console.error("فشل تحديث الإشعارات كمقروءة:", error);
      // إرجاع الحالة السابقة في حال فشل الاتصال بالشبكة
      fetchNotifications();
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "RESET_PASSWORD":
        return <LuKey className="w-4 h-4 text-amber-600" />;
      case "LOW_STOCK":
        return <LuBadgeAlert className="w-4 h-4 text-red-600" />;
      case "PURCHASE_ORDER":
        return <LuShoppingCart className="w-4 h-4 text-emerald-600" />;
      default:
        return <LuBell className="w-4 h-4 text-blue-600" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition cursor-pointer"
      >
        <LuBell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white shadow-sm animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-gray-100 shadow-xl p-2 z-50 dir-rtl text-right">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <h3 className="text-xs font-black text-gray-900">
              الإشعارات والتنبيهات
            </h3>
            <span className="text-[10px] font-bold text-gray-400">
              {unreadCount} غير مقروء
            </span>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              className="text-[11px] font-bold text-amber-600 hover:text-amber-700 hover:underline transition cursor-pointer"
            >
              تحديد الكل كمقروء
            </button>
          )}

          <div className="max-h-80 overflow-y-auto space-y-1 py-1">
            {notifications.length === 0 ? (
              <p className="text-center py-6 text-xs text-gray-400 font-bold">
                لا توجد إشعارات حالياً
              </p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`flex items-start gap-3 p-2.5 rounded-xl transition cursor-pointer ${
                    n.is_read
                      ? "bg-white hover:bg-gray-50 opacity-70"
                      : "bg-amber-50/40 hover:bg-amber-50"
                  }`}
                >
                  <div className="p-2 rounded-lg bg-gray-100 shrink-0 mt-0.5">
                    {getIcon(n.type)}
                  </div>
                  <div className="grow space-y-0.5">
                    <p className="text-xs font-black text-gray-900">
                      {n.title}
                    </p>
                    <p className="text-[11px] font-semibold text-gray-600 leading-snug">
                      {n.message}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
