"use client";

import Table from "@/components/shared/Table";
import { Employee } from "@/types/types";
import { createColumnHelper } from "@tanstack/react-table";
import { LuEye, LuKeyRound, LuSquarePen, LuTrash2 } from "react-icons/lu";
import { deleteEmployee } from "../services/employees.services";
import UpdateModalContent from "./UpdateModalContent";
import EmployeeViewContent from "./EmployeeDetails";
import { useModalStore } from "@/store/useModalStore";
import DeleteConfirmationModal from "@/components/ui/DeleteConfirmationModal";
import ResetPasswordModalContent from "@/components/ui/ResetPasswordModal";

const columnHelper = createColumnHelper<Employee>();

interface Props {
  initialData: Employee[];
}

const EmployeesTable = ({ initialData }: Props) => {
  const openModal = useModalStore((state) => state.openModal);

  const columns = [
    columnHelper.accessor("name", {
      header: "الموظف",
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex flex-col max-w-45">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-900 truncate">
                {info.getValue()}
              </span>

              {row.resetRequested && (
                <span
                  title="طلب الموظف إعادة تعيين كلمة المرور"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-black bg-amber-100 text-amber-800 rounded-md border border-amber-300 animate-pulse shrink-0"
                >
                  <LuKeyRound className="h-3 w-3 text-amber-600" />
                  طلب تعيين
                </span>
              )}
            </div>

            <span className="text-xs text-gray-500 truncate">
              {row.position === "system_manager"
                ? "مدير"
                : row.position === "tailor"
                  ? "خياط"
                  : row.position === "cashier"
                    ? "كاشير"
                    : ""}
            </span>
          </div>
        );
      },
    }),

    columnHelper.accessor("shift", {
      header: "الدوام",
      cell: (info) => (
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <span>
            {info.getValue() === "morning"
              ? "صباحي"
              : info.getValue() === "night"
                ? "مسائي"
                : "دوام كامل / مزدوج"}
          </span>
        </div>
      ),
    }),

    columnHelper.accessor("salary", {
      header: "الراتب / العمولة",
      cell: (info) => {
        const row = info.row.original;
        const isTailor = row.position === "tailor";

        if (isTailor) {
          return (
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <span>{row.commissionRate ?? 0}% (عمولة)</span>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-1.5 text-sm text-gray-700 font-medium">
            <span>
              {info.getValue() ? `${info.getValue()} ريال` : "غير محدد"}
            </span>
          </div>
        );
      },
    }),

    columnHelper.accessor("isActive", {
      header: "الحالة",
      cell: (info) => {
        const status = info.getValue();
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              status
                ? "bg-emerald-100/50 text-emerald-800"
                : "bg-rose-100/50 text-rose-800"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
            {status ? "نشط" : "غير نشط"}
          </span>
        );
      },
    }),

    columnHelper.accessor("email", {
      header: "الايميل",
      cell: (info) => (
        <div
          className="flex items-center gap-1 text-sm text-gray-600 max-w-40"
          title={info.getValue()}
        >
          <span className="truncate">{info.getValue()}</span>
        </div>
      ),
    }),

    columnHelper.display({
      id: "actions",
      cell: ({ row }) => {
        const isResetRequested = row.original.resetRequested;
        return (
          <div className="flex items-center justify-center gap-2">
            {isResetRequested && (
              <button
                type="button"
                aria-label="إعادة تعيين كلمة المرور"
                title="إعادة تعيين كلمة المرور"
                className={`rounded-lg p-1.5 transition-colors text-amber-600 hover:bg-gray-100`}
                onClick={() =>
                  openModal("UPDATE", {
                    title: `تعيين كلمة مرور - ${row.original.name}`,
                    content: (
                      <ResetPasswordModalContent
                        employeeId={row.original.id}
                        employeeName={row.original.name}
                      />
                    ),
                  })
                }
              >
                <LuKeyRound className="h-4.5 w-4.5" />
              </button>
            )}
            <button
              type="button"
              aria-label="عرض الموظف"
              className="rounded-lg p-1 text-gray-600 transition-colors hover:bg-gray-100"
              onClick={() =>
                openModal("VIEW", {
                  title: "تفاصيل الموظف",
                  content: <EmployeeViewContent initialData={row.original} />,
                })
              }
            >
              <LuEye className="h-5 w-5" />
            </button>
            {/* تعديل الموظف */}
            <button
              type="button"
              aria-label="تعديل الموظف"
              className="rounded-lg p-1 text-blue-500 transition-colors hover:bg-gray-100"
              onClick={() =>
                openModal("UPDATE", {
                  title: "تعديل بيانات الموظف",
                  content: <UpdateModalContent initialData={row.original} />,
                })
              }
            >
              <LuSquarePen className="h-5 w-5" />
            </button>
            {/* حذف الموظف */}
            <button
              type="button"
              aria-label="حذف الموظف"
              className="rounded-lg p-1 text-red-500 transition-colors hover:bg-gray-100"
              onClick={() =>
                openModal("DELETE_CONFIRM", {
                  rowId: row.original.id,
                  itemName: row.original.name,
                  actionFunction: deleteEmployee,
                  contet: <DeleteConfirmationModal />,
                })
              }
            >
              <LuTrash2 className="h-5 w-5" />
            </button>
          </div>
        );
      },
    }),
  ];

  return <Table data={initialData} columns={columns} />;
};

export default EmployeesTable;
