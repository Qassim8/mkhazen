import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  openMenuId: string | null;
  sidebarToggler: (open?: boolean) => void;
  setOpenMenuId: (id: string | null) => void;
  toggleOpenMenu: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  openMenuId: null,

  sidebarToggler: (open) =>
    set((state) => ({
      sidebarOpen: typeof open === "boolean" ? open : !state.sidebarOpen,
    })),

  setOpenMenuId: (id) => set({ openMenuId: id }),

  toggleOpenMenu: (id) =>
    set((state) => ({
      openMenuId: state.openMenuId === id ? null : id,
    })),
}));
