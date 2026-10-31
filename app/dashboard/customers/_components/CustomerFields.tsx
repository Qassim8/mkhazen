"use client";

import { useEffect, useState } from "react";
import { LuUserRound, LuX } from "react-icons/lu";

import { cleanCustomerPhone } from "@/lib/customer-phone";

import {
  checkPhoneDuplicates,
  getCustomers,
  type CustomerRecord,
  type DuplicateHit,
} from "../services/customers.services";

/**
 * حقلا العميل المشتركان (طلب التفصيل، البيع بالتقسيط، ربط العميل في البيع العادي):
 * الاسم والهاتف يُكتبان مباشرة، وأثناء الكتابة تظهر اقتراحات من العملاء الموجودين.
 *
 * • اختيار اقتراح يملأ الحقلين ويربط customerId (والحقلان للقراءة فقط حتى يُلغى الاختيار).
 * • بدون اختيار: السيرفر يربط بعميل نفس الرقم الموحَّد (phone_normalized)، وإلا ينشئ عميلًا جديدًا.
 * • لو الرقم المكتوب لعميل باسم مختلف: تلميح فقط تحت الحقل، دون منع.
 */

export interface CustomerFieldsValue {
  name: string;
  phone: string;
  /** عميل مختار من الاقتراحات (null = نص مكتوب يُربط/يُنشأ عند الحفظ) */
  customerId: string | null;
}

export const EMPTY_CUSTOMER_FIELDS: CustomerFieldsValue = { name: "", phone: "", customerId: null };

interface Props {
  value: CustomerFieldsValue;
  onChange: (value: CustomerFieldsValue) => void;
  /** يُستدعى باختيار اقتراح (أو null عند الإلغاء): مثلًا لتحميل مقاسات العميل */
  onSelect?: (customer: CustomerRecord | null) => void;
  /** إلزامي: يُعرض علامة * (التحقق الفعلي في النموذج الأب والسيرفر) */
  required?: boolean;
  disabled?: boolean;
  /** إخفاء الاقتراحات (مثلًا عند نقل عربون: العميل ثابت) */
  suggest?: boolean;
  nameError?: string;
  phoneError?: string;
  /** compact = سلة الكاشير */
  variant?: "default" | "compact";
}

const digitsOf = (value: string) => value.replace(/[^0-9]/g, "");

function inputClass(variant: "default" | "compact", invalid: boolean, readOnly: boolean) {
  const base =
    variant === "compact"
      ? "min-h-11 w-full rounded-lg border bg-white px-2.5 py-2 text-base font-semibold text-gray-800 outline-none lg:min-h-0 lg:text-[11px]"
      : "mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none";
  const tone = invalid ? "border-red-400" : readOnly ? "border-emerald-300 bg-emerald-50" : "border-gray-300 focus:border-(--primary-red)";
  return `${base} ${tone} disabled:opacity-60`;
}

export default function CustomerFields({
  value,
  onChange,
  onSelect,
  required = false,
  disabled = false,
  suggest = true,
  nameError,
  phoneError,
  variant = "default",
}: Props) {
  const [focus, setFocus] = useState<"name" | "phone" | null>(null);
  const [found, setFound] = useState<{ term: string; rows: CustomerRecord[] } | null>(null);
  const [duplicate, setDuplicate] = useState<{ phone: string; hits: DuplicateHit[] } | null>(null);

  const selected = value.customerId !== null;

  // ---------------- اقتراحات أثناء الكتابة (بالاسم أو الهاتف) ----------------
  const term = focus === "name" ? value.name.trim() : focus === "phone" ? value.phone.trim() : "";
  const searchable =
    suggest &&
    !selected &&
    !disabled &&
    ((focus === "name" && term.length >= 2) || (focus === "phone" && digitsOf(term).length >= 3));

  useEffect(() => {
    if (!searchable) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const response = await getCustomers({ search: term, limit: 6 });
        if (!cancelled) setFound({ term, rows: response.data });
      } catch {
        if (!cancelled) setFound({ term, rows: [] });
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [searchable, term]);

  const suggestions = searchable && found?.term === term ? found.rows : [];

  // ---------------- تلميح: الرقم مسجل باسم آخر (بدون منع) ----------------
  const phoneKey = digitsOf(value.phone);
  const checkable = suggest && !selected && !disabled && phoneKey.length >= 8;

  useEffect(() => {
    if (!checkable) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const hits = await checkPhoneDuplicates(phoneKey);
        if (!cancelled) setDuplicate({ phone: phoneKey, hits });
      } catch {
        if (!cancelled) setDuplicate({ phone: phoneKey, hits: [] });
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [checkable, phoneKey]);

  const registeredAs = checkable && duplicate?.phone === phoneKey ? duplicate.hits[0] : undefined;
  const showRegisteredHint = registeredAs && registeredAs.name.trim() !== value.name.trim();

  function choose(customer: CustomerRecord) {
    setFound(null);
    onChange({ name: customer.name, phone: customer.whatsappNumber, customerId: customer.id });
    onSelect?.(customer);
  }

  function clearSelection() {
    onChange({ ...value, customerId: null });
    onSelect?.(null);
  }

  const labelClass = variant === "compact" ? "mb-1 block text-[10px] font-bold text-gray-600" : "text-xs font-bold text-gray-600";

  return (
    <div className={variant === "compact" ? "space-y-2.5" : "space-y-3"}>
      {selected && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
          <LuUserRound className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">عميل مسجل — الحقلان من بياناته</span>
          <button
            type="button"
            onClick={clearSelection}
            disabled={disabled}
            aria-label="إلغاء اختيار العميل"
            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-gray-600 hover:bg-white disabled:opacity-50"
          >
            <LuX className="h-4 w-4" />
            إلغاء الاختيار
          </button>
        </div>
      )}

      <div className={variant === "compact" ? "space-y-2.5" : "grid gap-4 sm:grid-cols-2"}>
        <div className="relative">
          <label className="block">
            <span className={labelClass}>
              اسم العميل
              {required && <span className="text-red-500"> *</span>}
            </span>
            <input
              type="text"
              value={value.name}
              maxLength={255}
              readOnly={selected}
              disabled={disabled}
              autoComplete="off"
              onFocus={() => setFocus("name")}
              onBlur={() => setFocus((current) => (current === "name" ? null : current))}
              onChange={(event) => onChange({ ...value, name: event.target.value })}
              placeholder="اسم العميل"
              className={inputClass(variant, Boolean(nameError), selected)}
            />
          </label>
          {nameError && <p role="alert" className="mt-1 text-xs font-semibold text-red-600">{nameError}</p>}

          {focus === "name" && suggestions.length > 0 && (
            <SuggestionList suggestions={suggestions} onChoose={choose} />
          )}
        </div>

        <div className="relative">
          <label className="block">
            <span className={labelClass}>
              رقم الهاتف
              {required && <span className="text-red-500"> *</span>}
            </span>
            <input
              type="tel"
              inputMode="tel"
              dir="ltr"
              value={value.phone}
              maxLength={30}
              readOnly={selected}
              disabled={disabled}
              autoComplete="off"
              onFocus={() => setFocus("phone")}
              onBlur={() => setFocus((current) => (current === "phone" ? null : current))}
              onChange={(event) => onChange({ ...value, phone: event.target.value })}
              placeholder="09xxxxxxxx أو +2499xxxxxxxx"
              className={`${inputClass(variant, Boolean(phoneError), selected)} text-left`}
            />
          </label>
          {phoneError && <p role="alert" className="mt-1 text-xs font-semibold text-red-600">{phoneError}</p>}

          {showRegisteredHint && (
            <p className="mt-1 text-[11px] font-semibold text-amber-700">
              هذا الرقم مسجل باسم {registeredAs.name}
              {cleanCustomerPhone(value.phone) !== cleanCustomerPhone(registeredAs.whatsapp_number) ? " (بصيغة أخرى)" : ""} —
              سيُربط به عند الحفظ.
            </p>
          )}

          {focus === "phone" && suggestions.length > 0 && (
            <SuggestionList suggestions={suggestions} onChoose={choose} />
          )}
        </div>
      </div>
    </div>
  );
}

function SuggestionList({
  suggestions,
  onChoose,
}: {
  suggestions: CustomerRecord[];
  onChoose: (customer: CustomerRecord) => void;
}) {
  return (
    <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
      {suggestions.map((customer) => (
        <li key={customer.id}>
          {/* mouseDown لا يسحب التركيز من الحقل قبل الاختيار */}
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChoose(customer)}
            className="flex min-h-11 w-full flex-col justify-center rounded-lg px-3 py-1.5 text-right hover:bg-gray-50"
          >
            <span className="text-sm font-bold text-gray-900">{customer.name}</span>
            <span dir="ltr" className="text-xs text-gray-500">
              {customer.whatsappNumber}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
