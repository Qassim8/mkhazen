import { categories } from "@/data/data";
import { NextResponse } from "next/server";

export const GET = async () => {
  return NextResponse.json(categories);
};

export const POST = async (request: Request) => {
  const { color, title, icon, products } = await request.json();

  const newCategory = {
    id: categories.length + 1,
    color,
    title,
    icon,
    products,
  };

  categories.push(newCategory);

  return new NextResponse(JSON.stringify(newCategory), {
    headers: { "Content-Type": "application/json" },
    status: 201,
  });
};
