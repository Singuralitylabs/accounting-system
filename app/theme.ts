import { createTheme } from "@mantine/core";

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
        overlayProps: { backgroundOpacity: 0.55, blur: 2 },
        loaderProps: { type: "oval", size: "lg", color: "blue" },
        zIndex: 400,
      },
    },
  },
});
