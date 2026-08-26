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
  description?: string | null;
  imageUrl?: string | null;
  productsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}
export type CreateCategoryInput = Omit<
  Category,
  "id" | "createdAt" | "updatedAt"
>;
export type UpdateCategoryInput = Partial<CreateCategoryInput>;

export interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  contactPerson?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  description?: string | null;

  images: string[]; // مصفوفة روابط الصور
  sizes: string[]; // مصفوفة المقاسات المتوفرة

  purchasePrice: number;
  sellingPrice: number;
  minSellingPrice?: number | null;

  stockQuantity: number;
  minStockLevel?: number | null;

  purchaseUnit: string;
  sellingUnit: string;

  categoryId?: string | null;
  supplierId?: string | null;

  category?: { id: string; name: string } | null;
  supplier?: { id: string; name: string } | null;

  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProductFormInput = Omit<
  Product,
  "id" | "createdAt" | "updatedAt" | "category" | "supplier"
>;

export type Employee = {
  id: string;
  name: string;
  phone: string;
  email: string;
  position: "system_manager" | "tailor" | "cashier";
  salary: number;
  commissionRate: number;
  address?: string;
  shift: "morning" | "night" | "full_time";
  role: "admin" | "tailor" | "cashier";
  status: "active" | "inactive";
  isActive: "TRUE" | "FALSE" | boolean;
  resetRequested: boolean;
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
