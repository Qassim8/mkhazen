import { IconType } from "react-icons";

export type StatsCardProps = {
  title: string;
  value: string;
  icon: React.ReactNode;
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
  sku?: string;
  category?: string;
  supplier?: string;
  qty?: number;
  price: number;
  status?: "In stock" | "Low stock" | "Out of stock";
};
