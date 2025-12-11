# SEO Dashboard

The SEO Dashboard provides a comprehensive overview of a domain's search performance.

## Navigation Path
- URL pattern: `/seo/dashboard/{domain}`
- Breadcrumb: Home > SEO
- Header: "SEO Dashboard: {domain}"

## Key Elements

### Header Bar
- Domain name with external link icon and dropdown
- "+ Create SEO Project" button (teal) - opens project creation modal
- "Share" button - share dashboard with team
- Settings gear icon

### AI Search Widget (Left Panel)
- **AI Visibility score** (0-100): Overall AI platform presence
- **Mentions**: Total brand mentions across AI platforms
- **Cited pages**: Pages cited by AI platforms
- Breakdown by platform:
  - ChatGPT
  - AI Overview (Google)
  - AI Mode
  - Gemini
- Country selector dropdown

### SEO Overview Widget (Right Panel)
- **Filters**: Root Domain/Subdomains dropdown, Country, Device (Desktop/Mobile), Date
- **Authority Score** (0-100): Domain authority metric with trend
- **Semrush Rank**: Global ranking position
- **Organic Traffic**: Monthly organic visitors with % change
- **Organic Keywords**: Total ranking keywords with % change
- **Paid Keywords**: PPC keywords count
- **Paid Traffic**: Estimated PPC traffic
- **Ref. Domains**: Referring domains count with % change
- **Backlinks**: Total backlink count

### Lower Widgets
- **Position Tracking**: Keyword rankings monitor
  - Shows "Gathering keywords data X/Y" during initial setup
  - Search engine and language selector
- **Site Audit**: Technical SEO crawler
  - Shows "Crawling pages X/100" during crawl
- **On Page SEO Checker**: Page optimization suggestions
  - "Set up" button if not configured

## Create SEO Project Modal

Triggered by clicking "+ Create SEO Project" button.

### Fields
- **Domain** (required): Enter domain or subdomain (subfolders not supported)
  - Placeholder: "domain.com"
  - Shows warning if project exists for domain: "You already have projects for this domain..."
- **Name** (optional): Project name, auto-generated if blank
- **Share once created**: Checkbox to share with team

### Buttons
- "Create SEO project" (teal) - submit
- "Cancel" - close modal

## Main Actions

### View domain SEO data
1. Enter domain in home page input OR navigate directly to `/seo/dashboard/{domain}`
2. Dashboard loads automatically with overview metrics
3. Scroll to see Position Tracking, Site Audit, On Page SEO widgets

### Create a new project
1. Click "+ Create SEO Project" button
2. Enter domain in the Domain field
3. Optionally add a custom name
4. Click "Create SEO project"
5. System starts gathering data automatically

### Access detailed tools
Use left sidebar navigation:
- **Competitive Research**: Domain Overview, Organic Research, Keyword Gap, Backlink Gap
- **Keyword Research**: Keyword Overview, Keyword Magic Tool, Keyword Strategy Builder, Position Tracking, Organic Traffic Insights
- **Link Building**: Backlink Analytics, Backlink Audit, Link Building Tool

## Tips
- Data collection may take up to 5 minutes for Position Tracking
- Site Audit crawls pages incrementally (0/100 progress shown)
- Click metric values to drill down into detailed reports
- "Ask AI Assistant" button (sparkle icon) available for AI-powered insights
