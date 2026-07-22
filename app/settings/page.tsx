"use client";

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'company' | 'warehouse' | 'theme'>('profile');

  const tabs = [
    { key: 'profile', label: 'Profile' },
    { key: 'company', label: 'Company' },
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'theme', label: 'Theme' },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage user, company and warehouse preferences." />

      <div className="rounded-3xl border border-gray-300 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`rounded-full px-4 py-2 text-sm font-medium ${activeTab === tab.key ? 'bg-red-600 text-white' : 'border border-gray-300 bg-white text-gray-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          {activeTab === 'profile' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-300 p-4">
                <div className="text-sm text-gray-500">Name</div>
                <div className="mt-1 font-medium text-gray-900">Amina Youssef</div>
              </div>
              <div className="rounded-2xl border border-gray-300 p-4">
                <div className="text-sm text-gray-500">Email</div>
                <div className="mt-1 font-medium text-gray-900">amina@store.com</div>
              </div>
              <div className="rounded-2xl border border-gray-300 p-4">
                <div className="text-sm text-gray-500">Phone</div>
                <div className="mt-1 font-medium text-gray-900">+20 100 001 1001</div>
              </div>
              <div className="rounded-2xl border border-gray-300 p-4">
                <div className="text-sm text-gray-500">Position</div>
                <div className="mt-1 font-medium text-gray-900">Administrator</div>
              </div>
            </div>
          ) : null}

          {activeTab === 'company' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-300 p-4">Company Name: BrightHub</div>
              <div className="rounded-2xl border border-gray-300 p-4">Website: bright-hub.example</div>
              <div className="rounded-2xl border border-gray-300 p-4">Currency: USD</div>
              <div className="rounded-2xl border border-gray-300 p-4">Tax ID: 123-456-789</div>
            </div>
          ) : null}

          {activeTab === 'warehouse' ? (
            <div className="space-y-3">
              {[
                ['Generate SKU', true],
                ['Generate Barcode', false],
              ].map(([label, checked]) => (
                <label key={label} className="flex items-center justify-between rounded-2xl border border-gray-300 p-4 text-sm text-gray-700">
                  <span>{label}</span>
                  <input type="checkbox" defaultChecked={checked} className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-600" />
                </label>
              ))}
            </div>
          ) : null}

          {activeTab === 'theme' ? (
            <div className="grid gap-4 md:grid-cols-3">
              {['Default', 'Light', 'Dark'].map((theme) => (
                <div key={theme} className="rounded-2xl border border-gray-300 p-4 text-sm text-gray-700">{theme} Theme</div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
