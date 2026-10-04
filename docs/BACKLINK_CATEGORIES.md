# Backlink category truth table

Every `BACKLINK_TYPES` id has one default workflow. A scan of a specific URL can stop that workflow (broken page), turn it into an assisted step (login, captcha, Cloudflare), or keep it. Nothing here is marked verified until `runVerificationCheck` finds the target link on the live page.

Metrics are unknown unless a connected source measured them. This table does not include domain rating, traffic, or success rate.

Free resources used by every category:

- Curated submission URLs in the repo, only where the table lists them (pages that returned HTTP 200 and a real form on 2026-10-04).
- DuckDuckGo HTML search of the footprint queries. An empty or failed search stays empty.
- Google Custom Search only when `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_CX` are set (the user's own free quota).
- Common Crawl CDX when the public index responds.
- The site's own `sitemap.xml` when it is public.
- URL scanner: HTTP fetch, then local Playwright if the body is a JavaScript shell.

Content is written by Gemini (`GEMINI_API_KEY`) or local Ollama. Ollama is used only when `OLLAMA_ENABLED=true` and `OLLAMA_BASE_URL` are both set. `OLLAMA_MODEL` selects the model (default `llama3.2`; a local example is `qwen2.5:7b`). If neither provider answers, the draft says it was not generated. `GENERATION_MOCK=true` does not create backlink or outreach copy.

Email is sent only through a connected Gmail or Outlook OAuth account (`sendViaOAuthProvider`), an SMTP account saved in the inbox (password encrypted with `ENCRYPTION_KEY`), or the env mailbox `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` when no account row exists. The relay message id is the one nodemailer returns. A missing mailbox is "not connected".

Real run from the repo root in PowerShell, after `.env` has `DATABASE_URL`, `COMPANY_STACK=true`, Ollama, and SMTP:

```powershell
npm run e2e:backlinks -- --url "https://www.jayde.com/submit.html" --target "https://your-site.example/" --to "you@gmail.com" --dry-run
```

`--to` is only the mailbox that receives a test send. It is never the editor's name. Pass `--editor` when the page has no contact address and a person already knows the editor. `--send` delivers an outreach email only, and only when that email was actually generated. `--dry-run` never submits and never sends.

The script prints the scan (including a contact-form URL when no email is on the page), the client niche taken from the target title, h1, and meta description, and the workflow. A page with no suggested category stays `unknown` and stops. The approval review asks the model for JSON (relevance score and reason, spam signals, link value, risks, verdict) and falls back to rules when that JSON is invalid. A stopped page is reject. Login or captcha is needs_human. A public directory form is not approved by a one-line model reply that disagrees with the scan. Directory and citation drafts are form-field values from the target site, with unknown address, phone, and email left blank. Assisted drafts are pasteable post or profile text. Outreach drafts are emails, and only when a real recipient exists. Nothing is drafted for a stopped page. Verification is `pending` or `verified` from `runVerificationCheck`.

| Category | Mode | What is automatic | What a person does | Footprints | Curated URLs |
| --- | --- | --- | --- | --- | --- |
| `guest_post` | outreach | Find a contact or write-for-us page, draft when AI is configured, send from the user's mailbox, then verify | Approves the email and confirms the published URL | `"write for us"`, `"guest post guidelines"`, `inurl:write-for-us` | none |
| `press_release` | outreach | Draft when AI is configured. No press-wire API is called | Sends the release or pastes the published URL | `"press release" "submit"`, `"media contact"` | none |
| `pdf` | outreach | Draft the pitch. Upload only if a scan finds a real upload form | Uploads the file or emails the host | `"submit a pdf"`, `inurl:resources filetype:pdf` | none |
| `video` | assisted | Prepare the description | Uploads the video on a host they control and pastes the public URL | `"submit a video"`, `site:youtube.com/channel` | none |
| `infographic` | outreach | Draft the pitch | Sends the asset and confirms the page | `"infographic" "submit"`, `"embed this infographic"` | none |
| `web2` | assisted | Prepare the draft | Creates the account, publishes, and pastes the URL | `"create a free blog"`, `inurl:signup blog` | none |
| `case_study` | outreach | Draft the pitch when AI is configured | Approves and sends the pitch | `"submit a case study"`, `"customer story" "write for us"` | none |
| `whitepaper` | outreach | Draft the pitch | Sends the file or the pitch | `"submit a white paper"`, `"resources" "suggest a resource"` | none |
| `statistics_page` | outreach | Draft a request. Statistics are not invented | Confirms the citation and the editor | `"statistics" "suggest a resource"`, `intitle:"statistics" "contact"` | none |
| `qa_site` | assisted | Draft the answer | Posts while logged in and pastes the URL | `"ask a question"`, `inurl:questions` | none |
| `forum` | assisted | Draft the post | Logs in, posts, and pastes the thread URL | `inurl:forum "register"`, `"post a new topic"` | none |
| `blog_comment` | assisted | Fill the comment for review. Never clicks Submit | Submits the comment, including any captcha | `"leave a comment"`, `inurl:comments` | none |
| `reddit` | assisted | Draft the comment | Posts from their own account and pastes the URL | `site:reddit.com "weekly" self-promotion` | none |
| `quora` | assisted | Draft the answer | Posts from their own account and pastes the URL | `site:quora.com` | none |
| `social_bookmark` | assisted | Prepare the title and URL | Saves the bookmark and pastes the URL | `"social bookmark" "submit"`, `inurl:submit-bookmark` | none |
| `directory` | automatic | Fill and submit a public form only when the scanner finds a submission form and no login, captcha, or Cloudflare gate, then verify | Clears captcha or login, then the app verifies | `inurl:submit-site`, `inurl:submit.php "add url"`, `"submit your site"` | jayde.com/submit.html, exactseek.com/add.html, gainweb.org/submit.php, prolinkdirectory.com/submit.php, sitepromotiondirectory.com/submit.php, highrankdirectory.com/submit.php |
| `citation` | automatic | Same as `directory` for a public add-business form | Signs in when the site requires an account | `"add your business"`, `inurl:add-company`, `inurl:add-business` | n49.com/add-business, cylex.us.com/add-company.html |
| `profile` | assisted | Prepare profile fields | Creates the profile and pastes the URL | `"create a profile"`, `inurl:register "company profile"` | none |
| `testimonial` | outreach | Draft the request | Sends it and later pastes the published URL | `"leave a testimonial"`, `"write a review" contact` | none |
| `partnership` | outreach | Find a contact email on the page and draft | Approves the email | `"partner with us"`, `"become a partner"` | none |
| `supplier_link` | outreach | Find a contact and draft | Sends from their mailbox | `"our suppliers"`, `"where to buy" contact` | none |
| `broken_link` | outreach | Record a broken URL the scanner actually failed, and draft a note to the owner | Sends the email and checks the fix | `"page not found" inurl:resources`, `intitle:"resources"` | none |
| `resource_page` | outreach | Find a contact and draft | Sends the suggestion | `"suggest a resource"`, `intitle:"resources" "contact"` | none |
| `niche_edit` | outreach | Draft a request to the editor. The page is never edited automatically | Sends the request | `"write for us"`, `intitle:"contact the editor"` | none |
| `brand_mention` | outreach | Draft a request for a link | Sends the request | `"mentioned in" -site:yourdomain` | none |
| `unlinked_mention` | outreach | Same as `brand_mention` | Sends the request | `"according to" brand` | none |
| `digital_pr` | outreach | Draft a journalist pitch. No wire service | Sends the pitch | `"media kit"`, `"journalist" "contact"` | none |
| `haro` | outreach | Draft a reply. No paid query service is subscribed | Replies only to a query they actually received | `"journalist request" "source"` | none |
| `edu` | outreach | Find a `.edu` contact on a scanned page | Emails the department | `site:.edu "resources" "suggest"`, `site:.edu "webmaster"` | none |
| `gov` | outreach | Scan a published process. No government form is submitted unless the scanner finds one | Follows the agency's process | `site:.gov "contact the webmaster"` | none |
| `news` | outreach | Draft a reporter pitch | Sends the pitch | `"news tips"`, `"send a press release"` | none |
| `podcast` | outreach | Draft a guest pitch when a contact exists | Sends the pitch | `"be a guest" podcast`, `"podcast" "booking"` | none |
| `sponsorship` | outreach | Draft the request | Negotiates and pastes the live URL | `"sponsorship opportunities"`, `"become a sponsor"` | none |
| `event` | outreach | Scan for a real form, otherwise draft an email | Registers or emails the organizer | `"call for speakers"`, `"submit an event"` | none |

A broken URL (DNS, timeout, HTTP 4xx/5xx other than a Cloudflare 403 challenge, SSL, parked or expired domain) stops every category. The opportunity is not moved forward.
