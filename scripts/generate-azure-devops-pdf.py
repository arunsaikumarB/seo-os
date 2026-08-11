#!/usr/bin/env python3
"""Generate Backlink Agent Azure QA DevOps handoff PDF."""

from pathlib import Path

from fpdf import FPDF

OUT = Path(__file__).resolve().parents[1] / "docs" / "Backlink-Agent-Azure-QA-DevOps-Handoff.pdf"


class Doc(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(90, 90, 90)
        self.cell(self.epw - 20, 6, "Backlink Agent - Azure QA DevOps Handoff", align="L")
        self.cell(20, 6, f"{self.page_no()}", align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(200, 200, 200)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4)
        self.set_text_color(0, 0, 0)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, "Internal - for DevOps / Azure QA. Do not commit secrets.", align="C")

    def _mc(self, h: float, text: str, **kwargs):
        self.set_x(self.l_margin)
        self.multi_cell(self.epw, h, text, new_x="LMARGIN", new_y="NEXT", **kwargs)

    def h1(self, text: str):
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(15, 40, 80)
        self._mc(8, text)
        self.ln(2)
        self.set_text_color(0, 0, 0)

    def h2(self, text: str):
        self.ln(2)
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(20, 60, 110)
        self._mc(7, text)
        self.ln(1)
        self.set_text_color(0, 0, 0)

    def h3(self, text: str):
        self.ln(1)
        self.set_font("Helvetica", "B", 10)
        self._mc(6, text)

    def body(self, text: str):
        self.set_font("Helvetica", "", 9)
        self._mc(5, text)
        self.ln(1)

    def bullet(self, text: str):
        self.set_font("Helvetica", "", 9)
        self._mc(5, f"  -  {text}")

    def code(self, text: str):
        self.set_font("Courier", "", 8)
        self.set_fill_color(245, 247, 250)
        self.set_text_color(30, 30, 30)
        self._mc(4.5, text, fill=True)
        self.set_text_color(0, 0, 0)
        self.set_font("Helvetica", "", 9)
        self.ln(2)

    def kv_table(self, rows: list[tuple[str, str]], col1=55):
        self.set_font("Helvetica", "B", 8)
        self.set_fill_color(230, 238, 248)
        w2 = self.epw - col1
        self.cell(col1, 6, "Item", border=1, fill=True)
        self.cell(w2, 6, "Detail", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 8)
        fill = False
        for a, b in rows:
            if fill:
                self.set_fill_color(248, 248, 248)
            else:
                self.set_fill_color(255, 255, 255)
            # Prefer simple single-line rows; wrap detail with multi_cell via text()
            self._mc(5, f"  {a}  |  {b}", border=1, fill=fill)
            fill = not fill
        self.ln(2)


def build():
    pdf = Doc(format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(16, 16, 16)
    pdf.add_page()

    # Cover
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(15, 40, 80)
    pdf.ln(20)
    pdf._mc(10, "Backlink Agent")
    pdf.set_font("Helvetica", "B", 14)
    pdf._mc(8, "Azure QA Deployment Handoff")
    pdf.set_text_color(80, 80, 80)
    pdf.set_font("Helvetica", "", 10)
    pdf.ln(4)
    pdf._mc(
        5,
        "For DevOps / Platform Engineering\n"
        "Product: Backlink Agent (repo: arunsaikumarB/seo-os)\n"
        "Branch: master\n"
        "Purpose: Deploy QA on Azure when Railway API is unavailable\n"
        "Document version: 2026-08-11",
    )
    pdf.ln(6)
    pdf.set_fill_color(255, 244, 220)
    pdf.set_text_color(100, 60, 0)
    pdf.set_font("Helvetica", "B", 9)
    pdf._mc(
        5,
        "IMPORTANT: Railway API trial has expired. Do not point QA at the old Railway URL. "
        "Netlify production may still reference the dead API until rebuilt against Azure.",
        fill=True,
    )
    pdf.set_text_color(0, 0, 0)

    # 1 Purpose
    pdf.add_page()
    pdf.h1("1. Purpose of this document")
    pdf.body(
        "This handoff explains how to deploy Backlink Agent QA on Azure, what infrastructure "
        "pieces are required, why Docker and Supabase appear in the stack, and the issues you "
        "are most likely to hit. It is written so DevOps can unblock Azure QA without reverse-"
        "engineering the monorepo."
    )
    pdf.h2("In scope")
    for t in [
        "API container build/push to Azure Container Registry (ACR)",
        "API hosting on Azure Container Apps or App Service (Linux container)",
        "Web static hosting (Azure Static Web Apps or App Service)",
        "Supabase (Auth + Postgres + Storage) for QA",
        "Required environment variables, migrations, CORS, Auth redirects",
        "Smoke tests and common failure modes",
    ]:
        pdf.bullet(t)
    pdf.h2("Out of scope / not required for QA")
    for t in [
        "Rewriting the app to remove Supabase",
        "Running the full product only in Docker Compose on Azure",
        "Chrome Web Store publish of the Companion extension",
        "Production cutover / DNS for public brand domains",
    ]:
        pdf.bullet(t)

    # 2 Architecture
    pdf.h1("2. Target QA architecture")
    pdf.code(
        "Browser\n"
        "  -> Azure Web (HTTPS static)     apps/web Vite build -> dist/\n"
        "  -> Azure API (HTTPS container)  apps/api/Dockerfile  port 3001\n"
        "       -> Supabase cloud (Auth + Postgres + Storage)  [recommended for QA]\n"
        "       -> Optional LLM / provider keys"
    )
    pdf.kv_table(
        [
            ("Web", "Azure Static Web Apps OR App Service static site from apps/web/dist"),
            ("API", "Container Apps OR App Service (Linux) from apps/api/Dockerfile"),
            ("Auth + DB", "Prefer existing Supabase cloud project for QA speed"),
            ("Workers", "Same API container with ENABLE_WORKERS=true"),
            ("Browsers", "Playwright Chromium baked into API image (needs RAM/CPU)"),
        ]
    )
    pdf.body(
        "Local developer machines mirror this: Vite on :5173, API on :3001, Supabase CLI "
        "on :54321/:54322. Local Docker is for Supabase/pgAdmin helpers - not because the "
        "whole app must run in Compose on Azure."
    )

    # 3 Why Docker / Supabase
    pdf.h1("3. Why Docker and Supabase (FAQ for DevOps)")
    pdf.h2("Why Docker locally?")
    pdf.body(
        "Local Docker is infrastructure only. Supabase CLI starts Postgres/Auth/Storage as "
        "containers (requires Docker Desktop). Optional docker compose service provides "
        "pgAdmin. The API and web apps run with Node (npm run dev) on the host."
    )
    pdf.h2("Why a Dockerfile for the API?")
    pdf.body(
        "Production/QA API needs Playwright + Chromium for link probing and browser "
        "automation. The image is based on mcr.microsoft.com/playwright:v1.49.1-jammy so "
        "browser OS dependencies match. This is the artifact Azure should run - not a "
        "bare node process without browsers."
    )
    pdf.h2("Are we still using Supabase after going local?")
    pdf.body(
        "Yes. Local uses Supabase CLI (local stack). QA/Azure should use a cloud Supabase "
        "project. Same Auth/DB/SDK surface; only the host changes. Completely removing "
        "Supabase means rewriting Auth, data access, and Realtime - not a config change."
    )
    pdf.h2("What is Supabase CLI?")
    pdf.body(
        "A command-line tool that runs a local Supabase stack and manages migrations: "
        "supabase start / status / stop, and supabase db push against a linked project."
    )

    # 4 Build API
    pdf.h1("4. Build and push API container")
    pdf.body("Build context must be the repository root (monorepo).")
    pdf.code(
        "# from repo root\n"
        "docker build -f apps/api/Dockerfile -t backlink-agent-api:qa .\n"
        "az acr login --name <yourAcr>\n"
        "docker tag backlink-agent-api:qa <yourAcr>.azurecr.io/backlink-agent-api:qa\n"
        "docker push <yourAcr>.azurecr.io/backlink-agent-api:qa"
    )
    pdf.kv_table(
        [
            ("Listen port", "3001 (EXPOSE 3001; app listens on 0.0.0.0)"),
            ("Health", "GET /health  ->  {\"status\":\"ok\",...}"),
            ("Version", "GET /v1/version"),
            ("Suggested size", "2 vCPU / 4 GB+ RAM (Playwright)"),
            ("Startup", "ensure-playwright-browsers then node apps/api/dist/index.js"),
        ]
    )
    pdf.body(
        "Azure Container Apps / App Service: map ingress to container port 3001. "
        "Increase startup probe timeout - Chromium ensure step can take time on cold start."
    )

    # 5 Env
    pdf.h1("5. API environment variables (Azure)")
    pdf.body("Set in Container Apps / App Service configuration. Never commit secrets.")
    pdf.kv_table(
        [
            ("NODE_ENV", "production"),
            ("PORT", "3001"),
            ("SUPABASE_URL", "QA Supabase project URL"),
            ("SUPABASE_ANON_KEY", "QA anon key"),
            ("SUPABASE_SERVICE_ROLE_KEY", "Server only - never put in web"),
            ("SUPABASE_JWT_SECRET", "Must match Supabase JWT secret"),
            ("DATABASE_URL", "Postgres URI (pooler or direct)"),
            ("CORS_ORIGIN", "Exact QA web origin(s), comma-separated HTTPS URLs"),
            ("PROVIDER_MODE", "mvp unless live providers required"),
            ("ENABLE_WORKERS", "true for probe / submission / browser jobs"),
            ("PLAYWRIGHT_BROWSERS_PATH", "/ms-playwright (image default)"),
            ("PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL", "0"),
        ],
        col1=70,
    )
    pdf.body("Add provider keys (Gemini/OpenAI/etc.) as required by the QA org.")

    # 6 Migrations
    pdf.h1("6. Database migrations")
    pdf.body(
        "SQL migrations live under supabase/migrations/ (including 109_schema_grants.sql). "
        "Apply against the QA Supabase project before first user signup/org create."
    )
    pdf.code(
        "npx supabase link --project-ref <qa-project-ref>\n"
        "npx supabase db push"
    )
    pdf.set_fill_color(255, 235, 235)
    pdf.set_font("Helvetica", "B", 9)
    pdf._mc(
        5,
        'CRITICAL: Without 109_schema_grants.sql, org create / profile writes fail with '
        '"permission denied for table profiles".',
        fill=True,
    )
    pdf.set_font("Helvetica", "", 9)
    pdf.ln(2)

    # 7 Web
    pdf.h1("7. Web (static) build and deploy")
    pdf.body(
        "Vite bakes VITE_* variables at BUILD TIME. Changing the API URL later requires a rebuild."
    )
    pdf.code(
        "cd apps/web\n"
        "# set before build:\n"
        "# VITE_SUPABASE_URL=https://<qa>.supabase.co\n"
        "# VITE_SUPABASE_ANON_KEY=<qa-anon>\n"
        "# VITE_API_URL=https://<qa-api-host>\n"
        "npm run build\n"
        "# output: apps/web/dist"
    )
    pdf.body(
        "Deploy apps/web/dist to Azure Static Web Apps, Blob+CDN, or App Service static site. "
        "Ensure SPA fallback routes to index.html for client-side routing."
    )

    # 8 Auth redirects
    pdf.h1("8. Supabase Auth URL configuration")
    pdf.body("Supabase Dashboard -> Authentication -> URL configuration:")
    pdf.bullet("Site URL = QA web origin (HTTPS)")
    pdf.bullet("Redirect URLs include https://<qa-web>/**")
    pdf.bullet("Keep http://localhost:5173/** if developers still use local web against QA Auth")
    pdf.body(
        "Mismatch here causes login/signup redirect failures that look like \"Auth is broken\" "
        "but are configuration only."
    )

    # 9 Challenges
    pdf.h1("9. Challenges you may hit on Azure (and fixes)")
    challenges = [
        (
            "Container OOM / Chromium crash",
            "Playwright needs memory. Raise to 4GB+; ensure --disable-dev-shm-usage is used "
            "(image launch checks already stress Chromium). Prefer Container Apps with adequate "
            "CPU. Avoid tiny App Service plans for the API.",
        ),
        (
            "Cold start / health probe timeout",
            "Startup runs ensure-playwright-browsers then boots Node. Increase health/startup "
            "probe timeout (e.g. 180s). Probe path: /health on port 3001.",
        ),
        (
            "CORS errors in browser",
            "CORS_ORIGIN must list the exact QA web origin (scheme + host, no trailing slash "
            "mismatch). Rebuild is not enough - this is an API env var. Restart API after change.",
        ),
        (
            "Web still calls Railway / wrong API",
            "VITE_API_URL is compile-time. Rebuild web with Azure API URL and redeploy dist. "
            "Do not expect runtime env injection for Vite without a custom shell pattern.",
        ),
        (
            "Auth works locally but fails on QA",
            "Check Supabase Site URL + Redirect URLs. Confirm web and API use the SAME "
            "Supabase project keys. JWT secret on API must match that project.",
        ),
        (
            "permission denied for table profiles",
            "Migrations not fully applied - especially grants migration 109. Run supabase db push "
            "against QA project.",
        ),
        (
            "Workers never run / Pending Analysis forever",
            "Set ENABLE_WORKERS=true on the API container. One replica is enough for QA; "
            "multiple replicas need shared DB job semantics (pg-boss).",
        ),
        (
            "Image build fails / monorepo context wrong",
            "Build from repo root with -f apps/api/Dockerfile. Do not set Docker context to "
            "apps/api only - workspace packages must be present.",
        ),
        (
            "ACR pull / identity errors",
            "Grant Container Apps / App Service AcrPull on the registry. Prefer managed identity "
            "over long-lived admin passwords.",
        ),
        (
            "HTTPS / mixed content",
            "Web is HTTPS; API must be HTTPS. Do not point VITE_API_URL at http:// in QA.",
        ),
        (
            "DATABASE_URL / pooler SSL",
            "Use Supabase connection string appropriate for server (often pooler + sslmode=require). "
            "If /ready fails, verify network egress from Azure to Supabase is allowed.",
        ),
        (
            "Trying to drop Supabase for Azure Postgres only",
            "Possible long-term, but not for this QA sprint. App Auth and data layer assume "
            "Supabase. Keep Supabase for QA; Azure hosts web + API containers.",
        ),
    ]
    for title, detail in challenges:
        pdf.h3(title)
        pdf.body(detail)

    # 10 Smoke
    pdf.h1("10. Post-deploy smoke checklist")
    for i, t in enumerate(
        [
            "GET https://<qa-api>/health -> 200",
            "GET https://<qa-api>/v1/version -> JSON",
            "Open QA web -> sign up / sign in",
            "Create organization (no profiles permission error)",
            "Create project / run Create -> Import -> AI Review -> Generate Content -> Submit on a sample site",
            "Confirm browser/worker jobs progress when ENABLE_WORKERS=true",
        ],
        1,
    ):
        pdf.bullet(f"{i}. {t}")

    # 11 Do not
    pdf.h1("11. What NOT to use for QA")
    for t in [
        "Railway API (trial expired) - do not point QA web at api-production-*.up.railway.app",
        "Existing Netlify prod as QA until it is rebuilt with Azure VITE_API_URL",
        "Committing .env, service role keys, ACR passwords, or JWT secrets",
        "Exposing SUPABASE_SERVICE_ROLE_KEY to the web bundle",
        "Combining bare docker-compose Postgres with supabase start on the same port (local only tip)",
    ]:
        pdf.bullet(t)

    # 12 Companion
    pdf.h1("12. Companion browser extension (optional for QA demos)")
    pdf.body(
        "Not required for Azure hosting. For demos that need Activate Package: build "
        "apps/companion, load unpacked from apps/companion/dist in Chrome. Not published "
        "to Chrome Web Store."
    )

    # 13 Repo pointers
    pdf.h1("13. Repo pointers")
    pdf.kv_table(
        [
            ("GitHub", "arunsaikumarB/seo-os (branch master)"),
            ("API Dockerfile", "apps/api/Dockerfile"),
            ("Web app", "apps/web (build -> dist)"),
            ("Migrations", "supabase/migrations/"),
            ("Azure notes (MD)", "docs/azure-qa-deploy.md"),
            ("Local setup", "docs/local-setup.md"),
            ("Env reference", "docs/environment.md"),
            ("Product name", "Backlink Agent (npm scopes may still say @seo-os/*)"),
        ]
    )
    pdf.body(
        "Questions about application behavior (AI Review, Generate Content, Companion) "
        "belong with the feature team. Questions about Azure networking, ACR, Container Apps "
        "sizing, and secrets injection belong with DevOps using this document."
    )

    pdf.h1("14. Suggested Azure resource checklist")
    for t in [
        "Resource group for QA",
        "Azure Container Registry",
        "Container Apps Environment + API app (port 3001, env vars, AcrPull)",
        "Static Web App (or App Service) for web dist",
        "Key Vault (optional) for secrets referenced by Container Apps",
        "Supabase QA project + migrations applied",
        "DNS / custom domain later (not blocking for first QA URL)",
    ]:
        pdf.bullet(t)

    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 9)
    pdf._mc(
        5,
        "End of handoff. Keep this PDF with the Azure runbook. Update when API port, "
        "Dockerfile base image, or required env vars change.",
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(OUT)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
