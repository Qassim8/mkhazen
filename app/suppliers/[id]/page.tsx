import { notFound } from 'next/navigation';
import { FiMail, FiPhone, FiMapPin, FiBox } from 'react-icons/fi';
import { suppliers } from '@/data/mock-data';

interface SupplierDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default async function SupplierDetailsPage({ params }: SupplierDetailsPageProps) {
  const { id } = await params;
  const supplier = suppliers.find((item) => item.id === Number(id));

  if (!supplier) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-300 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-red-600">Supplier</div>
            <h1 className="text-3xl font-semibold text-gray-900">{supplier.name}</h1>
            <p className="mt-2 text-sm text-gray-600">Primary contact: {supplier.contactName}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${supplier.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>{supplier.active ? 'Active' : 'Inactive'}</span>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-gray-300 bg-gray-50 p-4">
            <div className="text-sm text-gray-600">Phone</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">{supplier.phone}</div>
          </div>
          <div className="rounded-2xl border border-gray-300 bg-gray-50 p-4">
            <div className="text-sm text-gray-600">Email</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">{supplier.email}</div>
          </div>
          <div className="rounded-2xl border border-gray-300 bg-gray-50 p-4">
            <div className="text-sm text-gray-600">Products</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">{supplier.productCount}</div>
          </div>
          <div className="rounded-2xl border border-gray-300 bg-gray-50 p-4">
            <div className="text-sm text-gray-600">Lead Time</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">{supplier.leadTime}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-gray-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Contact Information</h2>
          <div className="mt-4 space-y-3 text-sm text-gray-700">
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 p-3"><FiPhone className="h-4 w-4 text-red-600" /> {supplier.phone}</div>
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 p-3"><FiMail className="h-4 w-4 text-red-600" /> {supplier.email}</div>
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 p-3"><FiMapPin className="h-4 w-4 text-red-600" /> {supplier.address}</div>
          </div>
        </div>
        <div className="rounded-3xl border border-gray-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Delivery Notes</h2>
          <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
            Orders from this supplier should be reviewed weekly to ensure timely delivery and healthy stock availability.
          </div>
        </div>
      </div>
    </div>
  );
}
