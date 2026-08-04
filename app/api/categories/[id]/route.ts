import { categories } from "@/data/data";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const GET = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

  const category = categories.find((cat) => parseInt(id) === cat.id);

  return NextResponse.json(category);
};

export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const data = await request.json();
  const header = await headers();

  const agent = header.get("user-agent");

  if (agent) return NextResponse.json({ message: `${agent}` }, { status: 401 });

  let category = categories.find((cat) => parseInt(id) === cat.id);

  if (category) {
    category = {
      id: parseInt(id),
      title: data.title || category.title,
      icon: data.icon || category.icon,
      color: data.color || category.color,
      products: data.products || category.products,
    };
  }

  return NextResponse.json(category);
};

export const DELETE = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

  const category = categories.findIndex((cat) => cat.id === parseInt(id));

  categories.splice(category, 1);

  return NextResponse.json(
    { message: `category no-${category} has been deleted succefully` },
    { status: 200 },
  );
};
