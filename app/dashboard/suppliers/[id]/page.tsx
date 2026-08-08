"use client";

import { useState } from "react";
import { LuUser, LuPhone, LuMail, LuBuilding2 } from "react-icons/lu";

export default function SupplierDetails() {
  const [activeTab, setActiveTab] = useState("info");

  const supplier = {
    name: "Ahmed Ali",
    company: "Al-Noor Electronics Co.",
    phone: "+201012345678",
    email: "info@alnoor.com",
    balance: 1500,
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col sm:flex-row items-center gap-5">
        <div className="h-20 w-20 rounded-2xl bg-gray-950 text-white flex items-center justify-center text-3xl font-bold">
          <LuBuilding2 className="h-10 w-10" />
        </div>
        <div className="flex-1 text-center sm:text-left space-y-1">
          <h2 className="text-2xl font-bold text-gray-950">
            {supplier.company}
          </h2>
          <p className="text-gray-500 font-medium text-sm">
            Account Manager: {supplier.name}
          </p>
        </div>
        <div className="text-center sm:text-right bg-red-50 border border-red-100 p-4 rounded-2xl">
          <p className="text-xs text-red-500 font-semibold mb-0.5">
            Total Balance Due
          </p>
          <p className="text-xl font-black text-red-600">${supplier.balance}</p>
        </div>
      </div>

      <div className="flex border-b border-gray-100 gap-4 text-sm font-semibold">
        <button
          onClick={() => setActiveTab("info")}
          className={`pb-3 transition-all ${activeTab === "info" ? "border-b-2 border-(--primary-red) text-(--primary-red)" : "text-gray-400"}`}
        >
          Company Information
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`pb-3 transition-all ${activeTab === "history" ? "border-b-2 border-(--primary-red) text-(--primary-red)" : "text-gray-400"}`}
        >
          Purchase Orders History
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm min-h-[200px]">
        {activeTab === "info" ? (
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex items-center gap-3 text-sm">
              <LuUser className="h-5 w-5 text-gray-400" />{" "}
              <div>
                <p className="text-xs text-gray-400">Contact Person</p>
                <p className="font-semibold text-gray-900">{supplier.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <LuPhone className="h-5 w-5 text-gray-400" />{" "}
              <div>
                <p className="text-xs text-gray-400">Phone</p>
                <p className="font-semibold text-gray-900">{supplier.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm sm:col-span-2 border-t border-gray-50 pt-4">
              <LuMail className="h-5 w-5 text-gray-400" />{" "}
              <div>
                <p className="text-xs text-gray-400">Email Address</p>
                <p className="font-semibold text-gray-900">{supplier.email}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 text-sm text-gray-400 italic">
            No purchase invoices or supply entries recorded for this supplier.
          </div>
        )}
      </div>
    </div>
  );
}
