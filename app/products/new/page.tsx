"use client";

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';

export default function NewProductPage() {
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-300 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Create Product</h1>
        <p className="mt-2 text-sm text-gray-600">Use the modal to capture product details and keep the form focused.</p>
      </div>
      <Modal title="Add New Product" open={open} onClose={() => setOpen(false)}>
        <div className="space-y-4 text-sm text-gray-700">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="rounded-2xl border border-gray-300 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Product Name</div>
              <input className="w-full bg-transparent outline-none" placeholder="e.g. Smart Lamp" />
            </label>
            <label className="rounded-2xl border border-gray-300 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">SKU</div>
              <input className="w-full bg-transparent outline-none" placeholder="SKU-001" />
            </label>
          </div>
          <label className="block rounded-2xl border border-gray-300 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Description</div>
            <textarea className="min-h-24 w-full bg-transparent outline-none" placeholder="Describe the product" />
          </label>
          <div className="flex justify-end gap-2">
            <button className="rounded-full border border-gray-300 px-4 py-2">Cancel</button>
            <button className="rounded-full bg-red-600 px-4 py-2 text-white">Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
