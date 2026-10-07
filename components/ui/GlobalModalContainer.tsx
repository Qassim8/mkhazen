"use client";

import dynamic from "next/dynamic";
import { useModalStore } from "@/store/useModalStore";

const DeleteConfirmationModal = dynamic(
  () => import("@/components/ui/DeleteConfirmationModal"),
);
const UpdateModal = dynamic(() => import("@/components/ui/UpdateModal"));
const ViewDataModal = dynamic(() => import("@/components/ui/ViewDataModal"));
const AddNewModal = dynamic(() => import("./AddNewModal"));
const ForgotPasswordModal = dynamic(() => import("./ForgotPasswordModal"));

export default function GlobalModalContainer() {
  const { isOpen, type, closeModal } = useModalStore();

  if (!isOpen || !type) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        onClick={closeModal}
        className="absolute inset-0 cursor-pointer bg-black/40 backdrop-blur-sm transition-opacity"
      />

      <div className="relative z-10 w-full max-w-xl">
        {type === "DELETE_CONFIRM" && <DeleteConfirmationModal />}
        {type === "UPDATE" && <UpdateModal />}
        {type === "VIEW" && <ViewDataModal />}
        {type === "CREATE" && <AddNewModal />}
        {type === "FORGOT_PASSWORD" && <ForgotPasswordModal />}
      </div>
    </div>
  );
}
