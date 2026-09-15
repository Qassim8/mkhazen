import AccountingEntriesClient from "../_components/AccountingEntriesClient";
import { getAccountingEntries } from "../services/accounting.services";

interface AccountingPageProps {
  searchParams: Promise<{
    page?: string;
    year?: string;
    entryType?: string;
    search?: string;
  }>;
}

const Accounting = async ({ searchParams }: AccountingPageProps) => {
  const params = await searchParams;

  const currentYear = new Date().getFullYear();

  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const year = Number(params.year) || currentYear;

  const entryType =
    params.entryType === "CAPITAL" ||
    params.entryType === "PURCHASE" ||
    params.entryType === "PURCHASE_PAYMENT" ||
    params.entryType === "SALE" ||
    params.entryType === "EXPENSE" ||
    params.entryType === "ASSET" ||
    params.entryType === "OTHER"
      ? params.entryType
      : "ALL";

  const search = params.search ?? "";

  const { data, meta } = await getAccountingEntries({
    page,
    limit: 20,
    year,
    entryType,
    search: search || undefined,
  });

  return (
    <AccountingEntriesClient
      initialData={data}
      initialMeta={meta}
      initialFilters={{
        year,
        entryType,
        search,
      }}
    />
  );
};

export default Accounting;
