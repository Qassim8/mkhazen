import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-3xl border border-gray-300 bg-white p-8 text-center shadow-sm">
      <div className="text-4xl font-semibold text-gray-900">404</div>
      <p className="mt-2 text-sm text-gray-600">The page you are looking for was not found.</p>
      <Link href="/" className="mt-4 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white">Back to Dashboard</Link>
    </div>
  );
}
