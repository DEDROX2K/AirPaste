# AirPaste Website

Simple static download site for AirPaste.

## Cheapest hosting recommendation

As of August 26, 2026:

- Cloudflare Pages is the best default for this site.
- Static asset requests are free and unlimited on Cloudflare Pages.
- If you later need server logic, Pages Functions use the Cloudflare Workers free tier first, and the paid plan starts at $5/month.

## Suggested release setup

1. Host this `website/` folder on Cloudflare Pages.
2. Upload desktop installers to GitHub Releases.
3. Keep the main download button pointing at the Releases page, or update it to the direct installer URL after the first V1 release.

## Cloudflare Pages setup

1. Create a new Pages project in Cloudflare.
2. Connect the GitHub repo.
3. Set the production directory to `website`.
4. No build command is required for this version.
5. Deploy.

## Notes

- If you do not want a custom domain yet, you can use the free `pages.dev` domain.
- If you do want your own domain, domain registration is a separate cost from hosting.
