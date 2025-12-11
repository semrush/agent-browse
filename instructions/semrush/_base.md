# Semrush General Context

This is the Semrush web application - a comprehensive digital marketing toolkit.
Domain: rc.semrush.net (staging) or semrush.com (production)

## Main Toolkits

| Toolkit | Path | Purpose |
|---------|------|---------|
| Home | /home/ | Main dashboard, domain entry |
| SEO | /seo/ | Search optimization, rankings, audits |
| AI | /ai/ | AI-powered marketing features |
| Content | /content/ | Content marketing tools |
| Traffic & Market | /analytics/ | Traffic analysis, market research |
| Local | /local/ | Local SEO management |
| Social | /social/ | Social media tools |
| Ad | /advertising/ | PPC and advertising tools |
| AI PR | /ai-pr/ | AI public relations |
| Reports | /reports/ | Custom report builder |
| App Center | /apps/ | Third-party integrations |

## Common UI Patterns
- Hamburger menu (top-left) expands/collapses sidebar navigation
- Top bar: search input, "Enterprise" link, "More" dropdown, user avatar
- Most pages have filters: date range picker, country selector, device type
- Tables support sorting by clicking column headers
- Export options via "Export" button or dropdown
- "Ask AI Assistant" button (sparkle icon) available on many pages

## Authentication
- Login button is in the top-right area (user avatar or "Log in" text)
- Login form has email and password fields
- After login, redirects to /home/ dashboard

## Project Creation Flow
1. Enter domain on home page OR click "+ Create SEO Project" on any dashboard
2. Modal appears with Domain field (required) and Name field (optional)
3. System warns if project already exists for domain
4. After creation, data gathering starts automatically (up to 5 minutes)

## Tips
- Wait for loading indicators to disappear before interacting
- Some widgets load data asynchronously - check for skeleton loaders
- Modals and dropdowns may need a moment to render
- Position Tracking and Site Audit show progress bars during data collection
- Look for notification dots on toolkit icons for new features

## Common Actions
- **Analyze domain**: Enter domain in home page input, click "Start now"
- **Create project**: Click "+ Create SEO Project", fill form, submit
- **Login**: Click avatar/login in top-right, enter credentials, submit
- **Switch project**: Click project name in top-left, select from dropdown
- **Change date range**: Click date picker, select preset or custom dates
- **Export data**: Look for Export button, choose format (CSV, PDF, etc.)
- **Navigate**: Click hamburger menu, select toolkit, then specific tool
