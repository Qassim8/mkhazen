"use client";

import { PageHeader } from '@/components/ui/PageHeader';
import { categories } from '@/data/mock-data';

export default function CategoriesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Categories" description="Organize your catalog into clear product groups." actionLabel="Add Category" actionHref="/categories/new" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (
          <div key={category.id} className="group rounded-3xl border border-gray-300 bg-white p-5 shadow-sm transition hover:-translate-y-0.5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-2xl">{category.icon}</div>
                <div>
                  <h3 className="font-semibold text-gray-900">{category.name}</h3>
                  <p className="text-sm text-gray-600">{category.productCount} products</p>
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-600">{category.description}</p>
            <div className="mt-4 flex items-center gap-2">
              <button className="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-700 opacity-100 md:opacity-0 md:group-hover:opacity-100 lg:opacity-100">Edit</button>
              <button className="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-700 opacity-100 md:opacity-0 md:group-hover:opacity-100 lg:opacity-100">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
