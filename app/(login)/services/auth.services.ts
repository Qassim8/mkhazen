// src/services/auth.services.ts
import { LoginInput } from "@/lib/validations/auth.schemas";
import { serverFetch } from "@/lib/api-client";

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
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

  const result = (await response.json().catch(() => null)) as LoginResponse | null;

  if (!response.ok) {
    throw new Error(result?.message || `فشل تسجيل الدخول (${response.status})`);
  }

  if (!result) {
    throw new Error("تعذر قراءة استجابة تسجيل الدخول.");
  }

  return result;
};

export const logout = async () => {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });

  const result = (await response.json().catch(() => null)) as
    | { message?: string }
    | null;

  if (!response.ok) {
    throw new Error(result?.message || `فشل تسجيل الخروج (${response.status})`);
  }

  if (!result) {
    throw new Error("تعذر قراءة استجابة تسجيل الخروج.");
  }

  return { message: result.message ?? "تم تسجيل الخروج بنجاح" };
};

export const getMe = async () => {
  return serverFetch<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    shift: string | null;
    isPasswordChanged: boolean;
  }>("/api/auth/me", {
    method: "GET",
  });
};

export const updateProfile = async (payload: {
  name: string;
  email: string;
  phone: string;
}) => {
  return serverFetch<{
    message: string;
    user: { name: string; email: string; phone: string | null };
  }>(
    "/api/auth/me/update",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
};

// تغيير كلمة المرور
export const changePassword = async (payload: {
  currentPassword: string;
  newPassword: string;
}) => {
  const response = await fetch("/api/auth/me/change-password", {
    method: "PUT",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = (await response.json().catch(() => null)) as
    | { message?: string; role?: string }
    | null;

  if (!response.ok) {
    throw new Error(result?.message || `فشل تغيير كلمة المرور (${response.status})`);
  }

  if (!result) {
    throw new Error("تعذر قراءة استجابة تغيير كلمة المرور.");
  }

  return {
    message: result.message ?? "تم تغيير كلمة المرور بنجاح",
    role: result.role,
  };
};

export const requestPasswordReset = async (identifier: string) => {
  return serverFetch<{ message: string }>("/api/auth/request-reset", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
};
