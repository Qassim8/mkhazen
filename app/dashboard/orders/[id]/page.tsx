import { notFound } from "next/navigation";
import { getPurchaseOrderById } from "../services/order.services";
import PurchaseOrderDetailView from "../_components/PurchaseOrderDetails";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PurchaseOrderDetailPage({ params }: Props) {
  const { id } = await params;

  const orderRes = await getPurchaseOrderById(id).catch(() => null);

  if (!orderRes || !orderRes.data) {
    notFound();
  }

  return (
    <div className="space-y-5 mb-5">
      <PurchaseOrderDetailView order={orderRes.data} />
    </div>
  );
}
