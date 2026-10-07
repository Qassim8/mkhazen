import { create } from "zustand";

export type ModalType =
  | "DELETE_CONFIRM"
  | "UPDATE"
  | "VIEW"
  | "CREATE"
  | "NEW_MOVEMENT"
  | "FORGOT_PASSWORD";

type RowId = string | number;
type ActionFunction<T = any> = (id: T) => void | Promise<any>;

interface ModalData {
  rowId?: RowId;
  itemName?: string;
  selectedRow?: any;
  actionFunction?: ActionFunction<any>;
  title?: string;
  [key: string]: any;
}

interface ModalState {
  isOpen: boolean;
  type: ModalType | null;
  data: ModalData;
  openModal: (type: ModalType, data?: ModalData) => void;
  closeModal: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  isOpen: false,
  type: null,
  data: {},

  openModal: (type, data = {}) =>
    set({
      isOpen: true,
      type,
      data,
    }),

  closeModal: () =>
    set({
      isOpen: false,
      type: null,
      data: {},
    }),
}));
