"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { LuGitMerge } from "react-icons/lu";

import { newIdempotencyKey } from "@/lib/use-idempotency-key";

import { mergeCustomers, type DuplicateGroup } from "../services/customers.services";
import { ConfirmModal } from "./CustomerModals";

type Candidate = DuplicateGroup["customers"][number];

/** عملاء مكررون (المالك والمدير): نفس الهاتف بصيغ مختلفة. الدمج ينقل الفواتير ثم يحذف النسخة. */
export default function DuplicatesSection({
  groups,
  onMerged,
}: {
  groups: DuplicateGroup[];
  onMerged: () => void;
}) {
  // العميل المُبقى لكل مجموعة (الافتراضي: الأكثر فواتير ثم الأقدم)
  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ keep: Candidate; remove: Candidate[] } | null>(null);

  if (groups.length === 0) return null;

  const defaultKeep = (group: DuplicateGroup) =>
    [...group.customers].sort((a, b) => b.invoiceCount - a.invoiceCount || a.createdAt.localeCompare(b.createdAt))[0].id;

  async function runMerge() {
    if (!pending) return;

    try {
      for (const target of pending.remove) {
        await mergeCustomers(pending.keep.id, target.id, { idempotencyKey: newIdempotencyKey() });
      }
      toast.success("تم دمج العملاء.");
      setPending(null);
      onMerged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الدمج");
    }
  }

  const movedInvoices = pending ? pending.remove.reduce((sum, item) => sum + item.invoiceCount, 0) : 0;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <LuGitMerge className="h-4 w-4 text-amber-700" />
        <h2 className="text-sm font-black text-gray-900">عملاء مكررون</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{groups.length}</span>
      </div>
      <p className="mb-3 text-xs text-gray-600">
        عملاء بنفس الرقم (بعد توحيد الصيغ 09… و+249… و249…). اختر العميل الذي يبقى ثم ادمج الباقي فيه.
      </p>

      <div className="space-y-3">
        {groups.map((group) => {
          const keepId = keepByGroup[group.phone] ?? defaultKeep(group);
          const keep = group.customers.find((item) => item.id === keepId) ?? group.customers[0];

          return (
            <div key={group.phone} className="rounded-xl border border-gray-200 bg-white p-3">
              <p dir="ltr" className="mb-2 text-left text-xs font-bold text-gray-500">
                {group.phone}
              </p>

              <div className="space-y-2">
                {group.customers.map((item) => (
                  <label
                    key={item.id}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm ${
                      item.id === keepId ? "border-emerald-300 bg-emerald-50" : "border-gray-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`keep-${group.phone}`}
                      checked={item.id === keepId}
                      onChange={() => setKeepByGroup((current) => ({ ...current, [group.phone]: item.id }))}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-gray-900">{item.name}</span>
                      <span dir="ltr" className="block text-right text-xs text-gray-500">
                        {item.whatsappNumber}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-gray-600">{item.invoiceCount} فاتورة</span>
                  </label>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setPending({ keep, remove: group.customers.filter((item) => item.id !== keep.id) })
                }
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-bold text-white hover:bg-gray-800"
              >
                <LuGitMerge className="h-4 w-4" />
                دمج الباقي في «{keep.name}»
              </button>
            </div>
          );
        })}
      </div>

      {pending && (
        <ConfirmModal
          title="تأكيد دمج العملاء"
          confirmLabel="تأكيد الدمج"
          danger
          onClose={() => setPending(null)}
          onConfirm={runMerge}
          body={
            <div className="space-y-2 text-sm">
              <p>
                سيبقى العميل <strong>«{pending.keep.name}»</strong>.
              </p>
              <p>
                سيُنقل <strong>{movedInvoices}</strong> فاتورة/طلب وكل مراجع{" "}
                {pending.remove.map((item) => `«${item.name}»`).join("، ")} إلى «{pending.keep.name}»، وتُستكمل المقاسات
                لو لم تكن للعميل المُبقى، وتُجمع الملاحظات.
              </p>
              <p className="font-bold text-red-700">
                ثم يُحذف {pending.remove.map((item) => `«${item.name}»`).join("، ")} نهائيًا ولا يمكن التراجع.
              </p>
            </div>
          }
        />
      )}
    </section>
  );
}
