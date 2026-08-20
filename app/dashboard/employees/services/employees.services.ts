import { BASE_URL } from "@/lib/constants";
import { EmployeeQueryParams } from "@/lib/validations/employee.schemas";

export const getEmployees = async (params: EmployeeQueryParams) => {
  try {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set("search", params.search);
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.position) searchParams.set("position", params.position);
    if (params.shift) searchParams.set("shift", params.shift);
    if (params.status) searchParams.set("status", params.status);

    const res = await fetch(
      `${BASE_URL}/api/users?${searchParams.toString()}`,
      {
        next: { tags: ["employees-list"] },
      },
    );

    if (!res.ok) throw new Error("فشل في جلب البيانات");
    return res.json();
  } catch (err) {
    console.log(err);
  }
};

export const deleteEmployee = async (rowId: string | number) => {
  const res = await fetch(`${BASE_URL}/api/users/${rowId}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "فشل في حذف الموظف");
  }

  return res.json();
};
