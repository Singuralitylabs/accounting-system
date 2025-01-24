import { atom } from "jotai";

export const optionsAtom = atom({
  teamList: [] as string[],
  categoryList: [] as string[],
  itemList: [] as string[],
  certificateList: [] as string[],
});
