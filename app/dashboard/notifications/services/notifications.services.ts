export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
  hasMore: boolean;
  nextOffset: number;
}

import { apiFetch, type FetchOptions } from "@/lib/api-client";

/**
 * الإشعارات بتتسحب كل شوية في الخلفية → الهيدر ده بيقول للـ proxy إن الطلب
 * مش نشاط من المستخدم، فما يجددش الجلسة (عشان مهلة الخمول تفضل حقيقية).
 * لو الجلسة انتهت، apiFetch بيحوّل لصفحة "انتهت جلستك" تلقائيًا.
 */
function request<T>(
  params: Record<string, string> | undefined,
  init: Omit<FetchOptions, "params"> = {},
  background = false,
): Promise<T> {
  return apiFetch<T>("/api/notifications", {
    ...init,
    params,
    headers: background ? { "x-mkhazen-background": "1" } : undefined,
  });
}

export async function getNotifications(params: {
  limit: number;
  offset: number;
  filter: "all" | "unread";
}): Promise<NotificationsResponse> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
    filter: params.filter,
  });
  return request<NotificationsResponse>(Object.fromEntries(query), {}, true);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const result = await request<{ unreadCount: number }>({ countOnly: "true" }, {}, true);
  return result.unreadCount;
}

export async function markNotificationAsRead(id: string): Promise<void> {
  await request(undefined, {
    method: "PATCH",
    body: JSON.stringify({ id }),
  });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  await request(undefined, {
    method: "PATCH",
    body: JSON.stringify({ markAll: true }),
  });
}

export async function deleteNotification(id: string): Promise<void> {
  const query = new URLSearchParams({ id });
  await request(Object.fromEntries(query), { method: "DELETE" });
}

export async function deleteReadNotifications(): Promise<void> {
  await request({ scope: "read" }, { method: "DELETE" });
}
