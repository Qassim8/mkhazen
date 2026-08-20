import { create } from "zustand";

type DeleteRowId = string | number;
type DeleteFunction = (rowId: DeleteRowId) => void | Promise<void>;

type tableState = {
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  toggleOpenMenu: (id: string) => void;
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  deleteConfirmation: boolean;
  deleteRowId: DeleteRowId | null;
  deleteItemName: string | null;
  deleteFunction: DeleteFunction | null;
  showDeleteConfirmation: (
    rowId: DeleteRowId,
    deleteFunction: DeleteFunction,
    itemName?: string,
  ) => void;
  hideDeleteConfirmation: () => void;
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
  deleteRowId: null,
  deleteItemName: null,
  deleteFunction: null,
  showDeleteConfirmation: (rowId, deleteFunction, itemName) =>
    set({
      deleteConfirmation: true,
      deleteRowId: rowId,
      deleteFunction,
      deleteItemName: itemName ?? null,
    }),
  hideDeleteConfirmation: () =>
    set({
      deleteConfirmation: false,
      deleteRowId: null,
      deleteFunction: null,
      deleteItemName: null,
    }),
  sidebarOpen: false,
  sidebarToggler: (open) =>
    set((state) => ({
      sidebarOpen: typeof open === "boolean" ? open : !state.sidebarOpen,
    })),
  newMovement: false,
  showNewMovement: () => set({ newMovement: true }),
  hideNewMovement: () => set({ newMovement: false }),
}));
