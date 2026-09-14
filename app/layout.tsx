import type { ReactNode } from "react";

export const metadata = {
  title: "Pourdebon Gestion",
  description: "Backend de gestion Pourdebon pour Pasta Piemonte",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0 }}>
        <nav style={{ background: "#26231f", color: "white", padding: "10px 18px", fontFamily: "Arial, Helvetica, sans-serif" }}>
          <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ marginRight: 8 }}>Pourdebon Gestion</strong>
            <a href="/" style={{ color: "white", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>Prix frais</a>
            <a href="/ravioli-750" style={{ color: "white", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>Ravioli 750 g</a>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
