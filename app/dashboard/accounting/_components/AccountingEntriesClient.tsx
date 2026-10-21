"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";

import TableFilter from "@/components/shared/TableFilter";
import TableSearchbar from "@/components/shared/TableSearchbar";
import Pagination from "@/components/shared/Pagination";
import { ResetFilters } from "@/components/shared/ResetFilters";

import AccountingTable from "./AccountingTable";
import NewJournalEntryModal from "./NewJournalModal";
import EditJournalModal from "./EditJournalModal";

import {
  AccountingAccount,
  JournalEntryInput,
  JournalEntryType,
} from "../schemas/accounting.schema";
import PageHeader from "@/components/shared/PageHeader";

interface EditableEntry {
  id: string;
  entryNumber: string;
  entryType: JournalEntryType;
  amount: number;
  currency: "USD" | "SDG";
  debitAccount: AccountingAccount;
  creditAccount: AccountingAccount;
  description: string | null;
  reference: string | null;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Props {
  initialData: JournalEntryInput[];
  initialMeta: Meta;
  years: number[];
}

const ENTRY_TYPES = [
  { value: "CAPITAL", label: "رأس مال" },
  { value: "PURCHASE", label: "شراء" },
  { value: "PURCHASE_PAYMENT", label: "دفع للمورد" },
  { value: "SALE", label: "بيع" },
  { value: "EXPENSE", label: "مصروف" },
  { value: "ASSET", label: "أصل" },
  { value: "OTHER", label: "أخرى" },
];


export default function AccountingEntriesClient({
  initialData,
  initialMeta,
  years,
}: Props) {
  // السنوات اللي فيها قيود فعلًا حتى السنة الحالية
  const YEAR_OPTIONS = years.map((y) => ({ label: String(y), value: String(y) }));
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<EditableEntry | null>(null);

  function handleCreated() {
    setShowModal(false);
    router.refresh();
  }

  function handleEdit(row: Record<string, unknown>) {
    setEditingEntry({
      id: row.id as string,
      entryNumber: row.entry_number as string,
      entryType: row.entry_type as JournalEntryType,
      amount: Number(row.amount ?? 0),
      currency: (row.currency as "USD" | "SDG") ?? "USD",
      debitAccount: row.debit_account as AccountingAccount,
      creditAccount: row.credit_account as AccountingAccount,
      description: (row.description as string | null) ?? null,
      reference: (row.reference as string | null) ?? null,
    });
  }

  function handleCorrected() {
    setEditingEntry(null);
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title=" القيود المحاسبية"
        subtitle=" دفتر اليومية لجميع العمليات المالية"
        buttonTitle=" قيد جديد"
        redirect={() => setShowModal(true)}
      />

      <Suspense fallback={<div className="h-12 animate-pulse bg-gray-50" />}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <TableSearchbar
            placeholder="بحث برقم القيد أو البيان أو المرجع..."
            searchKey="search"
          />

          <div className="flex items-center gap-2">
            <TableFilter label="السنة" paramKey="year" options={YEAR_OPTIONS} />

            <TableFilter
              label="نوع القيد"
              paramKey="entryType"
              options={ENTRY_TYPES}
            />
          </div>
          <ResetFilters />
        </div>
      </Suspense>

      <AccountingTable data={initialData} onEdit={handleEdit} />
      <Suspense fallback={<div className="h-16 animate-pulse bg-gray-50" />}>
        <Pagination meta={initialMeta} />
      </Suspense>

      {showModal && (
        <NewJournalEntryModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      {editingEntry && (
        <EditJournalModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onCorrected={handleCorrected}
        />
      )}
    </div>
  );
}
