# Livewire MCP Server

A token-optimized Model Context Protocol (MCP) server for retrieving Livewire 4.x documentation. This tool provides AI agents with up-to-date, accurate context regarding Livewire (including SFCs, Islands, and `wire:sort`) to help assist you in developing dynamic Laravel applications.

## Features

This MCP server provides the following tools to the AI:
- **`list_livewire_docs`**: Lists all available Livewire documentation pages.
- **`read_livewire_docs`**: Reads the detailed content of a specific Livewire documentation page.
- **`search_livewire_docs`**: Performs a keyword search across the Livewire documentation.
- **`livewire_best_practices`**: Provides token-optimized summaries of best practices for Livewire 4.x.

## Prerequisites

- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js)
- **GitHub Token**: Since the server fetches markdown directly from GitHub's API, you should provide a `GITHUB_TOKEN` to avoid rate limits.

## Installation

1. Navigate to the project directory:
   ```bash
   cd /path/to/livewire-mcp
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

## Integrate into Your IDE

You can connect this tool to your IDE so your AI agents can read Livewire documentation dynamically.

**For Antigravity:**
Edit `~/.gemini/config/mcp_config.json` (or `C:\Users\<User>\.gemini\config\mcp_config.json` on Windows)

**For VS Code (Cline/Roo):**
Edit your `cline_mcp_settings.json`

Add the following block to your configuration file, ensuring you use the absolute path to where you saved the `livewire-mcp` folder:

```json
{
  "mcpServers": {
    "livewire-docs": {
      "command": "node",
      "args": [
        "c:/laragon/www/mcp-server/livewire-mcp/index.js"
      ],
      "env": {
        "GITHUB_TOKEN": "your-github-personal-access-token"
      }
    }
  }
}
```

*(Note: Adjust the path `c:/laragon/www/mcp-server/livewire-mcp/index.js` to match your actual absolute path if different. Provide your actual GitHub token to avoid API rate limits.)*

### How the AI will use this

Once configured, simply instruct your AI assistant. For example:
- *"I need to build a Livewire 4 single file component with the Island architecture. Search the docs for Islands and guide me."*
- *"Can you list the Livewire best practices before we refactor?"*
- *"Read the Livewire documentation page on 'components' and help me build one."*
