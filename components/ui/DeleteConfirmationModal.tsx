import { useTable } from "@/store/useTable";
import { LuTriangleAlert } from "react-icons/lu";

interface DeleteProps {
  show: string;
  itemName: string;
  onConfirm: () => void;
}

export default function DeleteConfirmation({
  show,
  itemName,
  onConfirm,
}: DeleteProps) {
  const onCancel = useTable((state) => state.onCancel);

  return (
    <div className="space-y-6 text-center py-4">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 border border-red-100">
        <LuTriangleAlert className="h-6 w-6" />
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-bold text-gray-950">
          Are you absolutely sure?
        </h3>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          You are about to delete{" "}
          <span className="font-semibold text-gray-900">"{itemName}"</span>.
          This action cannot be undone and will remove all associated data.
        </p>
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-gray-100 pt-5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition"
        >
          Yes, Delete Item
        </button>
      </div>
    </div>
  );
}
