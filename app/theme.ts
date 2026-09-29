import { createTheme } from "@mantine/core";

/** LoadingOverlay backdrop (darkness, blur) and z-index; shared with the next/dynamic loading fallback (ModalLoadingFallback) so both look the same. */
export const overlayBackgroundProps = { backgroundOpacity: 0.55, blur: 2 };
export const overlayZIndex = 400;

/** Loader / LoadingOverlay appearance is set only here; passed to MantineProvider in layout. */
export const theme = createTheme({
  components: {
    Loader: {
      defaultProps: {
        type: "oval",
        size: "lg",
        color: "blue",
      },
    },
    LoadingOverlay: {
      defaultProps: {
        transitionProps: { duration: 0 },
        overlayProps: overlayBackgroundProps,
        loaderProps: {
          type: "oval",
          size: "lg",
          color: "blue",
          role: "status",
          "aria-label": "読み込み中",
        },
        zIndex: overlayZIndex,
      },
    },
  },
});
