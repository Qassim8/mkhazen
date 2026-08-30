"use client";

import Table from "@/components/shared/Table";
import { useModalStore } from "@/store/useModalStore";
import { createColumnHelper } from "@tanstack/react-table";
import { LuEye, LuMail, LuPhone, LuSquarePen, LuTrash2 } from "react-icons/lu";
import DeleteConfirmationModal from "@/components/ui/DeleteConfirmationModal";
import { deleteSupplier } from "../service/supplier.services";
import SupplierUpdateModal from "./SupplierUpdateModal";
import SupplierViewContent from "./SupplierDetails";
import { Supplier } from "../schemas/supplier.schemas";

const columnHelper = createColumnHelper<Supplier>();

interface SuppliersTableProps {
  initialData: Supplier[];
}

const SuppliersTable = ({ initialData }: SuppliersTableProps) => {
  const openModal = useModalStore((state) => state.openModal);

  const columns = [
    columnHelper.accessor("name", {
      header: "المورد",
      cell: (info) => (
        <div className="flex flex-col">
          <span className="font-semibold text-gray-900">{info.getValue()}</span>
          <span className="text-xs text-gray-500">
            {info.row.original.contactPerson || "لا يوجد جهة اتصال"}
          </span>
        </div>
      ),
    }),

    columnHelper.accessor("phone", {
      header: "الهاتف",
      cell: (info) => (
        <div className="flex items-center gap-2 text-gray-600">
          <LuPhone className="h-4 w-4" />
          <span dir="ltr" className="text-sm font-mono">
            {info.getValue() || "—"}
          </span>
        </div>
      ),
    }),

    columnHelper.accessor("email", {
      header: "البريد",
      cell: (info) => (
        <div className="flex items-center gap-2 text-gray-600">
          <LuMail className="h-4 w-4" />
          <span className="text-sm truncate">{info.getValue() || "—"}</span>
        </div>
      ),
    }),

    columnHelper.accessor("address", {
      header: "العنوان",
      cell: (info) => (
        <span className="text-sm text-gray-600 max-w-55 block truncate">
          {info.getValue() || "—"}
        </span>
      ),
    }),

    columnHelper.accessor("isActive", {
      header: "الحالة",
      cell: (info) => {
        const isActive = Boolean(info.getValue());
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              isActive
                ? "bg-emerald-100/50 text-emerald-800"
                : "bg-rose-100/50 text-rose-800"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isActive ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
            {isActive ? "نشط" : "غير نشط"}
          </span>
        );
      },
    }),

    columnHelper.display({
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            aria-label="عرض المورد"
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            onClick={() =>
              openModal("VIEW", {
                title: "تفاصيل المورد",
                content: <SupplierViewContent initialData={row.original} />,
              })
            }
          >
            <LuEye className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="تعديل المورد"
            className="rounded-lg p-1 text-blue-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
            onClick={() =>
              openModal("UPDATE", {
                title: "تعديل بيانات المورد",
                content: <SupplierUpdateModal initialData={row.original} />,
              })
            }
          >
            <LuSquarePen className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="حذف المورد"
            className="rounded-lg p-1 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
            onClick={() =>
              openModal("DELETE_CONFIRM", {
                rowId: row.original.id,
                itemName: row.original.name,
                actionFunction: deleteSupplier,
                content: <DeleteConfirmationModal />,
              })
            }
          >
            <LuTrash2 className="h-5 w-5" />
          </button>
        </div>
      ),
    }),
  ];

  return <Table columns={columns} data={initialData} />;
};

export default SuppliersTable;
