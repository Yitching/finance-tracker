import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Lazy Ledger",
        short_name: "Ledger",
        description: "Expense tracking for people who hate expense tracking.",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f6f3ee",
        theme_color: "#0f8a6a",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // Long-press the home-screen icon on Android
        shortcuts: [{ name: "Quick add", short_name: "Add", url: "/?add=1" }],
      },
      workbox: {
        // Never cache Supabase API calls; always go to the network for data.
        navigateFallbackDenylist: [/^\/auth/],
        runtimeCaching: [],
      },
    }),
  ],
});
