import { extendTheme, type ThemeConfig } from "@chakra-ui/react";

const config: ThemeConfig = {
  initialColorMode: "dark",
  useSystemColorMode: true,
};

const theme = extendTheme({
  config,
  fonts: {
    heading: `'Inter', system-ui, sans-serif`,
    body: `'Inter', system-ui, sans-serif`,
  },
  colors: {
    brand: {
      50: "#e6f2ff",
      100: "#b3d9ff",
      200: "#80bfff",
      300: "#4da6ff",
      400: "#1a8cff",
      500: "#0073e6",
      600: "#005ab3",
      700: "#004280",
      800: "#00294d",
      900: "#00111a",
    },
  },
  components: {
    Button: {
      defaultProps: {
        colorScheme: "brand",
      },
    },
  },
});

export default theme;
