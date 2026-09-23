import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Cifron AI", description: "Интеллектуальная карта движения денег для AML-аналитика" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ru"><body>{children}</body></html>; }
