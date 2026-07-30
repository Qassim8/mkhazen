"use client";
import Table from "@/components/layout/Table";
import { suppliers } from "@/data/data";
import { useTable } from "@/store/useTable";
import { Supplier } from "@/types/types";
import { createColumnHelper } from "@tanstack/react-table";
import { FiMoreHorizontal } from "react-icons/fi";
import { LuMail, LuPhone } from "react-icons/lu";

const columnHelper = createColumnHelper<Supplier>();

const SuppliersTable = () => {
  const openMenuId = useTable((state) => state.openMenuId);
  const setOpenMenuId = useTable((state) => state.setOpenMenuId);
  const toggleOpenMenu = useTable((state) => state.toggleOpenMenu);

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
                ? "bg-emerald-100/70 text-emerald-800"
                : "bg-rose-100/70 text-rose-800"
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
      cell: ({ row }) => {
        const isOpen = openMenuId === row.id;
        return (
          <div className="relative">
            <button
              type="button"
              className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={() => toggleOpenMenu(row.id)}
            >
              <FiMoreHorizontal className="h-5 w-5" />
            </button>

            {isOpen && (
              <div className="absolute right-0 z-20 mt-2 w-32 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setOpenMenuId(null)}
                >
                  View
                </button>
                <button
                  type="button"
                  className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setOpenMenuId(null)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={() => setOpenMenuId(null)}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      },
    }),
  ];

  return <Table columns={columns} data={suppliers} />;
};

export default SuppliersTable;
