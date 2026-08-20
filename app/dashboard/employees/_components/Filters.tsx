import TableFilter, { filterOption } from "@/components/shared/TableFilter";

const Filters = () => {
  // الوظائف المعتمدة في الـ Schema (position)
  const positionOptions: filterOption[] = [
    { label: "مدير النظام", value: "system_manager" },
    { label: "كاشير", value: "cashier" },
    { label: "خياط", value: "tailor" },
  ];

  // فترات العمل (shift)
  const shiftOptions: filterOption[] = [
    { label: "صباحي", value: "morning" },
    { label: "مسائي", value: "evening" },
    { label: "دوام كامل", value: "full_time" },
  ];

  // الحالة (status)
  const statusOptions: filterOption[] = [
    { label: "نشط", value: "active" },
    { label: "غير نشط", value: "inactive" },
  ];

  return (
    <div className="py-5 flex items-center gap-2">
      {/* ⚠️ أهم خطوة: حدد paramKey المطابق للـ Query Params في الـ API */}
      <TableFilter
        label="الوظيفة"
        paramKey="position"
        options={positionOptions}
      />
      <TableFilter label="فترة العمل" paramKey="shift" options={shiftOptions} />
      <TableFilter label="الحالة" paramKey="status" options={statusOptions} />
    </div>
  );
};

export default Filters;
