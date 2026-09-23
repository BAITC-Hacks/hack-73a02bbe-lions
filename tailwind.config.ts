import type { Config } from "tailwindcss";
const config: Config = { content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"], theme: { extend: { colors: { ink: "#080b12", panel: "#101621", line: "#1e2938" } } }, plugins: [] };
export default config;
