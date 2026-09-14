import type { ReactNode } from "react";
import CitronSafetyPanel from "./CitronSafetyPanel";

export const metadata = {
  title: "Pourdebon Gestion",
  description: "Backend de gestion Pourdebon pour Pasta Piemonte",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0 }}>
        {children}
        <CitronSafetyPanel />
      </body>
    </html>
  );
}
