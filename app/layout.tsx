import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Congreso ARQ 2026 | Galería Oficial",
  description: "Galería oficial y en vivo del Día Nacional del Arquitecto 2026 en Guasave, Sinaloa.",
  icons: {
    // Esto tomará el logo que ya subiste a public y lo pondrá en la pestaña del navegador
    icon: '/logo-arq.png', 
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}