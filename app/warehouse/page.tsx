"use client";

import { useState } from 'react';
import { FiFilter, FiPlus, FiMinus, FiUser, FiPackage } from 'react-icons/fi';
import { PageHeader } from '@/components/ui/PageHeader';
import { movements } from '@/data/mock-data';

export default function WarehousePage() {
  const [stateFilter, setStateFilter] = useState('All');

  const filtered = movements.filter((movement) => stateFilter === 'All' || movement.state === stateFilter);

  return (
    <div className="space-y-6">
      <PageHeader title="Warehouse" description="Track inbound, outbound and adjustment movements in one view." actionLabel="Add Movement" actionHref="/warehouse/new" />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-gray-300 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Movement Log</h2>
            <div className="flex items-center gap-2 rounded-2xl border border-gray-300 px-3 py-2 text-sm text-gray-700">
              <FiFilter className="h-4 w-4" />
              <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} className="bg-transparent outline-none">
                <option value="All">All states</option>
                <option value="Inbound">Inbound</option>
                <option value="Outbound">Outbound</option>
                <option value="Restricted">Restricted</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-gray-300">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-700">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Reference</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((movement) => (
                  <tr key={movement.id} className="border-t border-gray-200">
                    <td className="px-4 py-3 text-gray-700">{movement.date}</td>
                    <td className="px-4 py-3 text-gray-700">{movement.product}</td>
                    <td className="px-4 py-3 text-gray-700">{movement.state}</td>
                    <td className={`px-4 py-3 font-semibold ${movement.type === 'In' ? 'text-green-700' : 'text-red-700'}`}>
                      {movement.type === 'In' ? <span className="inline-flex items-center gap-1"><FiPlus className="h-4 w-4" />{movement.quantity}</span> : <span className="inline-flex items-center gap-1"><FiMinus className="h-4 w-4" />{movement.quantity}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{movement.employee}</td>
                    <td className="px-4 py-3 text-gray-700">{movement.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Daily Timeline</h2>
          <div className="mt-4 space-y-3">
            {movements.map((movement) => (
              <div key={movement.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900">{movement.product}</div>
                  <div className={`rounded-full px-2.5 py-1 text-xs font-semibold ${movement.type === 'In' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{movement.type}</div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                  <FiUser className="h-4 w-4 text-red-600" /> {movement.employee}
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                  <FiPackage className="h-4 w-4 text-red-600" /> {movement.quantity} units • {movement.state}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
