"use client";

import { ActionIcon } from "@mantine/core";
import { RiArrowLeftSLine, RiArrowRightSLine } from "react-icons/ri";

interface StepArrowButtonProps {
  direction: "prev" | "next";
  label: string; // aria-label, e.g. "前月"
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}

// Sized to match a default (size "sm") Mantine input so it lines up with a labelled input.
export const StepArrowButton = ({
  direction,
  label,
  title,
  disabled = false,
  onClick,
}: StepArrowButtonProps) => (
  <ActionIcon
    variant="default"
    size={36}
    aria-label={label}
    title={title}
    disabled={disabled}
    onClick={onClick}
  >
    {direction === "prev" ? (
      <RiArrowLeftSLine size={20} />
    ) : (
      <RiArrowRightSLine size={20} />
    )}
  </ActionIcon>
);
