# Site Audit

Technical SEO crawler that identifies 140+ on-page and technical issues.

## Navigation
- URL: `/siteaudit/` (projects list) or `/siteaudit/campaign/{id}/overview/` (dashboard)
- Sidebar: SEO > On Page & Tech SEO > Site Audit

## Projects List Page

| Column | Description |
|--------|-------------|
| Project | Domain name, click to open dashboard |
| Last Update | Timestamp of last crawl |
| Pages Crawled | X/limit (e.g., 100/100) |
| Site Health | Score 0-100% |
| AI Search Health | AI visibility score |
| Errors | Critical issues count |
| Warnings | Medium issues count |
| Crawlability | % of crawlable pages |

- Gear icon: Edit project settings
- "+ Create SEO Project" button: New audit

## Create New Audit

### Quick Start
1. Go to `/siteaudit/`
2. Enter domain in "Enter domain" field
3. Click "Start SEO Audit"
4. Configure settings in modal (see below)
5. Click "Start audit"

### Setup Modal (5 Steps)

**1. General** (required)
- **Scope**: Domain + subdomains toggle
- **Limit per audit**: Number of pages (e.g., 100, 500, 20000)
- **Pages to crawl**: Website (internal links from homepage) or Sitemap
- **Schedule**: One-time, Daily, Weekly (select day)
- **Email notification**: Checkbox for completion alert

**2. Crawler** (optional)
- **User agent**: SiteAuditBot Mobile or Desktop
- **Crawl delay**: Minimum (fastest), 1 URL per 2 seconds, Respect robots.txt
- **JS rendering**: Toggle for JavaScript-rendered content

**3. Allow/disallow rules** (optional)
- **Allow subfolders**: Paths to include (e.g., `/products/`)
- **Disallow subfolders**: Paths to exclude (e.g., `/admin/`)
- Note: Trailing slash matters (`/shoes/` vs `/shoes`)

**4. URL parameter rules** (optional)
- **Parameters to ignore**: Skip URLs with these params (e.g., `page`, `utm_medium`)
- Prevents duplicate crawling of paginated/filtered URLs

**5. Restrictions to bypass** (optional)
- **Bypass robots.txt**: Crawl pages blocked by Disallow directives
- **Crawl with credentials**: For password-protected/staging sites

## Dashboard Header
- **Rerun campaign**: Button to start new crawl
- **Looker Studio**: Connect to Google Data Studio
- **PDF/Export**: Download reports
- **Share**: Share with team
- **Settings**: Gear icon for project settings
- Shows: Device (Mobile/Desktop), JS rendering status, Pages crawled count

## Dashboard Tabs

| Tab | Purpose |
|-----|---------|
| Overview | Health score, top issues summary, crawl stats, AI Search Health |
| Issues | All detected problems, filterable by category/severity |
| Crawled Pages | List of all crawled URLs with metrics |
| Statistics | Detailed crawl metrics |
| Compare Crawls | Diff between audit runs |
| Progress | Crawl history and trend charts |
| JS Impact | JavaScript rendering analysis |
| CopilotAI | AI-powered insights and recommendations |

### Overview Tab Widgets
- **Site Health**: Score % with comparison to top-10% websites
- **Crawled Pages**: Breakdown (Healthy, Broken, Have issues, Redirects, Blocked)
- **AI Search Health** (Beta): AI optimization score, blocked bots list
- **Errors/Warnings**: Top issues with "How to fix" links

### Issues Tab
- **Category filters**: All, AI Search, Crawlability, Content, Meta tags, + more (...)
- **Severity filters**: Errors, Warnings, Notices
- **With issues** chip: Active filter, removable with X
- Each issue row shows: description, affected count, "Why and how to fix" link, "Send to..." button, eye icon
- Click issue name to see affected URLs

## Working with Issues (Detailed)

### Issues List Interface

**Filter Bar (Top)**
| Filter Type | Options |
|-------------|---------|
| Category | All, AI Search, Crawlability, Content, Meta tags, HTTPS, Performance, etc. |
| Severity | All (count), Errors (count), Warnings (count), Notices (count) |
| Search | Text search across issue names |
| With issues | Removable chip filter |

**Issue Row Components**
- Issue description (clickable link)
- "Why and how to fix it" link
- Affected count with "new" badge for recent discoveries
- "Send to..." button
- Eye icon (hide issue)

### Issue Detail Page

**Header Actions**
| Button | Function |
|--------|----------|
| Send to... | Forward to Trello board or Zapier (any task manager) |
| Site Structure | View issue in site structure context |
| Exclude check | Permanently disable this check for the campaign |
| Why and how to fix it | Opens help modal with explanation and fix steps |

**Summary Stats**
- Failed: X (count of pages with issue)
- Successful: X (count of pages passing check)
- Progress bar showing pass/fail ratio
- "+X hidden" indicator if pages are hidden

**Sub-tabs**
- Issues (count): Active issues list
- Hidden (count): Manually hidden issues

**Affected Pages Table**
| Column | Description |
|--------|-------------|
| Checkbox | Select for bulk actions |
| Page URL | Title + URL with external link icon |
| [Issue-specific columns] | e.g., Structured Data Type, Affected Fields |
| Discovered | Date + "New" badge |
| Code icon | Opens Google Rich Results Test with URL |
| Eye icon | Hide/unhide this specific page's issue |

**Advanced Filters**
- Include/Exclude dropdown
- Filter by: Page URL, and other issue-specific fields
- "+ Add condition" for multiple filter rules
- Apply filters / Clear all

### Issue Actions

**Hide Issue (Eye Icon)**
- Hides specific page from issue count
- Shows notification: "1 issue hidden"
- Updates count: "24 +1 hidden"
- Hidden tab shows hidden issues
- Click eye again to unhide/restore

**Send to... Options**
- **Trello**: Send task to a Trello board
- **Zapier**: Send to any task manager
- "How to connect Zapier" link for setup

**Exclude Check**
- Excludes entire check from campaign
- Header shows "Excluded checks: X"
- Message: "Your site will not be checked for this issue"
- Requires campaign rerun to update Site Health
- "Include check" button to re-enable

**Code Icon (Rich Results Test)**
- Opens Google Rich Results Test in new tab
- URL pre-filled with affected page
- Tests structured data validation live

**Why and How to Fix Modal**
| Section | Content |
|---------|---------|
| About the issue | Explanation, why it matters, links to Google guidelines |
| How to fix it | Step-by-step fix instructions, recommended tools |
| Category | Issue category classification |
| Share | Button to share fix instructions |
| External links | schema.org, Google documentation, Semrush articles |

### AI Search Issues

AI Search category (sparkle icon) contains issues affecting AI engine visibility:
- Links without anchor text
- Pages with only one incoming internal link
- Non-descriptive anchor text
- Content optimization needed
- llms.txt not found
- Too much content on page

Tooltip: "Issues affecting your rankings in AI engines"

### Crawled Pages Tab
- **Sub-tabs**: Pages, Site Structure
- **Columns** (configurable): ILR (Internal Link Rank), Page URL, Title, Status Code, Issues, Blocked AI Bots, Crawl Depth
- **Filters**: Location, Search, AI bots blocked, Advanced filters
- **Manage columns**: Show/hide 22 available columns

## Issue Categories
- **Crawlability**: Blocked pages, redirect chains, 4xx/5xx errors
- **HTTPS**: Mixed content, certificate issues, insecure pages
- **International SEO**: Hreflang issues, language targeting
- **Performance**: Slow pages, large resources, Core Web Vitals
- **Internal Linking**: Orphan pages, broken links, link depth
- **Markup**: Schema errors, Open Graph, meta tags

## Issue Severity
- **Errors** (red): Critical issues affecting SEO
- **Warnings** (orange): Medium priority improvements
- **Notices** (blue): Minor optimizations

## Common Issues
**Errors**: Invalid structured data, broken images, too large HTML, 4xx pages
**Warnings**: Unminified JS/CSS, nofollow internal links, low text-to-HTML ratio, missing alt attributes, missing h1, short titles, low word count, uncached resources

## Thematic Reports
- Core Web Vitals
- Internal Linking
- Markup (Schema, OG, Twitter Cards)
- AMP
- HTTPS

## Key Actions

### View issue details
1. Open dashboard > Issues tab
2. Click issue name
3. See affected pages list
4. Click page URL for details

### Re-run audit
1. Open project dashboard
2. Click "Rerun campaign" or wait for scheduled crawl

### Edit settings
1. From projects list: Click gear icon
2. From dashboard: Settings button in header
3. Modify settings > Save

### Export report
- Dashboard > Export button > Choose format (PDF, CSV)

## Tips
- Start with 100 pages to test, increase for full audits only if requested
- Enable JS rendering for SPAs and JavaScript-heavy sites
- Use allow/disallow rules to focus on specific site sections
- Schedule weekly audits to track progress
- Check "Compare Crawls" to see fixed vs new issues
- Site Health score is weighted: Errors impact more than Warnings
