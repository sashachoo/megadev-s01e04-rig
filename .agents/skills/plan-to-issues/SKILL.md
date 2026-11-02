---
name: plan-to-issues
description: Split this repo's plan.md into GitHub issues with gh, one per unit of work, after a human has reviewed the split. Use when a plan is ready and has no issues yet.
---

# plan-to-issues

Turns `plan.md` into GitHub issues that workers can pick up cold. Easiest with `gh`, authenticated,
in a shell this agent can run.

## Steps

1. Read `plan.md`, `AGENTS.md` and `docs/adr/`.
2. Draft the split as a table: title · plan section · scope · done when · blocked by.
   One issue per unit of work.
3. **Stop and show the table to the human.** Publish nothing until they approve it.
4. Ask the human what every issue here must carry (fields, labels, wording), unless it is
   already written down in this session or in the repo. It is, below: confirm it still holds.
5. Create each issue in dependency order, so blocked-by can cite real numbers:

   ```sh
   gh issue create --title "<title>" --body-file <tmp.md>
   ```

6. Record every issue URL from gh's output (not from memory) and reply with the list.

Closing one, with the closing comment from AGENTS.md:

```sh
gh issue close <n> -c "<closing comment>"
```

## What every issue here carries

Agreed with the repo owner for plan morning-digest (2 November 2026). Use it for every plan
unless the human changes it in step 4.

```md
Source: plan.md § <n>

**Scope.** <the section's text, as the plan says it>

**Done when:** <the plan's done condition, word for word>

**Blocked by:** #<n> (<the file, when only part of it is needed>), or —
```

- The first line is exactly `Source: plan.md § <n>`: the reviewer sorts by it.
- One label: `plan:<plan>`, the `plan:` value from plan.md's frontmatter. Create it once with
  `gh label create`.
- Close an issue only when its "Done when" holds for whoever it waits on. A step that waits on
  someone else (a review, a reply) stays open after your part is done: comment what it waits on,
  and close it when they have answered.

## No `gh`

Steps 1–4 hold either way. GitHub reachable another way (a connector, the REST API, the web UI):
the same issues, made that way. GitHub issues out of reach altogether: write them as files in
`docs/issues/`, format in ADR 0004, then commit and push.

## Don'ts

- Don't paste the whole plan into one issue, and don't keep issues only in chat.
- Don't invent sections the plan doesn't have. If the plan is unclear, ask.
