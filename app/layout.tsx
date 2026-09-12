import type { ReactNode } from "react";

export const metadata = {
  title: "Pourdebon Gestion",
  description: "Backend de gestion Pourdebon pour Pasta Piemonte",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
