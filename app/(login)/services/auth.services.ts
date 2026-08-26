// src/services/auth.services.ts
import { LoginInput } from "@/lib/validations/auth.schemas";

export interface LoginResponse {
  message: string;
  user?: {
    id: string;
    name: string;
    email: string;
    position: string;
  };
}

export const login = async (
  credentials: LoginInput,
): Promise<LoginResponse> => {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "حدث خطأ أثناء تسجيل الدخول");
  }

  return data;
};

export const logout = async () => {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "حدث خطأ أثناء تسجيل الخروج");
  }

  return data;
};

export const getMe = async () => {
  const res = await fetch("/api/auth/me", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "فشل جلب البيانات");
  return data;
};

export const updateProfile = async (payload: {
  name: string;
  email: string;
  phone: string;
}) => {
  const res = await fetch("/api/auth/me/update", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "فشل تحديث البيانات");
  return data;
};

// تغيير كلمة المرور
export const changePassword = async (payload: {
  currentPassword: string;
  newPassword: string;
}) => {
  const res = await fetch("/api/auth/me/change-password", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "فشل تغيير كلمة المرور");
  return data;
};

export const requestPasswordReset = async (identifier: string) => {
  const res = await fetch("/api/auth/request-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "فشل إرسال الطلب");
  return data;
};
