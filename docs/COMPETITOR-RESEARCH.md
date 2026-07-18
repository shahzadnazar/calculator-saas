# Competitor Research & SEO Strategy

Data-driven analysis of the online-calculator market (Semrush US database + web
research, July 2026). This drives what we build next. Methodology note: the
environment's network policy blocks outbound browsing to competitor domains, so
on-page teardowns rely on Semrush's crawled data + web research rather than live
DOM inspection.

## 1. The market leaders (Semrush, US)

| Site | Monthly organic traffic | Organic keywords | Semrush Rank | Notes |
|---|---:|---:|---:|---|
| **calculator.net** | 14.1M | 735K | 175 | Authority Score **90**, 28.8K referring domains, 595K backlinks. Pure organic (0 paid). ~4:49 avg session. |
| **omnicalculator.com** | 6.4M | 1.63M | 426 | 2× the keywords, half the traffic → long-tail strategy. |
| **calculatorsoup.com** | 4.6M | 823K | 592 | Closest organic competitor to calc.net (0.34 relevance). |
| Also in the set | — | — | — | gigacalculator.com, calculat.io, inchcalculator.com; math solvers mathway/cuemath/byjus. |

## 2. Why they rank (reverse-engineered — not to be copied)

1. **Domain authority.** calculator.net has Authority Score 90 and 28,799
   referring domains. This is the dominant ranking factor and the one a new
   domain **cannot** shortcut — it takes years of links + brand. We plan around
   it, not against it.
2. **Per-page content depth.** Their top pages each rank for **thousands** of
   keywords: fraction 27,131; date 26,675; percent 18,162; time 16,579; calorie
   11,279. They achieve this by answering every long-tail variation, sub-case
   and "People Also Ask" question **on one URL**.
3. **Comprehensive coverage** of head + long-tail calculators.
4. **Engagement.** ~4:49 average session — deep content keeps users despite the
   ads, which Google reads as satisfaction.

## 3. Their weaknesses (our opening)

Web research is consistent and blunt about calculator.net's UX:

- **Ad clutter** — "cluttered with heavy display ads that slow down page loads,
  distract from the data, and consume mobile data."
- **Dated, desktop-first design** — "feels like a site from 2010; clunky mobile,
  zooming in and out just to tap a button."
- **Layout shift** — "the page jumping around as banner ads pop into view" — i.e.
  poor CLS / Core Web Vitals.
- **Ad revenue prioritized over UX.**

A competitor ("CalcSuite") already markets itself as *"Ad-Free, Faster & Modern"* —
validating the exact gap. **We cannot out-authority them; we can decisively
out-UX, out-speed, and out-mobile them** while we earn authority on long-tail and
low-difficulty terms.

## 4. Keyword strategy (volume × difficulty × intent)

**Locked head terms (KD 86–100) — unwinnable for a new domain for years:**
BMI (4.09M, KD 99), Calorie (2.74M, KD 100), Mortgage (3.35M, KD 90), Random
Number (1.22M, KD 99), Loan (1.22M, KD 86). Keep these pages excellent for the
long-tail they still capture and for when our authority grows — but do not expect
top rankings soon.

**Winnable now (KD < 50) that we already own — invest depth here first:**
Credit-card payoff (KD 24), Square footage (31), Concrete (34), Protein (44),
Standard deviation (47), GPA (49), Income tax (50).

**High-value GAPS to add (we don't have these; competitors get big traffic):**

| Calculator | Volume/mo | KD | Verdict |
|---|---:|---:|---|
| **Tip Calculator** | **1,000,000** | **40** | Top priority — huge volume, achievable difficulty. |
| Area Calculator | 165,000 | 66 | Geometry; medium difficulty. |
| Volume Calculator | 135,000 | 39 | Geometry; low difficulty. |
| Square Footage | 74,000 | 31 | Low difficulty; pairs with Concrete. |
| Statistics Calculator | 165,000 | 61 | Upgrade our Std-Dev into fuller stats. |
| Dice Roller | 301,000 | 87 | High difficulty + gaming intent — deprioritize. |
| Time Duration | 90,500 | 60 | Extends our Hours/Time tools. |

## 5. On-page & technical takeaways

- **Content depth is the #1 on-page lever.** Expand each page's FAQ to answer the
  actual PAA questions (e.g. mortgage: "how much mortgage can I afford" 27K, "how
  to calculate mortgage payments" 18K, "what is PMI" 12K). More real Q&A →
  FAQPage schema → featured-snippet & long-tail capture — the mechanism behind
  competitors' 5K–27K keywords/page.
- **Schema (2025-26):** WebApplication schema is now near-essential (schema-less
  pages struggled to index / appear in AI Overviews in controlled tests). Add
  `datePublished` / `dateModified`, `softwareVersion`, `browserRequirements`.
  **`aggregateRating` (star snippets, ~+82% CTR) is deliberately NOT added** —
  Google requires genuine user ratings; fabricating them violates guidelines and
  our EEAT stance. It becomes viable only with a real ratings mechanism (a future
  lightweight backend).
- **Our structural advantages to protect & press:** near-zero JS (elite CWV),
  no layout shift, ad-light, modern mobile-first design, clean topical-silo URLs,
  and calculators embedded in guides — none of which the incumbents do well.

## 6. Action plan

**Now (this session):**
1. Enhance calculator structured data (dates, version, requirements).
2. Ship the top data-validated gaps: **Tip, Area, Volume, Square Footage** — ~1.4M/mo
   of additional addressable, low-to-medium-difficulty volume.

**Next:**
3. Deepen FAQ/content on the winnable (KD < 50) pages using PAA questions.
4. Upgrade Standard Deviation into a fuller Statistics calculator.
5. Begin an authority/link program (the real long-term unlock): original data
   studies, embeddable calculators, and outreach — the only durable answer to the
   authority gap.
