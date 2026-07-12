# Troubleshooting (v0.99)

| Symptom | Check |
|---------|-------|
| API 503 ready | Database / queue `down` on `/ready` |
| encryption degraded | Set `ENCRYPTION_KEY` on Railway |
| 429 RATE_LIMITED | Respect `Retry-After` |
| Web blank after deploy | Confirm `VITE_API_URL` is Railway URL (not localhost) |
| Integrations connect fails in prod | ENCRYPTION_KEY required for credential write |
| CI skipped deploy | Missing Railway/Netlify secrets |

Also see `docs/troubleshooting.md`.
