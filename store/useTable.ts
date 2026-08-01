import { create } from "zustand";

type tableState = {
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  toggleOpenMenu: (id: string) => void;
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
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
}));
