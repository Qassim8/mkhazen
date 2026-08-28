import { create } from "zustand";

type DeleteAction = (id: string | number) => void | Promise<void>;

interface UIState {
  sidebarOpen: boolean;
  openMenuId: string | null;
  newMovement: boolean;
  deleteConfirmation: {
    open: boolean;
    rowId?: string | number;
    itemName?: string;
    action?: DeleteAction;
  };
  sidebarToggler: (open?: boolean) => void;
  setOpenMenuId: (id: string | null) => void;
  toggleOpenMenu: (id: string) => void;
  showNewMovement: () => void;
  hideNewMovement: () => void;
  showDeleteConfirmation: (
    rowId: string | number,
    action: DeleteAction,
    itemName?: string,
  ) => void;
  hideDeleteConfirmation: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  openMenuId: null,
  newMovement: false,
  deleteConfirmation: {
    open: false,
    rowId: undefined,
    itemName: undefined,
    action: undefined,
  },

  sidebarToggler: (open) =>
    set((state) => ({
      sidebarOpen: typeof open === "boolean" ? open : !state.sidebarOpen,
    })),

  setOpenMenuId: (id) => set({ openMenuId: id }),

  toggleOpenMenu: (id) =>
    set((state) => ({
      openMenuId: state.openMenuId === id ? null : id,
    })),

  showNewMovement: () => set({ newMovement: true }),
  hideNewMovement: () => set({ newMovement: false }),

  showDeleteConfirmation: (rowId, action, itemName) =>
    set({
      deleteConfirmation: {
        open: true,
        rowId,
        itemName,
        action,
      },
    }),

  hideDeleteConfirmation: () =>
    set({
      deleteConfirmation: {
        open: false,
        rowId: undefined,
        itemName: undefined,
        action: undefined,
      },
    }),
}));

export const useTable = useUIStore;
