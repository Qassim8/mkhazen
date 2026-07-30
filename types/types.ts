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
  icon: IconType;
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
