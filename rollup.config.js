import typescript from "@rollup/plugin-typescript";
import json from "@rollup/plugin-json";
import del from "rollup-plugin-delete";
import pkg from "./package.json";
const isProduction = process.env.NODE_ENV === "production";

export default (async () => ({
  input: "src/index.ts",
  output: [
    {
      dir: "lib/commonjs",
      format: "cjs",
    },
    {
      dir: "lib/module",
      format: "esm",
    },
  ],
  external: Object.keys(pkg.dependencies || {}),
  plugins: [
    del({
      targets: ["lib"],
    }),
    typescript(),
    json(),
    isProduction && (await import("rollup-plugin-terser")).terser(),
  ],
}))();
