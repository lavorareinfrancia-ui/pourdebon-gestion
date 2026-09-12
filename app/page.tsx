export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 760, margin: "64px auto", padding: "0 24px" }}>
      <h1>Pourdebon Gestion</h1>
      <p>Backend sécurisé pour l’intégration Pasta Piemonte ↔ Pourdebon/Mirakl.</p>
      <p>Premier endpoint en lecture seule : <code>/api/pourdebon/offers</code></p>
    </main>
  );
}
