import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Cambia NOMBRE_DEL_REPO por el nombre real de tu repositorio en GitHub.
export default defineConfig({
  plugins: [react()],
  base: "/droneapp/",
});
