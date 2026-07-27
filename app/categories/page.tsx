import React from "react";
import {
  LuBookOpen,
  LuCpu,
  LuPencilRuler,
  LuShirt,
  LuSofa,
  LuSparkles,
  LuWrench,
} from "react-icons/lu";
import Card from "./(components)/Card";

export type Category = {
  id: number | string;
  icon: React.ReactNode;
  color: string;
  title: string;
  products: number;
};

const categories: Category[] = [
  {
    id: 1,
    icon: <LuCpu />,
    color: "#1151b8",
    title: "Electronics",
    products: 230,
  },
  {
    id: 2,
    icon: <LuShirt />,
    color: "var(--primary-red)",
    title: "Cloths",
    products: 370,
  },
  {
    id: 3,
    icon: <LuSofa />,
    color: "#e09626",
    title: "Furniture",
    products: 80,
  },
  {
    id: 4,
    icon: <LuWrench />,
    color: "#57575a",
    title: "Tools",
    products: 150,
  },
  {
    id: 5,
    icon: <LuSparkles />,
    color: "var(--primary-pink)",
    title: "Beauty",
    products: 230,
  },
  {
    id: 6,
    icon: <LuBookOpen />,
    color: "#3bcb3b",
    title: "Libarary",
    products: 100,
  },
];

const Categories = () => {
  return (
    <div>
      <div className="grid grid-cols-4 gap-5">
        {categories.map((cat) => (
          <Card
            key={cat.id}
            id={cat.id}
            icon={cat.icon}
            title={cat.title}
            color={cat.color}
            products={cat.products}
          />
        ))}
      </div>
    </div>
  );
};

export default Categories;
