"use server";
import { cookies } from "next/headers";
import { BASE_URL } from "@/lib/constants";

export type ResponseType = "json" | "arraybuffer" | "blob" | "text";

interface FetchOptions extends RequestInit {
  params?: Record<string, any>;
  withAuth?: boolean;
  responseType?: ResponseType;
}

export async function serverFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const {
    params,
    withAuth = true,
    responseType = "json",
    headers: customHeaders,
    ...fetchOptions
  } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((customHeaders as Record<string, string>) || {}),
  };

  if (withAuth) {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      headers["Cookie"] = `auth_token=${token}`;
    }
  }

  let queryString = "";
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.set(key, String(value));
      }
    });
    const str = searchParams.toString();
    if (str) queryString = `?${str}`;
  }

  const fullUrl = `${BASE_URL}${endpoint}${queryString}`;

  const res = await fetch(fullUrl, {
    ...fetchOptions,
    headers,
  });

  // معالجة الأخطاء قبل محاولة قراءة البيانات
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.message || `خطأ في الطلب: ${res.status}`);
  }

  // ارجاع البيانات بناءً على responseType المطلوبة
  if (responseType === "arraybuffer") {
    const buffer = await res.arrayBuffer();
    return buffer as T;
  }

  if (responseType === "blob") {
    const blob = await res.blob();
    return blob as T;
  }

  if (responseType === "text") {
    const text = await res.text();
    return text as T;
  }

  // الافتراضي: JSON
  const data = await res.json().catch(() => ({}));
  return data as T;
}
