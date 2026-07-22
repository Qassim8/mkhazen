import { users } from '@/data/mock-data';

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-300 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Admin Access Panel</h1>
        <p className="mt-2 text-sm text-gray-600">Only administrators can manage user roles and permissions.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {users.map((user) => (
          <div key={user.id} className="rounded-3xl border border-gray-300 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">{user.name}</h2>
                <p className="text-sm text-gray-600">{user.email}</p>
              </div>
              <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">{user.role}</span>
            </div>
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              Permission level: {user.role === 'Admin' ? 'Full control' : 'Limited access'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
