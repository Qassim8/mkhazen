"use client";

import { useState } from 'react';
import { FiSearch, FiMoreVertical, FiEye, FiEdit3, FiTrash2 } from 'react-icons/fi';
import { PageHeader } from '@/components/ui/PageHeader';
import { products } from '@/data/mock-data';
import Link from 'next/link';

export default function ProductsPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('All');

  const filtered = products.filter((product) => {
    const matchesQuery = [product.name, product.sku, product.supplier].some((value) => value.toLowerCase().includes(query.toLowerCase()));
    const matchesCategory = category === 'All' || product.category === category;
    const matchesStatus = status === 'All' || product.status === status;
    return matchesQuery && matchesCategory && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Products" description="Manage your catalog with search, filters and quick actions." actionLabel="Add Product" actionHref="/products/new" />

      <div className="rounded-3xl border border-gray-300 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-gray-300 bg-gray-50 px-3 py-2">
            <FiSearch className="h-4 w-4 text-gray-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="flex gap-3">
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
              <option value="All">All categories</option>
              <option value="Electronics">Electronics</option>
              <option value="Home Supply">Home Supply</option>
              <option value="Apparel">Apparel</option>
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
              <option value="All">All statuses</option>
              <option value="In Stock">In Stock</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Out of Stock">Out of Stock</option>
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-300">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-700">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Storage</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id} className="border-t border-gray-200">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-xl">{product.image}</div>
                      <div>
                        <div className="font-medium text-gray-900">{product.name}</div>
                        <div className="text-xs text-gray-500">{product.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{product.location}</td>
                  <td className="px-4 py-3 text-gray-700">{product.category}</td>
                  <td className="px-4 py-3 text-gray-700">{product.supplier}</td>
                  <td className="px-4 py-3 text-gray-700">{product.stock}</td>
                  <td className="px-4 py-3 text-gray-700">${product.price}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${product.status === 'Out of Stock' ? 'bg-red-100 text-red-700' : product.status === 'Low Stock' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{product.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/products/${product.id}`} className="rounded-full border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"><FiEye className="h-4 w-4" /></Link>
                      <button className="rounded-full border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"><FiEdit3 className="h-4 w-4" /></button>
                      <button className="rounded-full border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"><FiTrash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>Showing {filtered.length} of {products.length} products</span>
          <div className="flex items-center gap-2">
            <button className="rounded-full border border-gray-300 px-3 py-1">Previous</button>
            <button className="rounded-full bg-red-600 px-3 py-1 text-white">1</button>
            <button className="rounded-full border border-gray-300 px-3 py-1">2</button>
            <button className="rounded-full border border-gray-300 px-3 py-1">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
