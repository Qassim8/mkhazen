// types
import { Category, Product, StatsCardProps } from "@/types/types";
// icons
import {
  LuBookOpen,
  LuCpu,
  LuShirt,
  LuSofa,
  LuSparkles,
  LuWrench,
  LuBoxes,
  LuDollarSign,
  LuRefreshCcw,
  LuTriangleAlert,
} from "react-icons/lu";

export const actions = [
  { name: "Add Product", href: "/products/new" },
  { name: "New Sale", href: "/pos" },
  { name: "Stock Adjustment", href: "/warehouse" },
  { name: "Genarate Report", href: "/reports" },
];

export const activities = [
  {
    name: "new product to stock",
    responsable: "eglal omar",
    time: "10m ago",
  },
  {
    name: "adjusted inventory",
    responsable: "omar ahmad",
    time: "55m ago",
  },
  {
    name: "fulfilled order",
    responsable: "yusuf faris",
    time: "2h ago",
  },
  {
    name: "flagged low stock",
    responsable: "omar ahmad",
    time: "5h ago",
  },
];

export const statsData: StatsCardProps[] = [
  {
    title: "Total Revenue",
    value: "$12,345",
    icon: LuRefreshCcw,
    iconBg: "#df346a",
    statNumber: 3.7,
    statType: "increase",
  },
  {
    title: "Net Profit",
    value: "$2,345",
    icon: LuDollarSign,
    iconBg: "#13a390",
    statNumber: 0,
    statType: "increase",
  },
  {
    title: "Active Orders",
    value: "150",
    icon: LuBoxes,
    iconBg: "#b547d6",
    statNumber: 12.8,
    statType: "increase",
  },
  {
    title: "Low Stock",
    value: "7",
    icon: LuTriangleAlert,
    iconBg: "#f5a50f",
    statNumber: 15.2,
    statType: "decrease",
  },
];

// Categories
export const categories: Category[] = [
  {
    id: 1,
    icon: LuCpu,
    color: "#1151b8",
    title: "Electronics",
    products: 230,
  },
  {
    id: 2,
    icon: LuShirt,
    color: "var(--primary-red)",
    title: "Cloths",
    products: 370,
  },
  {
    id: 3,
    icon: LuSofa,
    color: "#e09626",
    title: "Furniture",
    products: 80,
  },
  {
    id: 4,
    icon: LuWrench,
    color: "#57575a",
    title: "Tools",
    products: 150,
  },
  {
    id: 5,
    icon: LuSparkles,
    color: "var(--primary-pink)",
    title: "Beauty",
    products: 230,
  },
  {
    id: 6,
    icon: LuBookOpen,
    color: "#3bcb3b",
    title: "Libarary",
    products: 100,
  },
];

// Products
export const products: Product[] = [
  {
    id: "1",
    name: "Ceramic Pour-Over Kettle",
    image:
      "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=100&q=80",
    sku: "BEV-KTL-003",
    category: "Beverages",
    supplier: "Atlas Distribution",
    qty: 62,
    price: 48.0,
    status: "In stock",
  },
  {
    id: "2",
    name: "Cold Brew Coffee Maker",
    image:
      "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=100&q=80",
    sku: "BEV-CBM-010",
    category: "Beverages",
    supplier: "Atlas Distribution",
    qty: 33,
    price: 39.0,
    status: "In stock",
  },
  {
    id: "3",
    name: "Compact Mirrorless Camera",
    image:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=100&q=80",
    sku: "CAM-MIR-006",
    category: "Cameras",
    supplier: "Kyoto Supply Co.",
    qty: 8,
    price: 899.0,
    status: "Low stock",
  },
  {
    id: "4",
    name: "Cordless Drill Kit",
    image:
      "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=100&q=80",
    sku: "TLS-DRL-005",
    category: "Tools",
    supplier: "Brisbane Wholesale",
    qty: 41,
    price: 179.5,
    status: "In stock",
  },
  {
    id: "5",
    name: "Hardcover Design Anthology",
    image:
      "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=100&q=80",
    sku: "BOK-DSN-008",
    category: "Books",
    supplier: "Nordwind Trading",
    qty: 210,
    price: 42.0,
    status: "In stock",
  },
  {
    id: "6",
    name: "Linen Table Lamp",
    image:
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=100&q=80",
    sku: "HOM-LMP-007",
    category: "Home & Lighting",
    supplier: "Atlas Distribution",
    qty: 55,
    price: 74.0,
    status: "In stock",
  },
  {
    id: "7",
    name: "Mechanical Keyboard 75%",
    image:
      "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=100&q=80",
    sku: "ELE-KEY-002",
    category: "Electronics",
    supplier: "Nordwind Trading",
    qty: 14,
    price: 139.9,
    status: "Low stock",
  },
];
