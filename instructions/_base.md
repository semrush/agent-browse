# Semrush General Context

This is the Semrush web application - a comprehensive digital marketing toolkit.
Domain: rc.semrush.net (staging) or semrush.com (production)

## Common UI Patterns
- Navigation sidebar on the left contains main product sections (icons)
- Top bar has search input, Pricing, Enterprise links, and user avatar
- Most pages have a date range picker in the top-right area
- Tables support sorting by clicking column headers
- Export options usually available via "Export" button or dropdown

## Authentication
- Login button is in the top-right area (user avatar or "Log in" text)
- Login form has email and password fields
- After login, redirects to /home/ dashboard

## Tips
- Wait for loading indicators to disappear before interacting
- Some widgets load data asynchronously - check for skeleton loaders
- Modals and dropdowns may need a moment to render

## Common Actions
- **Login**: Click avatar/login in top-right, enter credentials, submit
- **Switch project**: Click project name in top-left, select from dropdown
- **Change date range**: Click date picker, select preset or custom dates
- **Export data**: Look for Export button, choose format (CSV, PDF, etc.)
