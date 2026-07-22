"use client";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#f3f4f6,#ffffff,#fef2f2)] p-4">
      <div className="w-full max-w-md rounded-3xl border border-gray-300 bg-white/90 p-8 shadow-2xl backdrop-blur">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-900 text-xl font-semibold text-white">SU</div>
          <h1 className="mt-4 text-2xl font-semibold text-gray-900">Create account</h1>
          <p className="mt-2 text-sm text-gray-600">Start your store control workspace</p>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block rounded-2xl border border-gray-300 p-3 text-sm text-gray-700">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Full Name</div>
            <input className="w-full bg-transparent outline-none" placeholder="Full name" />
          </label>
          <label className="block rounded-2xl border border-gray-300 p-3 text-sm text-gray-700">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Email</div>
            <input className="w-full bg-transparent outline-none" placeholder="name@company.com" />
          </label>
          <button className="w-full rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700">Create Account</button>
        </div>
      </div>
    </div>
  );
}
