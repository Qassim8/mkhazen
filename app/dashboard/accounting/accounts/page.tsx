import PageHeader from "@/components/shared/PageHeader";
import AccountsTable from "../components/AccountsTable";

export default function ChartOfAccountsPage() {
  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title=" دليل الحسابات (الشجرة المحاسبية)"
        subtitle=" شجرة الحسابات المالية وتصنيفاتها لجميع أصول ومصروفات المتجر"
        buttonTitle="إضافة حساب جديد"
      />

      <AccountsTable />
    </div>
  );
}
