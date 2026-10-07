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
  return serverFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
};

export const logout = async () => {
  return serverFetch<{ message: string }>("/api/auth/logout", {
    method: "POST",
  });
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
  return serverFetch<{ message: string; role?: string }>(
    "/api/auth/me/change-password",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
};

export const requestPasswordReset = async (identifier: string) => {
  return serverFetch<{ message: string }>("/api/auth/request-reset", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
};
