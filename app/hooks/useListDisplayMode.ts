"use client";

import { useEffect, useState } from "react";
import { useViewportSize } from "@mantine/hooks";

const MD_BREAKPOINT = 768;

export function useListDisplayMode(defaultShowCards: boolean) {
  const [switchDisplay, setSwitchDisplay] = useState(defaultShowCards);
  const { width } = useViewportSize();
  const [isMobileView, setIsMobileView] = useState(false);

  useEffect(() => {
    setIsMobileView(width < MD_BREAKPOINT);
  }, [width]);

  return {
    switchDisplay,
    setSwitchDisplay,
    isMobileView,
    showCards: isMobileView || switchDisplay,
  };
}
