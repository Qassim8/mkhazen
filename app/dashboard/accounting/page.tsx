import AccountingOverviewClient from "./_components/AccountingOverviewClient";
import { getAccountingOverview } from "./services/accounting.services";

const Accounting = async () => {
  const { data } = await getAccountingOverview();

  return <AccountingOverviewClient initialData={data} />;
};

export default Accounting;
