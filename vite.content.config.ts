import { resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, "src/content/carrefour-coupons.ts"),
      output: {
        format: "iife",
        name: "CarrefourCouponContent",
        entryFileNames: "content/carrefour-coupons.js",
        inlineDynamicImports: true
      }
    }
  }
})
