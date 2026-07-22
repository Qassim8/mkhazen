"use client";

import { PageHeader } from '@/components/ui/PageHeader';
import { users } from '@/data/mock-data';

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="User Management" description="Admin-only area for managing team access." actionLabel="Add User" actionHref="/users/new" />

      <div className="rounded-3xl border border-gray-300 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.id} className="flex flex-col gap-4 rounded-2xl border border-gray-300 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-semibold text-gray-900">{user.name}</div>
                <div className="mt-1 text-sm text-gray-600">{user.email}</div>
                <div className="mt-1 text-sm text-gray-500">{user.phone}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">{user.role}</span>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">{user.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
