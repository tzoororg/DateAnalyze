---
name: boost
description: Boost an agent from this session's feedback — distill the user's corrections to an agent's output into durable rules and bake them into the agent's definition, so future runs catch that behaviour on their own. Invoke as /boost <agent-name> at the end of a session where the agent underperformed.
---

# Boost an agent from session feedback

Argument: the name of an agent under `.claude/agents/<name>.md`. If missing or no such file exists, list the available agents and ask which one.

## Steps

1. **Read the agent definition** (`.claude/agents/<name>.md`).

2. **Collect the feedback.** The evidence is this conversation: every user message that corrected, overrode, or was dissatisfied with something the agent produced (or should have flagged and didn't). If the relevant exchange was compacted out of context, or the user says the feedback is in a different session, read the transcript jsonl from `~/.claude/projects/<project-dir>/` (newest files first, extract the user messages) to recover it.

3. **Distill into durable rules.** For each piece of feedback, generalize from the instance to the principle: not "the mood row should be one line" but "form views must fit one screen without scrolling". Rules must be concrete enough that the agent can verify them (measurable, checkable), and general enough to apply to future work. Drop anything that was a one-off preference tied to that specific task.

4. **Merge, don't append blindly.** Check each distilled rule against the agent's existing prompt: if an existing rule already covers it but the agent still missed it, *sharpen* that rule (add the concrete failure mode) instead of adding a duplicate. Only genuinely new principles become new rules. Keep the agent's existing structure, numbering style, and terseness.

5. **Edit the agent file** with the merged rules.

6. **Report and commit.** Show the user the exact rules added/sharpened (quote them), then commit and push per the project's finishing rules.

## Constraints

- The boost must not bloat the agent: prefer sharpening 1 rule over adding 3. An agent prompt that doubles in size after every boost is a failed boost.
- Never encode the specific artifact under discussion (file names, this feature's layout) into the agent — only transferable principles.
- If the feedback contradicts an existing rule, ask the user which wins before editing.
