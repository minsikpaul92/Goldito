# Nebius x NVIDIA Global AI Hackathon — Summary

🇰🇷 Korean: [README.ko.md](README.ko.md)

Condensed from the official Devpost pages (Overview, Rules, Resources, Updates) as of Sep 28, 2026.
If anything here conflicts with the [Official Rules](https://nebiusglobalaihackathon.devpost.com/rules), the Official Rules win.

---

## 1. Key Dates

| Event | Date |
| :--- | :--- |
| Submission period | Aug 26, 2026 – **Oct 30, 2026, 10:00 AM PT (1:00 PM EDT)** |
| Judging period | Dec 1 – Dec 15, 2026 |
| Winners announced | ~Jan 11, 2027 |

> The demo must stay free and accessible to judges **until Dec 15** (end of judging).

---

## 2. Hard Requirements (Stage One: pass/fail)

1. **Runs on Nebius** — makes a runtime call to the **Nebius Token Factory** inference API, *or* is deployed on Nebius AI Cloud (Serverless Jobs, Serverless Endpoints, DevPods).
2. **Uses at least one NVIDIA open source model** — Nemotron, GR00T, Cosmos, or Sonic.
   Meta Llama models do **not** count, even when served on NVIDIA GPUs.
   Verified NVIDIA models on Token Factory: see [plan § AI Models](../plan/README.md#6-ai-models-verified-sep-28-2026).
3. **Fits one track** — a genuine attempt at the track goal, not a rebrand of an unrelated idea.

---

## 3. Tracks

| Track | Summary | Fit for PawNote |
| :--- | :--- | :--- |
| Coding & Agentic Engineering | Coding agents in Token Factory Sandboxes | ❌ |
| **Best Apps and Agents** | Apps/agents people actually use. Powered by **Nemotron** via Token Factory. Use **Nemotron 3 Ultra** for heavy reasoning, **Nano / Super** for fast everyday calls. Serverless Endpoints / Jobs encouraged, not required | ✅ **Our track** |
| Personal AI | Always-on private assistant with persistent memory, skills, tools (NemoClaw, OpenShell, Hermes Agent) | △ Not a real fit |
| Physical AI | Robotics / IoT / edge (GR00T, Cosmos, Sonic) | ❌ |

Only **one** track is selected per submission.

---

## 4. Submission Checklist

- [ ] **Working demo URL** (hosted app or test build). If login is required, include test credentials.
- [ ] **Text description** — what we built, why, and how it works.
- [ ] **Track** selected.
- [ ] **Public repository** (GitHub) with all source code, assets, and run instructions.
- [ ] **Open source license** detectable in the repo's About section (we use MIT ✅).
- [ ] **README** with setup instructions and clear run guidance, and a section highlighting:
  - how NVIDIA Nemotron (or other NVIDIA open models) is used,
  - where Token Factory accelerated our workflow,
  - any other Nebius tools/services used.
- [ ] **Demo video** — under **3 minutes**, **public on YouTube**, shows the app running on its target device, with **audio explaining the Nebius Token Factory + NVIDIA model usage**. No copyrighted music or third-party trademarks without permission.
- [ ] **Feedback** on Token Factory, AI Cloud, and every NVIDIA model/tool used (required).
- [ ] **English** for all materials (or provide English translations).
- [ ] (If applicable) IRL city event attended.

---

## 5. Judging (Stage Two, equally weighted)

| Criterion | Question judges ask |
| :--- | :--- |
| **Technological Implementation** | How well is it built, and how effectively does it use Token Factory and NVIDIA Nemotron? |
| **Design** | Is it a complete, coherent product experience — not just a technical PoC? |
| **Potential Impact** | Is there a credible, specific real problem for a real audience, and does the demo actually solve it? |
| **Quality of the Idea** | Is it a creative, non-obvious use of Nemotron on Token Factory, showing real understanding of the problem space? |

Tie-break order follows the list above (Technological Implementation first).
Judges may judge only from the description, images, and video — they are not required to test the app.

---

## 6. Prizes

| Prize | Reward | Count |
| :--- | :--- | :--- |
| Grand Prize | $20,000 | 1 |
| 2nd Place | $10,000 | 1 |
| 3rd Place | $6,000 | 1 |
| Track Winner (each of 4 tracks) | NVIDIA Jetson Orin Nano | 1 each |
| Best Use of Tavily | $3,000 | 1 — requires a functional runtime call to the Tavily API |
| City Winner | $500 | 20 — entrants tied to an IRL Builders & Brews city |
| Most Valuable Feedback | $100 + NVIDIA swag | 10 |

A project can win **one Overall award OR one Track award, plus one Bonus award.**

---

## 7. Credits & Resources

| Resource | How |
| :--- | :--- |
| $25 Token Factory credits | Fill out the Devpost credit form with code **`NEBIUS-DEVPOST-GLOBAL26`** |
| +$25 Token Factory credits | Join the free **Nebius Builders Program** (also Tavily + Nebius Academy credits, office hours) |
| Community | Nebius Discord server |
| Build session recording | Devpost YouTube channel — "Live-Coding Your First App with Nebius" (first API call, connecting a coding agent to Token Factory, swapping models for vision/reasoning/coding) |

**Builders & Brews IRL events (remaining after Sep 28):** Berlin & Toronto (Sep 29), Paris (Oct 1), Boston (Oct 2), SF (Oct 9), LA (Oct 13).
Seoul (Sep 11) and NYC (Sep 25) have already passed.

**Our status:** Minsik registered for **Toronto (Sep 29)** — approval pending. If attended, select Toronto on the submission form for the City Winner Award.

---

## 8. Other Rules Worth Knowing

- **Team:** one Representative submits on behalf of the team and receives any prize.
- **New or significantly updated** during the submission period (ours is new).
- **Third-party APIs/data** must be used within their terms (Supabase, Expo, Vercel, etc.).
- **IP & privacy:** submissions must not violate anyone's copyright or privacy rights → any real customer data used in prompts or demos must be anonymized.
- **No financial/preferential support** from Nebius or Devpost for the project.
- **Multiple submissions** allowed only if substantially different.

---

## 9. Organizer Tips (Updates tab)

- **Feedback is a scored, required part of the submission.** For Token Factory, AI Cloud, and each NVIDIA model: what we used it for, what worked, what needs work, onboarding experience (zero to hello world), and whether we'd build with it again and why. Be specific and name the tool.
- **Push past the obvious.** Judges want tracks pushed beyond the basics.
- **Name the project like a human.**
- **Use the right model for the job** — swap models between vision, reasoning, and fast tasks.
