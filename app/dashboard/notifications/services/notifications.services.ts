"use server";

import { serverFetch } from "@/lib/api-client";

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

export async function getNotifications(params: {
  limit: number;
  offset: number;
  filter: "all" | "unread";
}): Promise<NotificationsResponse> {
  return serverFetch<NotificationsResponse>("/api/notifications", {
    method: "GET",
    params,
  });
}

export async function markNotificationAsRead(id: string): Promise<void> {
  await serverFetch("/api/notifications", {
    method: "PATCH",
    body: JSON.stringify({ id }),
  });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  await serverFetch("/api/notifications", {
    method: "PATCH",
    body: JSON.stringify({ markAll: true }),
  });
}

export async function deleteNotification(id: string): Promise<void> {
  await serverFetch("/api/notifications", {
    method: "DELETE",
    params: { id },
  });
}

export async function deleteReadNotifications(): Promise<void> {
  await serverFetch("/api/notifications", {
    method: "DELETE",
    params: { scope: "read" },
  });
}
