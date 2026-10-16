# Embed outreach plan

**Goal:** earn referring domains that Google counts, using the embed product that is already
built and has never been used. Authority Score is 2 and there are no editorial backlinks;
this is the channel most likely to change that without paying for anything.

---

## 0. Fix this before you send a single email

The snippet every embed hands out is, verbatim:

```html
<p style="font:13px/1.5 sans-serif">Free
  <a href="https://bestcalculate.com/finance/mortgage-calculator">Mortgage Calculator</a>
  by BestCalculate</p>
```

The anchor text is **exact-match keyword**, dofollow, and identical on every placement.
That is the precise pattern Google's link-spam documentation names when it talks about
widgets: a tool distributed widely whose attribution carries keyword-rich anchors. Google's
long-standing guidance is that keyword-anchored widget links should be `nofollow`. A handful
of them is invisible. Two hundred of them, all reading "Mortgage Calculator", is a footprint.

**Change the default to a brand anchor before scaling:**

```html
<p style="font:13px/1.5 sans-serif">Mortgage Calculator by
  <a href="https://bestcalculate.com/finance/mortgage-calculator">BestCalculate</a></p>
```

Same link, same destination, same value to the host — but the anchor is the brand, which is
what a natural attribution actually looks like. This is a one-line change in
`src/lib/embed.ts` (`buildEmbedSnippet`). Everything else about the architecture is right:
the `<a>` sits outside the iframe, which is what makes it a real link at all.

While in there: the iframe id and resize message are namespaced `allcalc-*`, a leftover from
an older name. It appears in code pasted onto other people's sites and does not match the
brand. Cosmetic, but this snippet is a sales document.

---

## 1. Who actually embeds a calculator

Ranked by likelihood of saying yes, not by how impressive the link would be.

**A. Trade and contractor sites — the best fit we have.**
Concrete contractors, flooring and tile installers, fencing companies, landscapers, deck
builders. A "how much concrete do I need" tool on their estimating page is genuinely useful
to their customers and costs them nothing. They have low domain authority individually, but
they are numerous, they own their HTML, and almost nobody competes for their attention.
*Lead with:* Concrete, Square Footage, Area, Volume.

**B. Niche personal-finance blogs and debt-advice sites.**
Someone writing "how to pay off credit card debt" wants a payoff calculator in the post and
does not want to build one. Higher authority than trade sites, more competition for their
inbox.
*Lead with:* Credit Card Payoff, Loan, Amortization, Auto Loan.

**C. Schools, student organisations and teacher resource pages.**
`.edu` links are slow to land and worth the wait. Student government sites, course pages,
tutoring centres, study-skills resource lists.
*Lead with:* GPA, Final Grade, Standard Deviation, Scientific.

**D. Fitness and nutrition sites.**
Large audience, but health content is YMYL and these sites are choosier about what they
publish. Expect a lower hit rate.
*Lead with:* Protein, BMR, Target Heart Rate, Pace.

**E. Credit unions, housing nonprofits, financial-literacy programs.**
Slow, bureaucratic, and the links are excellent when they land. Worth a small, patient
allocation rather than a campaign.

---

## 2. Finding prospects

Searches that surface pages which *already need* the tool — not lists of random sites:

```
"how much concrete do i need" -site:bestcalculate.com
"how to calculate square footage" inurl:blog
concrete contractor "estimating" "resources"
intitle:"student resources" gpa site:.edu
"how to pay off credit card" "calculator" -calculator.net
```

Three qualifiers before a site goes on the list:

1. **The page would be better with the tool in it.** If you cannot say where on their page it
   goes, skip them.
2. **They can paste HTML.** WordPress, Webflow, Squarespace, a static site — fine. A locked
   marketplace template — skip.
3. **The site is real.** Published in the last year, a human name somewhere, no auto-generated
   feel. We have just spent a day looking at what spam sites are; do not become a source of
   links from them.

Keep the list in a sheet: URL, contact, which calculator, which page it belongs on, date
sent, date followed up, outcome. Fifty rows done properly beats five hundred scraped.

---

## 3. The pitch

Short, specific to their page, no flattery, no SEO language. Something like:

> **Subject:** free calculator for your [slab thickness] page
>
> Hi [name] — your guide on [exact page title] walks through the arithmetic for working out
> a pour. I build free calculators and have one that does exactly that, including the bit
> your readers tend to get wrong (a post hole is the hole minus the post).
>
> It's one line of HTML, it resizes itself, it's mobile-friendly, and I maintain it, so it
> stays right without you touching it: bestcalculate.com/embed
>
> No cost and no catch — just a small credit line under it. Happy to send the snippet if it's
> useful, and equally happy to hear no.
>
> [name]

What makes this work is the second sentence. It proves you read their page. Everything else
is interchangeable; that line is the whole email.

**One follow-up, seven days later, two sentences.** Never a third.

---

## 4. Honest numbers

Cold outreach for a free embed converts at roughly **1–3% placement**. One hundred
well-targeted, personally-written emails is one to three links. That is the real exchange
rate, and anyone quoting better is selling something.

So plan in those terms:

| | |
|---|---|
| Week 1 | Fix the anchor. Build the list: 50 prospects in segment A. |
| Weeks 2–3 | Send all 50, personally written. One follow-up each. |
| Week 4 | Count outcomes. Keep the segment if ≥1 placement, drop it if 0 and try segment B. |

**Do not judge this by week four.** Referring domains compound; the first five are the
hardest, and a placement on a page that ranks brings its own visitors as well as the link.

---

## 5. Higher-yield things to run alongside

Embeds are a slow compounding channel. These are worth more per hour early on:

- **The reference tables.** Ten tables computed at build time from tested functions —
  mortgage payment per $100,000, compound growth, BMI ranges, salary conversion. Provably
  accurate data is the thing writers cite, and a citation needs no HTML access at all. Pitch
  these to writers, not webmasters.
- **Five good placements beat fifty weak ones.** One embed on a site people actually read is
  worth more than a page of directory links.
- **Anywhere you already have standing** — a community, a forum, a client, a former employer.
  Warm beats cold by an order of magnitude.

## 6. What not to do

- **No paid links, no "guest post packages", no directory blasts.** The spam network already
  emailing you about `bestcalculate.com` sells exactly this. Buying it is the one thing that
  turns "no manual action" into a manual action.
- **No mass-templated identical emails.** Deliverability aside, they do not work.
- **Do not chase links from sites you would not want a visitor from.**

## 7. How to measure

Monthly, in Semrush Backlink Analytics: **referring domains** and **Authority Score**, with
spam excluded. Ignore total backlink count — 142 backlinks from 115 junk domains is what
that number is worth.

In Search Console, the number that says this is working is the **Indexing → Pages** split
moving out of "Discovered – currently not indexed". Crawl budget follows authority. That is
the whole theory behind this plan, and it is the thing to check it against.
