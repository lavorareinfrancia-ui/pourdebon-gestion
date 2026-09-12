# Pourdebon Gestion

Backend Next.js dédié à Pasta Piemonte pour intégrer l'API vendeur Pourdebon/Mirakl.

## MVP

- OF21 en lecture seule (`GET /api/offers`)
- Pagination `max` + `offset`
- Secret API côté serveur uniquement
- Aucun endpoint d'écriture activé

## Variables d'environnement

- `POURDEBON_API_KEY`
- `POURDEBON_BASE_URL` (par défaut `https://vendeur.pourdebon.com`)

## Endpoint interne

`GET /api/pourdebon/offers?max=100&offset=0`
