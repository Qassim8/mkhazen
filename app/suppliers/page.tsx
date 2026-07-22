"use client";

import { useState } from 'react';
import { FiSearch, FiMoreVertical, FiPhone, FiMail, FiMapPin } from 'react-icons/fi';
import { PageHeader } from '@/components/ui/PageHeader';
import { suppliers } from '@/data/mock-data';

export default function SuppliersPage() {
  const [query, setQuery] = useState('');

  const filtered = suppliers.filter((supplier) => [supplier.name, supplier.contactName, supplier.email].some((value) => value.toLowerCase().includes(query.toLowerCase())));

  return (
    <div className="space-y-6">
      <PageHeader title="Suppliers" description="Keep supplier relationships clear and active." actionLabel="Add Supplier" actionHref="/suppliers/new" />

      <div className="rounded-3xl border border-gray-300 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-gray-300 bg-gray-50 px-3 py-2">
          <FiSearch className="h-4 w-4 text-gray-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search suppliers" className="w-full bg-transparent text-sm outline-none" />
        </div>
        <div className="space-y-3">
          {filtered.map((supplier) => (
            <div key={supplier.id} className="flex flex-col gap-4 rounded-2xl border border-gray-300 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{supplier.name}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${supplier.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>{supplier.active ? 'Active' : 'Inactive'}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600">Contact: {supplier.contactName}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-600">
                  <span className="flex items-center gap-2"><FiPhone className="h-4 w-4 text-red-600" /> {supplier.phone}</span>
                  <span className="flex items-center gap-2"><FiMail className="h-4 w-4 text-red-600" /> {supplier.email}</span>
                  <span className="flex items-center gap-2"><FiMapPin className="h-4 w-4 text-red-600" /> {supplier.address}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-700">
                <div className="rounded-2xl border border-gray-300 bg-gray-50 px-3 py-2 text-center">
                  <div className="font-semibold text-gray-900">{supplier.productCount}</div>
                  <div className="text-xs text-gray-600">Products</div>
                </div>
                <button className="rounded-full border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"><FiMoreVertical className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
