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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const result = (await response.json().catch(() => null)) as
    | (T & { message?: string })
    | null;

  if (!response.ok) {
    throw new Error(result?.message || `فشل طلب الإشعارات (${response.status})`);
  }
  if (!result) throw new Error("تعذر قراءة استجابة الإشعارات.");
  return result;
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
  return request<NotificationsResponse>(`/api/notifications?${query}`);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const result = await request<{ unreadCount: number }>(
    "/api/notifications?countOnly=true",
  );
  return result.unreadCount;
}

export async function markNotificationAsRead(id: string): Promise<void> {
  await request("/api/notifications", {
    method: "PATCH",
    body: JSON.stringify({ id }),
  });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  await request("/api/notifications", {
    method: "PATCH",
    body: JSON.stringify({ markAll: true }),
  });
}

export async function deleteNotification(id: string): Promise<void> {
  const query = new URLSearchParams({ id });
  await request(`/api/notifications?${query}`, { method: "DELETE" });
}

export async function deleteReadNotifications(): Promise<void> {
  await request("/api/notifications?scope=read", { method: "DELETE" });
}
