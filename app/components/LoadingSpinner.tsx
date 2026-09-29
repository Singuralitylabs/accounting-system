import { Loader, Overlay } from "@mantine/core";
import { overlayBackgroundProps, overlayZIndex } from "../theme";

type CompactLoaderProps = {
  color?: string;
};

export const CompactLoader = ({ color }: CompactLoaderProps) => {
  return (
    <div
      className="flex items-center justify-center"
      role="status"
      aria-label="読み込み中"
    >
      <Loader size="sm" color={color} />
    </div>
  );
};

export const LoadingSpinner = () => {
  return (
    <div
      className="flex h-64 items-center justify-center"
      role="status"
      aria-label="読み込み中"
    >
      <Loader />
    </div>
  );
};

// Only for lazy-loaded modals (next/dynamic loading): modals appear at screen center regardless of the caller's DOM position, so the fallback is fixed at center too (rendering in place causes layout shift). Backdrop uses the same theme values as LoadingOverlay.
export const ModalLoadingFallback = () => {
  return (
    <Overlay
      fixed
      center
      {...overlayBackgroundProps}
      zIndex={overlayZIndex}
      role="status"
      aria-label="読み込み中"
    >
      <Loader />
    </Overlay>
  );
};
