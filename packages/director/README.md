# rookery-director

A judgment engine for people who use several AIs. For each task it decides **which AI** and **how much effort**,
**locks a pass prediction before the work runs**, then scores itself when you report the result.
If the work fails, it escalates one step up; once a kind of task is proven, it answers from your ledger for $0
and occasionally tries a cheaper AI.

Runs locally as an MCP server. Your API key, your ledger file (`~/.rookery/director`). We run no server: the only calls out are the judge (your key) and, past the free tier, one license check a day with Polar.

Site: https://az51826295-sys.github.io/rookery-director/

```
claude mcp add rookery-director -- npx rookery-director
```

Tools: `director_decide` · `director_record` · `director_check` · `director_scorecard`.

**`director_check` (0.3.0): accept a result, or escalate?** Pass the decision id, the working AI's own confidence, and — if you ran one — a machine check (tests, a linter, an image-similarity gate). A machine verdict wins and costs $0. Otherwise the confidence is compared to a threshold calibrated on *your* ledger, because AIs report confidence higher than they hit. In our test ("same painter?" on 45 held-out public painting pairs, one run): machine gate first + calibrated confidence + escalation scored 93.3% vs. 91.1% for the expensive AI alone, at 31% of its cost.
Env: `OPENAI_API_KEY` (the judge), `DIRECTOR_BRAIN` (default `gpt-5.6-luna`), `DIRECTOR_HOME`, `DIRECTOR_PRESET` (`claude-code` | `openai`).

## Pricing

Free: 100 decisions per month (recording results, checks and the scorecard are always free).
Pro: $9/month, unlimited — put the license key you receive in `ROOKERY_LICENSE`.
Buy Pro: https://buy.polar.sh/polar_cl_cuSeGkTUEXDjdTS7a6wtjl6vndt1wWB0spc771qTnXV
