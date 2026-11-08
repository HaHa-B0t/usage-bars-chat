# usage-bars-chat

A Claude Code mod: your 5-hour and 7-day usage limits as solid bars in the band above the prompt, with a reset countdown, a pace face, and a rotating quote.

- Same numbers in every open session (shared reading, checked every 30 s)
- Live figures from the usage service at startup and every few minutes
- A window past its reset time shows 0% until a new reading

## Install

At the prompt of a terminal session:

```
/plugin install usage-bars-chat --marketplace HaHa-B0t/usage-bars-chat
```

From a shell:

```bash
claude plugin install usage-bars-chat --marketplace HaHa-B0t/usage-bars-chat
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `HaHa-B0t/usage-bars-chat`, then Add plugin.

Answer `y` to add the marketplace, then pick a scope (user is first).

This repository is private: the install works only for GitHub accounts that can read it, on a machine that already holds a git credential for github.com (an SSH key, or `gh auth login` then `gh auth setup-git`). The install never prompts for one.
