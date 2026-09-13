import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Vynalth AI MCP Gateway",
  description: "Secure Model Context Protocol gateway for Vynalth AI Search and approved data tools."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#080b10", color: "#f5f7fa" }}>
        {children}
      </body>
    </html>
  );
}
