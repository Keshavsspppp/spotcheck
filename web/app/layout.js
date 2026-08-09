import { Archivo, Space_Mono } from "next/font/google";
import Heartbeat from "@/components/Heartbeat";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata = {
  title: "SpotCheck",
  description: "Live occupancy tracking for campus locations",
};

export const viewport = {
  themeColor: "#14171b",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${archivo.variable} ${spaceMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-board text-paper font-sans">
        <Heartbeat />
        {children}
      </body>
    </html>
  );
}
