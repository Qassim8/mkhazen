"use client";

import SupplierModalContent from "./SupplierModalContent";
import { Supplier } from "../schemas/supplier.schemas";

interface SupplierUpdateModalProps {
  initialData: Supplier;
}

export default function SupplierUpdateModal({
  initialData,
}: SupplierUpdateModalProps) {
  return <SupplierModalContent initialData={initialData} />;
}
