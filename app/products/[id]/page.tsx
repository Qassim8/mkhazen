import { notFound } from 'next/navigation';
import { FiMapPin, FiPackage, FiTruck, FiLayers } from 'react-icons/fi';
import { products } from '@/data/mock-data';

interface ProductDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailsPage({ params }: ProductDetailsPageProps) {
  const { id } = await params;
  const product = products.find((item) => item.id === Number(id));

  if (!product) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-300 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-red-50 text-3xl">{product.image}</div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-red-600">{product.sku}</div>
              <h1 className="text-3xl font-semibold text-gray-900">{product.name}</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-600">{product.description}</p>
            </div>
          </div>
          <div className={`rounded-full px-3 py-1 text-sm font-semibold ${product.status === 'Out of Stock' ? 'bg-red-100 text-red-700' : product.status === 'Low Stock' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{product.status}</div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-gray-300 bg-gray-50 p-4">
            <div className="text-sm text-gray-600">Price</div>
            <div className="mt-2 text-xl font-semibold text-gray-900">${product.price}</div>
          </div>
          <div className="rounded-2xl border border-gray-300 bg-gray-50 p-4">
            <div className="text-sm text-gray-600">Available Stock</div>
            <div className="mt-2 text-xl font-semibold text-gray-900">{product.stock} units</div>
          </div>
          <div className="rounded-2xl border border-gray-300 bg-gray-50 p-4">
            <div className="text-sm text-gray-600">Reorder Level</div>
            <div className="mt-2 text-xl font-semibold text-gray-900">{product.reorderLevel}</div>
          </div>
          <div className="rounded-2xl border border-gray-300 bg-gray-50 p-4">
            <div className="text-sm text-gray-600">Location</div>
            <div className="mt-2 text-xl font-semibold text-gray-900">{product.location}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-gray-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Supplier & Category</h2>
          <div className="mt-4 space-y-3 text-sm text-gray-700">
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 p-3"><FiTruck className="h-4 w-4 text-red-600" /> Supplier: {product.supplier}</div>
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 p-3"><FiLayers className="h-4 w-4 text-red-600" /> Category: {product.category}</div>
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 p-3"><FiMapPin className="h-4 w-4 text-red-600" /> Storage location: {product.location}</div>
          </div>
        </div>
        <div className="rounded-3xl border border-gray-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Inventory Notes</h2>
          <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
            This item should be reviewed weekly to prevent stockouts. Tracking the reorder level and supplier lead times is essential.
          </div>
        </div>
      </div>
    </div>
  );
}
