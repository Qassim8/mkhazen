// src/app/dashboard/employees/services/employees.services.ts
import { serverFetch } from "@/lib/api-client";
import { AdminResetPasswordInput } from "@/lib/validations/auth.schemas";
import {
  CreateEmployeeInput,
  EmployeeQueryParams,
  UpdateEmployeeInput,
} from "@/lib/validations/employee.schemas";

export interface EmployeesResponse {
  data: any[];
  meta: {
    totalCount: number;
    totalPages: number;
    currentPage: number;
    limit: number;
  };
}

export const getEmployees = async (params: EmployeeQueryParams) => {
  return serverFetch<EmployeesResponse>("/api/users", {
    method: "GET",
    params,
    next: { tags: ["employees-list"] },
  });
};

export const creatEmployee = async (data: CreateEmployeeInput) => {
  return serverFetch<{ message: string; data: any }>("/api/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const updateEmployee = async (id: string, data: UpdateEmployeeInput) => {
  const isTailor = data.position === "tailor";

  const payload = {
    ...data,
    isActive: Boolean(data.isActive),
    salary: !isTailor ? Number(data.salary ?? 0) : 0,
    commissionRate: isTailor ? Number(data.commissionRate ?? 0) : 0,
  };

  return serverFetch<{ message: string; data: any }>(`/api/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};

export const deleteEmployee = async (rowId: string | number) => {
  return serverFetch<{ message: string; data: any }>(`/api/users/${rowId}`, {
    method: "DELETE",
  });
};

export const resetEmployeePassword = async (
  id: string,
  data: AdminResetPasswordInput,
) => {
  // استدعاء نقطة النهاية المجهزة مسبقاً للتحديث
  return serverFetch<{ message: string }>(`/api/users/${id}`, {
    method: "PUT", // أو PUT حسب المتبع لديك في API التحديث
    body: JSON.stringify({
      password: data.password,
      resetRequested: false,
    }),
  });
};
