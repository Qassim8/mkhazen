"use client";
import { useState } from "react";

export default function ModalContent() {
  const [formData, setFormData] = useState({
    productId: "",
    type: "ADJUSTMENT",
    quantity: "",
    notes: "",
  });

  return (
    <form className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-950">
          Manual Stock Adjustment
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Log inventory changes for write-offs, damaged items, or audits.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Select Product
          </label>
          <select
            required
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
          >
            <option value="">Choose product to adjust...</option>
            <option value="p1">Wireless Headphones</option>
            <option value="p2">Oxford Cotton Shirt</option>
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Adjustment Type
            </label>
            <select className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition">
              <option value="ADJUSTMENT">Stock Adjustment (General)</option>
              <option value="DAMAGED">Damaged Goods (Stock Out)</option>
              <option value="TRANSFER">Internal Transfer</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Quantity Change (e.g. -5 or +10)
            </label>
            <input
              type="number"
              required
              placeholder="0"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Reason / Notes
          </label>
          <textarea
            rows={3}
            required
            placeholder="Why are you adjusting this stock? (e.g. Damaged during handling)"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-(--primary-red) focus:bg-white focus:outline-none transition resize-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-end border-t border-gray-100 pt-5">
        <button
          type="submit"
          className="rounded-xl bg-gray-950 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-900 transition"
        >
          Apply Adjustment
        </button>
      </div>
    </form>
  );
}
