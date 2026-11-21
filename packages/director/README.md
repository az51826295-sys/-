# rookery-director

A judgment engine for people who use several AIs. For each task it decides **which AI** and **how much effort**,
**locks a pass prediction before the work runs**, then scores itself when you report the result.
If the work fails, it escalates one step up; once a kind of task is proven, it answers from your ledger for $0
and occasionally tries a cheaper AI.

Runs locally as an MCP server. Your API key, your ledger file (`~/.rookery/director`). Nothing goes to our servers.

```
claude mcp add rookery-director -- npx rookery-director
```

Tools: `director_decide` · `director_record` · `director_scorecard`.
Env: `OPENAI_API_KEY` (the judge), `DIRECTOR_BRAIN` (default `gpt-5.6-luna`), `DIRECTOR_HOME`, `DIRECTOR_PRESET` (`claude-code` | `openai`).

## Pricing

Free: 100 decisions per month (recording results and the scorecard are always free).
Pro: $9/month, unlimited — put the license key you receive in `ROOKERY_LICENSE`.
During early access there is no limit.
