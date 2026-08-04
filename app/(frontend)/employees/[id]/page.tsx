"use client";
import { useState } from "react";
import {
  LuPhone,
  LuMail,
  LuMapPin,
  LuDollarSign,
  LuClock,
} from "react-icons/lu";

export default function EmployeeDetails() {
  const [activeTab, setActiveTab] = useState("info");

  // بيانات تجريبية لموظف واحد لاستعراض التفاصيل
  const employee = {
    name: "Ahmed Raafat",
    job: "Head Cashier",
    department: "Sales",
    phone: "+201012345678",
    email: "ahmed.raafat@store.com",
    salary: 800,
    shift: "Morning Shift (8 AM - 4 PM)",
    address: "Nasr City, Cairo",
    status: "active",
  };

  return (
    <div className="space-y-6">
      {/* الكارت العلوي الرئيسي (Header Card) */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col sm:flex-row items-center gap-5">
        <div className="h-20 w-20 rounded-2xl bg-(--primary-red)/10 text-(--primary-red) flex items-center justify-center text-3xl font-bold">
          {employee.name.charAt(0)}
        </div>
        <div className="flex-1 text-center sm:text-left space-y-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-2xl font-bold text-gray-950">
              {employee.name}
            </h2>
            <span className="inline-flex self-center sm:self-auto items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
              ● {employee.status}
            </span>
          </div>
          <p className="text-gray-500 font-medium text-sm">
            {employee.job} — {employee.department}
          </p>
        </div>
      </div>

      {/* شريط التبويبات المصغر لتغيير المحتوى */}
      <div className="flex border-b border-gray-100 gap-4 text-sm font-semibold">
        <button
          onClick={() => setActiveTab("info")}
          className={`pb-3 transition-all ${activeTab === "info" ? "border-b-2 border-(--primary-red) text-(--primary-red)" : "text-gray-400"}`}
        >
          Personal Profile
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`pb-3 transition-all ${activeTab === "history" ? "border-b-2 border-(--primary-red) text-(--primary-red)" : "text-gray-400"}`}
        >
          Work Logs & Sales
        </button>
      </div>

      {/* محتوى التبويب النشط */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm min-h-62.5">
        {activeTab === "info" ? (
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex items-center gap-3 text-sm">
              <LuPhone className="h-5 w-5 text-gray-400" />{" "}
              <div>
                <p className="text-xs text-gray-400">Phone</p>
                <p className="font-semibold text-gray-900">{employee.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <LuMail className="h-5 w-5 text-gray-400" />{" "}
              <div>
                <p className="text-xs text-gray-400">Email</p>
                <p className="font-semibold text-gray-900">{employee.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <LuClock className="h-5 w-5 text-gray-400" />{" "}
              <div>
                <p className="text-xs text-gray-400">Shift Schedule</p>
                <p className="font-semibold text-gray-900">{employee.shift}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <LuDollarSign className="h-5 w-5 text-gray-400" />{" "}
              <div>
                <p className="text-xs text-gray-400">Monthly Salary</p>
                <p className="font-semibold text-gray-900">
                  ${employee.salary}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm sm:col-span-2 border-t border-gray-50 pt-4">
              <LuMapPin className="h-5 w-5 text-gray-400" />{" "}
              <div>
                <p className="text-xs text-gray-400">Address</p>
                <p className="font-semibold text-gray-900">
                  {employee.address}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 text-sm text-gray-400 italic">
            No recent transactions or check-ins found for this employee.
          </div>
        )}
      </div>
    </div>
  );
}
