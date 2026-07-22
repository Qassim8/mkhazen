import { IconType } from "react-icons";

export type ProductStatus = "In Stock" | "Low Stock" | "Out of Stock";
export type MovementType = "In" | "Out" | "Transfer" | "Adjustment";
export type MovementState = "Inbound" | "Outbound" | "Restricted" | "Pending";
export type UserRole = "Admin" | "Manager" | "Sales" | "Warehouse";

export interface Product {
  id: number;
  name: string;
  sku: string;
  category: string;
  supplier: string;
  stock: number;
  price: number;
  status: ProductStatus;
  image: string;
  description: string;
  location: string;
  reorderLevel: number;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  productCount: number;
  description: string;
}

export interface Supplier {
  id: number;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  productCount: number;
  active: boolean;
  leadTime: string;
}

export interface Movement {
  id: number;
  date: string;
  product: string;
  type: MovementType;
  state: MovementState;
  quantity: number;
  employee: string;
  reference: string;
}

export interface DashboardEvent {
  id: number;
  title: string;
  detail: string;
  time: string;
}

export interface FinanceMetric {
  icon?: IconType | React.ReactNode;
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
}

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: "Active" | "Pending";
}

export interface SettingsState {
  enableSku: boolean;
  enableBarcode: boolean;
  theme: "default" | "dark" | "light";
}
