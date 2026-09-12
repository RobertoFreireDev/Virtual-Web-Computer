import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The app is loaded into its own JSDOM instance by helpers/app.js,
    // so the vitest environment itself stays plain node.
    environment: "node",
    include: ["unit/**/*.test.js"],
    testTimeout: 10000
  }
});
