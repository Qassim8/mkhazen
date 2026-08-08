import TableFilter, { filterOption } from "@/components/shared/TableFilter";

const Filters = () => {
  const departOption: filterOption[] = [
    { label: "المبيعات", value: "sales" },
    { label: "المخازن", value: "warehouse" },
    { label: "اداري", value: "management" },
  ];

  const shiftOption: filterOption[] = [
    { label: "صباحي", value: "morning" },
    { label: "مسائي", value: "night" },
    { label: "مرنs", value: "flexible" },
  ];

  const statusOption: filterOption[] = [
    { label: "نشط", value: "active" },
    { label: "غير نشط", value: "inactive" },
  ];

  return (
    <div>
      <div className="py-5 flex items-center gap-2">
        <TableFilter label="القسم" options={departOption} />
        <TableFilter label="الدوام" options={shiftOption} />
        <TableFilter label="الحالة" options={statusOption} />
      </div>
    </div>
  );
};

export default Filters;
