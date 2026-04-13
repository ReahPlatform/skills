# Reah Skills

![Reah Skills](assets/reah-skill-github-cover.png)

> Skill bundle for Reah agent workflows.

## Quick Start

Get started in three steps: install the skill, provide an access key at runtime, and run a prompt.

### 1. Install

Install the Reah skill bundle into your agent environment:

```bash
npx skills add https://github.com/ReahPlatform/skills
```

### 2. Provide Access Key at Runtime

When the agent needs card info, provide a Reah card `access key` in the current conversation.

Default usage does not require any environment variable for storing card access keys.

### 3. Try It

Start with a simple prompt:

```text
I will provide a Reah access key for this request. Use it to complete my payment task.
```

That's it. The agent should request an access key when needed and use it only for the current task.

---

## Available Skills

| Skill | Description |
| ----- | ----------- |
| [reah](skills/reah/SKILL.md) | Full Reah platform access — agent card. See the [skill reference](skills/reah/SKILL.md) for detailed API docs. |

---

## Example Prompts

| Use Case | Example Prompt |
| -------- | -------------- |
| Use card | Help me order dinner for today. |

---

## Architecture at a Glance

```text
┌───────────────┐    ┌──────────────────────────────────────────────────────┐
│   AI Agent    │───▶│                    Reah Platform Layer              │
│ (Claude, etc) │    │                                                      │
└───────────────┘    │  ┌──────────────────────────┐  ┌──────────────────┐  │
                     │  │        Reah Skill        │                       │
                     │  │      (skills/reah)       │                       │
                     │  └──────────────┬───────────┘                       │
                     │                 │                                    │
                     │  ┌──────────────▼──────────────────────────────────┐ │
                     │  │              Local Script Runtime               │ │
                     │  │ get-card-info-example                           │ │
                     │  └──────────────────────────┬──────────────────────┘ │
                     │                             │                        │
                     │  ┌──────────────────────────▼──────────────────────┐ │
                     │  │             agents.reah.com GraphQL API         │ │
                     │  └──────────────────────────────────────────────────┘ │
                     └──────────────────────────────────────────────────────┘
```
