# Browser Automation Skill

A skill for seamlessly enabling **[Claude Code](https://docs.claude.com/en/docs/claude-code/overview)** to interface with a browser using **[Stagehand](https://github.com/browserbase/stagehand)** (AI browser automation framework). Because Stagehand accepts natural language instructions, it's significantly more context-efficient than native Playwright while providing more features built for automation.

This is a fork of the original skill that is upgraded with a mechanism for retrieving contextual instructions and injecting them into the browser operator Claude's context. It enables "teaching" Claude to use Semrush as a pro user.  

## Installation

On Claude Code, to add the marketplace, simply run:

```bash
/plugin marketplace add https://github.com/semrush/agent-browse.git
```

Then install the plugin:

```bash
/plugin install browser-automation@browser-tools
```

## Setup

Set your Anthropic API key:
```bash
export ANTHROPIC_API_KEY="your-api-key"
```

## Usage

Once installed, just ask Claude to browse:
- *"Open rc.semrush.net and conduct a keyword research for my domain"*
- *"Open Site Audit on rc.semrush.net and explore the new feature as a user"*
- *"QA test http://localhost:3000 and fix any bugs you encounter"*

Claude will handle the rest.

## Context Injection

The skill supports domain-based context injection to provide Claude with site-specific knowledge during automation.

**Toggle**: Set `BROWSER_CONTEXT_INJECTION=false` to disable. Enabled by default.

### How It Works

1. Create a folder in `instructions/` (e.g., `instructions/mysite/`)
2. Add `_config.json` with domain patterns:
   ```json
   { "domains": ["mysite.com", "*.mysite.com"] }
   ```
3. Add `_base.md` files at any path level for hierarchical context

When navigating to a URL, the resolver matches the domain and walks the path to build context from all matching `_base.md` files. This context is returned to Claude (the orchestrator), who uses it to formulate precise browser commands.

### Architecture

```
User request → Claude (orchestrator)
                    ↓
              navigate(url) → returns pageContext
                    ↓
              Claude reads context, gains domain knowledge
                    ↓
              Claude issues specific browser commands
                    ↓
              Browser agent executes (no context needed)
```

The browser agent (Stagehand) is a simple executor. Claude uses the context to translate high-level user intent into precise, specific instructions.

### Semrush Instructions

Basic demonstrational instructions for [Semrush](instructions/semrush) are included. These describe UI elements, workflows, and navigation patterns.

## Potential Extensions and Use

The context injection mechanism could be extended:
- **Cloud storage**: Move context to a service that provides instructions via API
- **Dynamic context**: Fetch context based on URL parameters, user session (subscription type, user roles, etc.), or browser state
- **Authentication headers**: Store user-specific tokens for authenticated browsing

This Claude Code skill could be used for:
- exploratory testing
- "playing" user scenarios
- getting product insights

## Security

**Never give Claude your real account credentials.** If automation requires logging into Semrush or any other service, create a separate test account specifically for Claude to use. This protects your primary account and limits potential exposure.

## Troubleshooting

### Chrome not found

Install Chrome for your platform:
- **macOS** or **Windows**: https://www.google.com/chrome/
- **Linux**: `sudo apt install google-chrome-stable`

### Profile refresh

To refresh cookies from your main Chrome profile:
```bash
rm -rf .chrome-profile
```

## Resources

- [Stagehand Documentation](https://github.com/browserbase/stagehand)
- [Claude Code Skills](https://support.claude.com/en/articles/12512176-what-are-skills)