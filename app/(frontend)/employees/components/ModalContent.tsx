"use client";
import { useState } from "react";

export default function ModalContent() {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    job: "",
    department: "",
    shift: "Morning",
    salary: "",
    address: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <form className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-950">Add New Employee</h3>
        <p className="text-sm text-gray-500 mt-1">
          Fill in the workforce details to manage roles and payroll.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Full Name
          </label>
          <input
            type="text"
            name="name"
            required
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. Ahmed Raafat"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Phone Number
          </label>
          <input
            type="tel"
            name="phone"
            required
            value={formData.phone}
            onChange={handleChange}
            placeholder="+201..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Email Address
          </label>
          <input
            type="email"
            name="email"
            required
            value={formData.email}
            onChange={handleChange}
            placeholder="name@store.com"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Job Title
          </label>
          <input
            type="text"
            name="job"
            required
            value={formData.job}
            onChange={handleChange}
            placeholder="e.g. Head Cashier"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Department
          </label>
          <select
            name="department"
            required
            value={formData.department}
            onChange={handleChange}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
          >
            <option value="">Select Department</option>
            <option value="Sales">Sales</option>
            <option value="Warehouse">Warehouse</option>
            <option value="Management">Management</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Shift Type
          </label>
          <select
            name="shift"
            value={formData.shift}
            onChange={handleChange}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
          >
            <option value="Morning">Morning Shift</option>
            <option value="Night">Night Shift</option>
            <option value="Flexible">Flexible</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Monthly Salary ($)
          </label>
          <input
            type="number"
            name="salary"
            required
            min="0"
            value={formData.salary}
            onChange={handleChange}
            placeholder="0.00"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Address (Optional)
          </label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
            placeholder="City, Street Details"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
          />
        </div>
      </div>

      <div className="flex items-center justify-end border-t border-gray-100 pt-5">
        <button
          type="submit"
          className="rounded-xl bg-(--primary-red) px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition"
        >
          Save Employee
        </button>
      </div>
    </form>
  );
}
