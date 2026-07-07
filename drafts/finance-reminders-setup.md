# Personal Finance Reminders & Daily Summary — Setup

> Personal automation notes for harshithmallya@gmail.com. Placed under `drafts/`
> so Mintlify does **not** publish it to the docs site. Not company documentation.

## Goal

Automated, recurring:
1. **Reminders** about pending / upcoming **credit-card bills** (from email).
2. **Reminders** about **credits** to the different **bank accounts**.
3. A **daily transaction summary** delivered every night **~11 pm IST**.

## How it works

The engine is a **Claude Code "Routine"** (durable scheduled trigger). Each
Routine fires on a cron schedule and spins up a **fresh Claude session** that:
- reads Gmail via the connected Gmail tools,
- compiles the digest,
- and delivers it as a **push notification + email** (the Routine's completion
  notification — the Gmail connector here can read/draft but cannot *send* mail,
  so delivery rides on the notification channel).

Two Routines cover the three asks:

| Routine | Schedule (IST) | Cron (UTC) | Purpose |
|---|---|---|---|
| Morning Money Digest | ~08:00 daily | `28 2 * * *` | New bank credits (last 24h) + credit-card bills due soon |
| Nightly Transaction Summary | ~23:00 daily | `28 17 * * *` | Full day's transactions: money in, money out, net |

> **Timezone:** this environment's clock is **UTC**; the scheduler reads cron in
> that clock. 08:00 IST = 02:30 UTC, 23:00 IST = 17:30 UTC (off-minute `:28`
> used to avoid fleet-wide `:00`/`:30` pileups). **Verify the first firing**
> lands at the intended IST time; if the scheduler actually uses local time,
> change the crons to `58 7 * * *` and `58 22 * * *`.

## Accounts & email senders detected (from a 45-day inbox scan)

**Bank credit alerts (money in):**
- SBI NEFT received — `neftinfo.itps@alerts.sbi.bank.in` — "Credited to Your A/c: XX3578 Amount: INR …"
- SBI cash / CBS — `cbsalerts.sbi@alerts.sbi.bank.in` — "Your A/C XXXXX693578 Credited INR …"
- SBM Bank — `info@sbmbank.co.in` — "account XX4826 / XX2398 is credited with INR …"

**Credit-card spend alerts (money out):**
- Axis credit card — `alerts@axis.bank.in` — "INR <amt> spent on credit card no. XX8257" (includes Merchant Name)
- Scapia Federal — `scapiacards@federalbank.co.in` — "Your transaction was successful … Amount … Merchant …"

**Credit-card statements / bills (with due dates):**
- Axis cards — `cc.statements@axis.bank.in` — body has `Total Amount Due / Minimum Amount Due / Payment Due Date (DD-MM-YYYY)`
- SBI Card — `Statements@sbicard.com` — "…SBI Card Monthly Statement -<Mon> <Year>"
- Scapia Federal — `scapiacards@federalbank.co.in` — "Statement date … Due date … Total amount due …"

### Live example caught during setup (2026-07-04)
- **Axis Atlas card XX57 — Total Due ₹1,13,562.92 — due 08/07/2026** (Min ₹8,399)
- Axis Airtel XX64 — ₹2,094.90 — due 02/07/2026
- Axis IndianOil XX80 — ₹931 — due 30/06/2026
- Scapia Federal ₹399 — due 30/06/2026

## Routine 1 — Morning Money Digest

- **Name:** `Morning Money Digest (bank credits + upcoming card bills)`
- **Cron:** `28 2 * * *` (≈ 07:58 IST)
- **create_new_session_on_fire:** `true`
- **notifications:** `{ "push": true, "email": true }`
- **Prompt:**

```
You are running as a scheduled MORNING FINANCIAL DIGEST for the user
(harshithmallya@gmail.com), who is in India (IST). Use the Gmail tools
(search_threads and get_thread) to gather information, then produce a concise
digest as your FINAL message. That final message is delivered via push + email,
so make it self-contained, plain text, well-formatted. Do NOT try to send an
email yourself (no send tool) — just output the digest as your final message.

1) BANK CREDITS (last ~24h). Search: newer_than:1d (from:alerts.sbi.bank.in OR
   from:sbmbank.co.in). Look for: SBI NEFT (neftinfo.itps@alerts.sbi.bank.in,
   A/c XX3578), SBI cash/CBS (cbsalerts.sbi@alerts.sbi.bank.in, A/c ...693578),
   SBM Bank (info@sbmbank.co.in, XX4826 / XX2398). List account last4, amount, date.

2) UPCOMING CREDIT-CARD BILLS. Search: newer_than:45d
   (from:cc.statements@axis.bank.in OR from:Statements@sbicard.com OR
   from:scapiacards@federalbank.co.in). For the latest statement per card, read
   the body and extract Total Amount Due, Minimum Amount Due, Payment Due Date.
   Compute days remaining; PROMINENTLY flag any bill due within 7 days.

3) Output:
   Good morning! Money digest for <date>.
   CREDITS (last 24h): <list or None>
   CREDIT-CARD BILLS DUE SOON: <card last4 : INR total due <date> (<N> days) [min INR ...]> or None
   Keep it short. Infer today's date from the system clock.
```

## Routine 2 — Nightly Transaction Summary

- **Name:** `Nightly Transaction Summary (11pm IST)`
- **Cron:** `28 17 * * *` (≈ 22:58 IST)
- **create_new_session_on_fire:** `true`
- **notifications:** `{ "push": true, "email": true }`
- **Prompt:**

```
You are running as a scheduled NIGHTLY TRANSACTION SUMMARY for the user
(harshithmallya@gmail.com), in India (IST). It is ~11pm IST. Use the Gmail tools
(search_threads and get_thread) to compile ALL of today's transactions, then
produce the summary as your FINAL message (delivered via push + email; keep it
self-contained plain text). Do NOT try to send email yourself.

Only today's transactions (newer_than:1d, filter by today's date).

1) MONEY IN. Search: newer_than:1d (from:alerts.sbi.bank.in OR from:sbmbank.co.in).
   Sources: SBI NEFT (A/c XX3578), SBI cash/CBS (A/c ...693578), SBM (XX4826/XX2398).
2) MONEY OUT. Search: newer_than:1d (from:alerts@axis.bank.in OR
   from:scapiacards@federalbank.co.in OR from:alerts.sbi.bank.in) (spent OR
   debited OR transaction OR successful OR "was used"). Axis CC XX8257 + Scapia.
   Read bodies; de-duplicate identical alerts.
3) Totals: total credited, total spent, Net.
4) Reminder line for any card bill due within 3 days.

Output:
Daily Transaction Summary — <date>
MONEY IN — INR <total>  (itemized or None)
MONEY OUT — INR <total>  (itemized or None)
NET — INR <credited - spent>
BILLS DUE SOON (<=3 days): <...> or None
Infer today's date from the system clock.
```

## Action required to arm these

Creating a Routine needs your approval. In this session the `create_trigger`
tool call returned "requires approval" and could not self-approve. To turn these
on, do **one** of:

1. **Approve the tool call** — ask Claude to "create the two finance Routines"
   and approve the `create_trigger` permission prompt when it appears; or
2. **Create them in the Automations / Routines UI** for Claude Code on the web,
   using the two configs above (name, cron, prompt, push+email, fresh session
   each fire).

## Managing them later

- List: `list_triggers` → shows `trig_…` ids, `next_run_at`, enabled state.
- Change time / pause: `update_trigger` (new `cron_expression` or `enabled`).
- Remove: `delete_trigger` with the `trig_…` id.

## Notes / caveats

- Delivery is via push + email **notification**, not a composed inbox email
  (no send-email tool is available to the automation).
- Each fresh session relies on the Gmail connector being linked to the
  environment; if it disconnects, a run may return empty — re-linking fixes it.
- Amounts/last-4 digits above are for routing the searches, not exhaustive.
