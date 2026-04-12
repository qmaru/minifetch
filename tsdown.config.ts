import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  treeshake: true,
  clean: true,
  minify: false,
})
