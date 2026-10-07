"use server";
import { cookies } from "next/headers";
import { BASE_URL } from "@/lib/constants";

interface FetchOptions extends RequestInit {
  params?: Record<string, any>;
  withAuth?: boolean;
}

export async function serverFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const {
    params,
    withAuth = true,
    headers: customHeaders,
    ...fetchOptions
  } = options;

  const headers: any = {
    "Content-Type": "application/json",
    ...(customHeaders || {}),
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

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || `خطأ في الطلب: ${res.status}`);
  }

  return data as T;
}
