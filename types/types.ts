import { IconType } from "react-icons";

export type StatsCardProps = {
  title: string;
  value: string;
  icon: IconType;
  iconBg?: string;
  statNumber: number;
  statType: "increase" | "decrease" | "neutral";
};

export interface Category {
  id: string;
  name: string;
  title?: string;
  icon?: string;
  color?: string;
  description?: string | null;
  imageUrl?: string | null;
  productsCount?: number;
  products?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  image?: string;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  categoryId?: string | null;
  supplier?: string | null;
  supplierId?: string | null;
  qty?: number;
  price?: number;
  status?: "In stock" | "Low stock" | "Out of stock" | string;
  purchasePrice?: number;
  sellingPrice?: number;
  stockQuantity?: number;
  minStockLevel?: number | null;
  purchaseUnit?: string | null;
  sellingUnit?: string | null;
  conversionFactor?: number | null;
  length?: string | null;
  width?: string | null;
  minSellingPrice?: number | null;
  sizes?: string[];
  images?: string[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Employee {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  position?: "system_manager" | "tailor" | "cashier";
  salary?: number;
  commissionRate?: number;
  address?: string;
  shift?: "morning" | "night" | "full_time" | "Morning" | "Night" | "Flexible";
  role?: "admin" | "tailor" | "cashier";
  status?: "active" | "inactive";
  isActive?: "TRUE" | "FALSE" | boolean;
  resetRequested?: boolean;
  job?: string;
  department?: string;
}

export interface Supplier {
  id: string;
  name?: string;
  companyName?: string;
  email?: string | string[] | null;
  phone?: string | string[] | null;
  address?: string | null;
  location?: string[];
  contactPerson?: string | null;
  contact?: string[];
  products?: number;
  status?: "active" | "inactive";
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

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
