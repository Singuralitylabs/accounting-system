import { createTheme } from "@mantine/core";

/**
 * LoadingOverlay の背景（暗さ・ぼかし）と z-index。
 * next/dynamic の loading fallback（ModalLoadingFallback）でも
 * 同じ見た目にするため、ここから参照する。
 */
export const overlayBackgroundProps = { backgroundOpacity: 0.55, blur: 2 };
export const overlayZIndex = 400;

/** Loader / LoadingOverlay の見た目はここだけで変える。layout の MantineProvider に渡す。 */
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
