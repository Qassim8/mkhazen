"use client";
import Table from "@/components/shared/Table";
import { suppliers } from "@/data/data";
import { useTable } from "@/store/useTable";
import { Supplier } from "@/types/types";
import { createColumnHelper } from "@tanstack/react-table";
import { LuEye, LuMail, LuPhone, LuSquarePen, LuTrash2 } from "react-icons/lu";

const columnHelper = createColumnHelper<Supplier>();

const SuppliersTable = () => {
  const toggleOpenMenu = useTable((state) => state.toggleOpenMenu);
  const showDeleteConfirmation = useTable(
    (state) => state.showDeleteConfirmation,
  );

  const deleteSupplier = async (supplierId: string | number) => {
    console.log("حذف المورد:", supplierId);
  };

  const columns = [
    columnHelper.accessor("companyName", {
      header: "Company",
      cell: (info) => (
        <span className="font-semibold text-gray-900">{info.getValue()}</span>
      ),
    }),

    columnHelper.accessor("contact", {
      header: "Contact",
      cell: (info) => (
        <div className="flex flex-col gap-0.5 max-w-50">
          {info.getValue().map((contact, index) => (
            <span key={index} className="text-sm text-gray-700 truncate">
              {contact}
            </span>
          ))}
        </div>
      ),
    }),

    columnHelper.accessor("phone", {
      header: "Phone",
      cell: (info) => (
        <div className="flex items-center gap-3 text-gray-500">
          <LuPhone />
          <div className="flex flex-col text-xs font-mono">
            {info.getValue().map((phone, index) => (
              <span key={index} dir="ltr" className="text-right">
                {phone}
              </span>
            ))}
          </div>
        </div>
      ),
    }),

    columnHelper.accessor("email", {
      header: "Email",
      cell: (info) => (
        <div className="flex items-center gap-3 text-gray-500">
          <LuMail />
          <div className="flex flex-col text-sm ">
            {info.getValue().map((email, index) => (
              <span key={index} className="truncate">
                {email}
              </span>
            ))}
          </div>
        </div>
      ),
    }),

    columnHelper.accessor("location", {
      header: "Location",
      cell: (info) => (
        <span
          className="text-sm text-gray-600 truncate max-w-37.5"
          title={info.getValue().join(" - ")}
        >
          {info.getValue().join(" ، ")}
        </span>
      ),
    }),
    columnHelper.accessor("products", {
      header: "Products",
      cell: (info) => (
        <span className="font-semibold text-gray-900">
          {info.getValue() ?? 0}
        </span>
      ),
    }),

    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const status = info.getValue();
        const isActive = status === "active";
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
            {isActive ? "active" : "inactive"}
          </span>
        );
      },
    }),

    columnHelper.display({
      id: "actions",
      cell: ({ row }) => {
        return (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              aria-label="عرض المورد"
              className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={() => toggleOpenMenu(row.id)}
            >
              <LuEye className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="تعديل المورد"
              className="rounded-lg p-1 text-blue-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={() => toggleOpenMenu(row.id)}
            >
              <LuSquarePen className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="حذف المورد"
              className="rounded-lg p-1 text-red-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={() =>
                showDeleteConfirmation(
                  row.original.id ?? row.id,
                  deleteSupplier,
                  row.original.companyName,
                )
              }
            >
              <LuTrash2 className="h-5 w-5" />
            </button>
          </div>
        );
      },
    }),
  ];

  return <Table columns={columns} data={suppliers} />;
};

export default SuppliersTable;
