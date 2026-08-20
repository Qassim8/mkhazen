import { IconType } from "react-icons";

export type StatsCardProps = {
  title: string;
  value: string;
  icon: IconType;
  iconBg?: string;
  statNumber: number;
  statType: "increase" | "decrease" | "neutral";
};

export type Category = {
  id: number | string;
  icon: string;
  color: string;
  title: string;
  products: number;
};

export type Product = {
  id?: string;
  name: string;
  image: string;
  images?: string[];
  sku?: string;
  category?: string;
  supplier?: string;
  qty?: number;
  price: number;
  status?: "In stock" | "Low stock" | "Out of stock";
};

export type Supplier = {
  id?: string;
  companyName: string;
  contact: string[];
  phone: string[];
  email: string[];
  location: string[];
  products?: number | 0;
  status: "active" | "inactive";
};

export type Employee = {
  id: string;
  name: string;
  phone: string;
  email: string;
  job: string;
  salary: number;
  department: string;
  address?: string;
  shift: "Morning" | "Night" | "Flexible";
  status: "active" | "inactive";
};

export type Movement = {
  id?: string;
  date: Date;
  product: string;
  type: "Stock In" | "Stock Out" | "Adjustment";
  qty: number;
  employee: string;
  reference: string;
  status: "Completed" | "Pending" | "Failed";
};

export type Order = {
  id: string;
  customerName: string;
  customerEmail: string;
  itemsCount: number;
  totalAmount: number;
  paymentMethod:
    | "Credit Card"
    | "PayPal"
    | "Cash on Delivery"
    | "Bank Transfer";
  shippingAddress: string;
  orderDate: Date;
  status: "Processing" | "Shipped" | "Delivered" | "Cancelled";
};

export type AccountType =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "EXPENSE";

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  balance: number;
  parentId?: string;
}

export interface JournalEntryLine {
  accountId: string;
  accountName: string;
  debit: number; // مدين
  credit: number; // دائن
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  reference?: string; // رقم الفاتورة أو القيد
  lines: JournalEntryLine[];
}

export interface FormattedTransaction {
  id: string;
  date: string;
  description: string;
  debitAccount: string; // الحساب الأخذ (مدين)
  creditAccount: string; // الحساب المعطي (دائن)
  amount: number;
}
