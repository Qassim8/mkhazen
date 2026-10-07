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

const VALID_ENTRY_TYPES = [
  "CAPITAL",
  "PURCHASE",
  "PURCHASE_PAYMENT",
  "SALE",
  "SALE_PAYMENT",
  "COGS",
  "EXPENSE",
  "ASSET",
  "OTHER",
  "INVENTORY_ADJUSTMENT",
  "SALES_RETURN",
] as const;

const Accounting = async ({ searchParams }: AccountingPageProps) => {
  const params = await searchParams;

  const currentYear = new Date().getFullYear();

  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const year = Number(params.year) || currentYear;

  const entryType = (VALID_ENTRY_TYPES as readonly string[]).includes(
    params.entryType ?? "",
  )
    ? (params.entryType as (typeof VALID_ENTRY_TYPES)[number])
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
