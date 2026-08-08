import { create } from "zustand";

type tableState = {
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  toggleOpenMenu: (id: string) => void;
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  deleteConfirmation: boolean;
  showDeleteConfirmation: () => void;
  onCancel: () => void;
  sidebarOpen: boolean;
  sidebarToggler: (open?: boolean) => void;
  newMovement: boolean;
  showNewMovement: () => void;
  hideNewMovement: () => void;
};

export const useTable = create<tableState>((set) => ({
  openMenuId: null,
  setOpenMenuId: (id) => set({ openMenuId: id }),
  toggleOpenMenu: (id) =>
    set((state) => ({
      openMenuId: state.openMenuId === id ? null : id,
    })),
  isOpen: false,
  openModal: () => set({ isOpen: true }),
  closeModal: () => set({ isOpen: false }),
  deleteConfirmation: false,
  showDeleteConfirmation: () => set({ deleteConfirmation: true }),
  onCancel: () => set({ deleteConfirmation: false }),
  sidebarOpen: false,
  sidebarToggler: (open) =>
    set((state) => ({
      sidebarOpen: typeof open === "boolean" ? open : !state.sidebarOpen,
    })),
  newMovement: false,
  showNewMovement: () => set({ newMovement: true }),
  hideNewMovement: () => set({ newMovement: false }),
}));
