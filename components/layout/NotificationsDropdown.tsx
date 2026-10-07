"use client";

/**
 * قائمة الإشعارات (الجرس في الـ Navbar)
 * • تحميل على صفحات (20 إشعار) + "عرض المزيد" بدل سكرول لا نهائي
 * • تبويب: الكل / غير المقروء
 * • تعليم إشعار أو الكل كمقروء • حذف إشعار • حذف كل المقروء
 * • تحديث تلقائي كل 30 ثانية (يتوقف لما التاب يكون مخفي)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LuBadgeAlert,
  LuBell,
  LuCheckCheck,
  LuClock,
  LuFactory,
  LuKey,
  LuLoaderCircle,
  LuPackageX,
  LuShoppingCart,
  LuTrash2,
  LuX,
} from "react-icons/lu";
import {
  deleteNotification,
  deleteReadNotifications,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type NotificationItem,
  type NotificationsResponse,
} from "@/app/dashboard/notifications/services/notifications.services";

const PAGE_SIZE = 20;
const POLL_MS = 30_000;

const TYPE_META: Record<string, { icon: typeof LuBell; className: string }> = {
  RESET_PASSWORD: { icon: LuKey, className: "bg-amber-50 text-amber-600" },
  LOW_STOCK: { icon: LuBadgeAlert, className: "bg-orange-50 text-orange-600" },
  OUT_OF_STOCK: { icon: LuPackageX, className: "bg-red-50 text-red-600" },
  ORDER_DELAY: { icon: LuClock, className: "bg-purple-50 text-purple-600" },
  PURCHASE_ORDER: { icon: LuShoppingCart, className: "bg-emerald-50 text-emerald-600" },
  TAILORING_UPDATE: { icon: LuFactory, className: "bg-violet-50 text-violet-600" },
};

function timeAgo(value: string) {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return new Date(value).toLocaleDateString("ar-EG");
}

function fetchFirstPage(activeFilter: "all" | "unread") {
  return getNotifications({ limit: PAGE_SIZE, offset: 0, filter: activeFilter });
}

export default function NotificationsDropdown() {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // عدد الصفحات المحمّلة حاليًا — التحديث التلقائي ما يمسحش اللي المستخدم حمّله
  const loadedPagesRef = useRef(1);

  // تطبيق نتيجة الصفحة الأولى على الحالة
  const applyFirstPage = useCallback((data: NotificationsResponse, silent: boolean) => {
    setUnreadCount(data.unreadCount);

    // لو المستخدم حمّل صفحات إضافية، التحديث الصامت يحدّث العدد بس
    if (!silent || loadedPagesRef.current === 1) {
      setItems(data.notifications);
      setHasMore(data.hasMore);
      setNextOffset(data.nextOffset);
      loadedPagesRef.current = 1;
    }
  }, []);

  const loadFirstPage = useCallback(
    async (activeFilter: "all" | "unread", silent = false) => {
      try {
        applyFirstPage(await fetchFirstPage(activeFilter), silent);
      } catch (error) {
        console.error("فشل جلب الإشعارات:", error);
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [applyFirstPage],
  );

  // إعادة تحميل من زرار (بمؤشر تحميل)
  function reload(activeFilter: "all" | "unread") {
    setIsLoading(true);
    void loadFirstPage(activeFilter);
  }

  // تحميل أولي + تحديث دوري.
  // تحديث الحالة بيحصل في .then بعد رجوع الطلب (مش متزامن جوه الـ effect)،
  // ومؤشر التحميل بيتشغل من الحالة الابتدائية أو من زرار تغيير الفلتر.
  useEffect(() => {
    let active = true;

    const refresh = (isFirst: boolean) => {
      const request = isOpen
        ? fetchFirstPage(filter).then((data) => {
            if (active) applyFirstPage(data, !isFirst);
          })
        : getUnreadNotificationCount().then((count) => {
            if (active) setUnreadCount(count);
          });

      void request
        .catch((error) => console.error("فشل جلب الإشعارات:", error))
        .finally(() => {
          if (active && isFirst) setIsLoading(false);
        });
    };

    refresh(true);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(false);
    }, POLL_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [filter, isOpen, applyFirstPage]);

  // إغلاق عند الضغط برا القائمة أو Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function loadMore() {
    setIsLoadingMore(true);
    try {
      const data = await getNotifications({
        limit: PAGE_SIZE,
        offset: nextOffset,
        filter,
      });
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...data.notifications.filter((item) => !seen.has(item.id))];
      });
      setHasMore(data.hasMore);
      setNextOffset(data.nextOffset);
      setUnreadCount(data.unreadCount);
      loadedPagesRef.current += 1;
    } catch (error) {
      console.error("فشل تحميل المزيد:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function markAsRead(item: NotificationItem) {
    if (item.isRead) return;
    setItems((current) => current.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await markNotificationAsRead(item.id);
    } catch {
      void loadFirstPage(filter, true);
    }
  }

  async function handleItemClick(item: NotificationItem) {
    void markAsRead(item);
    if (item.link) {
      setIsOpen(false);
      router.push(item.link);
    }
  }

  async function markAllAsRead() {
    if (unreadCount === 0) return;
    setItems((current) => current.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsAsRead();
      if (filter === "unread") reload("unread");
    } catch {
      reload(filter);
    }
  }

  async function deleteOne(item: NotificationItem) {
    setItems((current) => current.filter((n) => n.id !== item.id));
    if (!item.isRead) setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await deleteNotification(item.id);
    } catch {
      reload(filter);
    }
  }

  async function deleteRead() {
    if (!window.confirm("حذف كل الإشعارات المقروءة؟")) return;
    setItems((current) => current.filter((n) => !n.isRead));
    try {
      await deleteReadNotifications();
      reload(filter);
    } catch {
      reload(filter);
    }
  }

  const hasReadItems = items.some((item) => item.isRead);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          if (!isOpen) setIsLoading(true);
          setIsOpen((open) => !open);
        }}
        aria-label="الإشعارات"
        className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50"
      >
        <LuBell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          dir="rtl"
          className="absolute left-0 z-50 mt-2 flex max-h-[75vh] w-80 flex-col rounded-2xl border border-gray-100 bg-white text-right shadow-xl sm:w-96"
        >
          {/* الرأس */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <h3 className="text-sm font-black text-gray-900">الإشعارات</h3>
              <p className="text-[11px] font-semibold text-gray-400">{unreadCount} غير مقروء</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={markAllAsRead}
                disabled={unreadCount === 0}
                title="تعليم الكل كمقروء"
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 disabled:opacity-30"
              >
                <LuCheckCheck className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={deleteRead}
                disabled={!hasReadItems}
                title="حذف المقروء"
                className="rounded-lg p-2 text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
              >
                <LuTrash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* التبويبات */}
          <div className="flex gap-1 border-b border-gray-100 px-3 py-2">
            {(
              [
                ["all", "الكل"],
                ["unread", "غير المقروء"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  if (value === filter) return;
                  loadedPagesRef.current = 1;
                  setIsLoading(true);
                  setFilter(value);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  filter === value ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* القائمة */}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <LuLoaderCircle className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-xs font-bold text-gray-400">
                {filter === "unread" ? "لا توجد إشعارات غير مقروءة" : "لا توجد إشعارات"}
              </p>
            ) : (
              <ul className="space-y-1">
                {items.map((item) => {
                  const meta = TYPE_META[item.type] ?? { icon: LuBell, className: "bg-blue-50 text-blue-600" };
                  const Icon = meta.icon;
                  return (
                    <li
                      key={item.id}
                      className={`group flex items-start gap-3 rounded-xl p-2.5 transition ${
                        item.isRead ? "hover:bg-gray-50" : "bg-amber-50/50 hover:bg-amber-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleItemClick(item)}
                        className="flex min-w-0 flex-1 items-start gap-3 text-right"
                      >
                        <span className={`mt-0.5 shrink-0 rounded-lg p-2 ${meta.className}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            {!item.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                            <span className={`truncate text-xs ${item.isRead ? "font-bold text-gray-600" : "font-black text-gray-900"}`}>
                              {item.title}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-gray-500">
                            {item.message}
                          </span>
                          <span className="mt-1 block text-[10px] text-gray-400">{timeAgo(item.createdAt)}</span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteOne(item)}
                        title="حذف"
                        className="shrink-0 rounded-md p-1 text-gray-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100"
                      >
                        <LuX className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {hasMore && !isLoading && (
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {isLoadingMore && <LuLoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                عرض المزيد
              </button>
            )}
          </div>

          <p className="border-t border-gray-100 px-4 py-2 text-[10px] text-gray-400">
            الإشعارات المقروءة بتتمسح تلقائيًا بعد 30 يوم
          </p>
        </div>
      )}
    </div>
  );
}
