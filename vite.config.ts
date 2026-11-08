/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // the backend: cd backend && .venv/bin/uvicorn app:app --reload
  server: { proxy: { "/api": { target: "http://127.0.0.1:8000", rewrite: (p) => p.replace(/^\/api/, "") } } },
  test: { environment: "node" },
});
