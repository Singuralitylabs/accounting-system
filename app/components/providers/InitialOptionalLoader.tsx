"use client";

import { optionsAtom } from "@/app/atoms/optionsAtom";
import { useSetAtom } from "jotai";
import { useEffect } from "react";

interface Props {
  initialOptions: {
    teamList: string[];
    categoryList: string[];
    itemList: string[];
    certificateList: string[];
  };
}

export const InitialOptionsLoader = ({ initialOptions }: Props) => {
  const setOptions = useSetAtom(optionsAtom);

  useEffect(() => {
    setOptions(initialOptions);
  }, []);

  return null;
};
