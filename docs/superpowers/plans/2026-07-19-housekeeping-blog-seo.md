# Housekeeping, Blog Rework, and SEO Basics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the repo's stray files and inconsistencies, turn the blog from a placeholder wall into two real, linked posts on a proper article template, add site-wide SEO fundamentals (meta descriptions, Open Graph, canonical, sitemap, robots, 404), and push everything live.

**Architecture:** Static hand-built HTML/CSS site, no build step. Blog styles move from an inline `<style>` block into `css/blog.css`, shared by the blog index and new `posts/*.html` article pages. SEO tags are inserted per-page into each `<head>`. Deployment is a push to `main` on `github.com/quinnsb/brewer`, which Vercel auto-deploys to `https://brewer-fawn.vercel.app`.

**Tech Stack:** Plain HTML/CSS/vanilla JS, Formspree forms, GA4 (`G-L6R6FGT3QD`), Vercel static hosting.

## Global Constraints

- Site base URL for all absolute links (canonical, og:url, sitemap): `https://brewer-fawn.vercel.app`
- All copy follows the humanizer rules: **no em dashes anywhere**, no "it's not X, it's Y" constructions added, warm first-person voice matching existing site copy.
- No build tooling may be introduced; everything stays hand-editable HTML/CSS.
- There is no test framework; each task's verification is a concrete grep/server check with expected output.
- Every page keeps its existing GA snippet (added in a prior session, currently uncommitted) untouched.
- Footer/nav markup must stay identical across pages except where a task explicitly changes it.
- Cache-busted asset URLs unify on `?v=5` for `css/styles.css` and `js/main.js` on every page.

---

### Task 1: Commit the in-flight GA + privacy work

The working tree already contains uncommitted GA snippets on 17 pages and the privacy-policy analytics disclosure. Land that first so later diffs stay readable.

**Files:**
- Modify: none (commit only)

- [ ] **Step 1: Verify the GA change is present and complete**

Run: `grep -l "googletagmanager" *.html projects/*.html | wc -l`
Expected: `17`

- [ ] **Step 2: Commit**

```bash
git add index.html about.html work.html contact.html blog.html privacy.html testimonial.html projects/*.html
git commit -m "Add Google Analytics tag and disclose analytics in privacy policy"
```

---

### Task 2: File housekeeping

**Files:**
- Delete: `images/Screenshot 2026-07-16 at 3.54.51 PM.png` (untracked, referenced nowhere)
- Delete: `images/stock/tanya-barrow-ATrBNY88uLg-unsplash.jpg`, `images/stock/tom-caillarec-pMcw0BzvS9M-unsplash.jpg` (tracked, referenced nowhere)
- Add to git: `hero-cut-reveal-lab.html`, `css/hero-cut-reveal-lab.css`, `js/vertical-cut-reveal.js`, `docs/portfolio-build-kickoff.md`, `docs/the-forgotten-initiative-case-study-brief.md`, `images/projects/the-forgotten-initiative/family-at-home.jpg`, this plan file

- [ ] **Step 1: Re-verify the deletions are safe (nothing references them)**

Run: `grep -rl "Screenshot 2026\|tanya-barrow\|tom-caillarec" *.html projects/*.html css/*.css js/*.js || echo SAFE`
Expected: `SAFE`

- [ ] **Step 2: Delete the strays**

```bash
rm "images/Screenshot 2026-07-16 at 3.54.51 PM.png"
git rm images/stock/tanya-barrow-ATrBNY88uLg-unsplash.jpg images/stock/tom-caillarec-pMcw0BzvS9M-unsplash.jpg
```

- [ ] **Step 3: Track the intentional untracked files and commit**

```bash
git add hero-cut-reveal-lab.html css/hero-cut-reveal-lab.css js/vertical-cut-reveal.js docs/ "images/projects/the-forgotten-initiative/family-at-home.jpg"
git commit -m "Housekeeping: remove unused images, track lab pages and docs"
```

Run: `git status --short`
Expected: only `M`/`??` entries produced by later tasks (empty at this point).

---

### Task 3: Cache-busting consistency + contact form textarea

**Files:**
- Modify: every `*.html` at root, `projects/*.html`, the two lab pages (asset version query)
- Modify: `contact.html:66` (message input becomes textarea)
- Modify: `js/main.js:327` (focus selector)

- [ ] **Step 1: Unify asset versions to `?v=5`**

For every HTML file, rewrite `css/styles.css`, `css/styles.css?v=N`, `js/main.js`, `js/main.js?v=N` references (root-relative or `../`-relative in `projects/`) to end in `?v=5`. Script:

```bash
python3 - <<'EOF'
import glob, re
for p in glob.glob("*.html") + glob.glob("projects/*.html"):
    s = open(p).read()
    s = re.sub(r'(css/styles\.css)(\?v=\d+)?', r'\1?v=5', s)
    s = re.sub(r'(js/main\.js)(\?v=\d+)?', r'\1?v=5', s)
    open(p, "w").write(s)
EOF
```

- [ ] **Step 2: Verify**

Run: `grep -rhoE "(styles\.css|main\.js)(\?v=[0-9]+)?" *.html projects/*.html | sort -u`
Expected: exactly `main.js?v=5` and `styles.css?v=5`.

- [ ] **Step 3: Contact form message field becomes a textarea**

In `contact.html`, replace:

```html
              <label for="about">The more detail, the better</label>
              <input id="about" name="message" type="text" placeholder="We're launching a..." required />
              <div class="ok-row"><button class="ok-btn" type="submit">Send</button><span class="step">press Enter &#8629;</span></div>
```

with:

```html
              <label for="about">The more detail, the better</label>
              <textarea id="about" name="message" rows="4" placeholder="We're launching a..." required></textarea>
              <div class="ok-row"><button class="ok-btn" type="submit">Send</button></div>
```

(The "press Enter" hint goes away on this step only, because Enter inside a textarea inserts a newline instead of submitting. Steps 1 and 2 keep their hints.)

- [ ] **Step 4: Make the multi-step form focus textareas too**

In `js/main.js`, the step-show helper focuses only inputs:

```js
      steps[i]?.querySelector("input")?.focus();
```

Change to:

```js
      steps[i]?.querySelector("input, textarea")?.focus();
```

- [ ] **Step 5: Check the textarea inherits form styling**

`css/styles.css` styles the form inputs; confirm the selector covers textarea (`grep -n "form-step input" css/styles.css`). If the rule is `input`-only, extend the same rule to `textarea` with `resize: vertical; font: inherit;`.

- [ ] **Step 6: Verify in browser**

Serve with the `static-site` launch config, open `/contact.html`, confirm: step 1 shows, filling name then OK advances, step 3 renders a styled multi-line textarea, no console errors.

- [ ] **Step 7: Commit**

```bash
git add *.html projects/*.html js/main.js css/styles.css
git commit -m "Unify asset cache-busting at v5; use a textarea for the contact message"
```

---

### Task 4: Blog rework

Turns the blog index into a real index of two linked posts and creates the two article pages. All blog styling moves to `css/blog.css`.

**Files:**
- Create: `css/blog.css` (index styles moved verbatim from `blog.html` + new article-page styles)
- Create: `posts/better-taste.html`
- Create: `posts/what-birding-taught-me-about-design.html`
- Modify: `blog.html` (drop inline `<style>`, link `css/blog.css?v=5`, cut placeholder posts, link real posts, drop Categories card, fix em dash)

**Interfaces:**
- Produces: `css/blog.css` classes used by both pages: existing `.paper`, `.paper-top`, `.masthead`, `.dingbats`, `.post`, plus new `.article-head`, `.article-meta`, `.article-title`, `.article-hero`, `.article-body`, `.article-foot`.
- Post pages live under `posts/`, so shared assets use `../` paths and nav links use `../about.html` etc.

- [ ] **Step 1: Create `css/blog.css`**

Move the entire rule set from `blog.html`'s `<style>` block (lines 12 to 164) into `css/blog.css` unchanged, then append the article-page styles:

```css
/* ----- article pages ----- */
.article-head {
  text-align: center;
  padding: clamp(36px, 6vw, 80px) 24px clamp(28px, 4vw, 56px);
  border-bottom: 2px solid #1e1c19;
}
.article-meta {
  display: flex;
  justify-content: center;
  gap: 30px;
  font-family: var(--serif);
  font-size: 16px;
  margin-bottom: 26px;
}
.article-title {
  font-family: var(--sans-display);
  font-size: clamp(38px, 6.5vw, 92px);
  letter-spacing: -0.03em;
  line-height: 0.98;
  max-width: 18ch;
  margin: 0 auto;
}
.article-hero {
  border-bottom: 2px solid #1e1c19;
}
.article-hero img {
  width: 100%;
  max-height: 620px;
  object-fit: cover;
  display: block;
  filter: saturate(0.88) contrast(1.04);
}
.article-body {
  max-width: 72ch;
  margin: 0 auto;
  padding: clamp(40px, 6vw, 90px) 24px;
  font-size: 19px;
  line-height: 1.65;
}
.article-body p { margin-bottom: 1.5em; }
.article-body h2 {
  font-size: clamp(24px, 3vw, 34px);
  letter-spacing: -0.02em;
  margin: 1.8em 0 0.7em;
}
.article-foot {
  border-top: 2px solid #1e1c19;
  text-align: center;
  padding: clamp(28px, 4vw, 48px) 24px;
}
.article-foot .contact-btn {
  display: inline-block;
  font-family: var(--serif);
  font-size: 18px;
  color: #1e1c19;
  text-decoration: none;
  border: 1.5px solid #1e1c19;
  border-radius: 8px;
  padding: 14px 28px;
  transition: background 0.2s, color 0.2s;
}
.article-foot .contact-btn:hover { background: #1e1c19; color: #f1ece3; }
.post-soon {
  padding: clamp(30px, 4vw, 60px);
  font-family: var(--serif);
  font-size: 17px;
  opacity: 0.65;
}
```

- [ ] **Step 2: Rework `blog.html`**

- Replace the whole inline `<style>...</style>` with `<link rel="stylesheet" href="css/blog.css?v=5" />` (placed after the styles.css link).
- In the post list keep only the two real posts, each converted from `<article class="post reveal">` to `<a class="post reveal" href="posts/...">` (anchor replaces article; inner structure unchanged). Order: better-taste (July 2, 2026) first, birding (September 18, 2025) second.
- Fix the birding excerpt em dash: `...that's also most of design—plus fewer mosquitoes...` becomes `...that's also most of design, plus fewer mosquitoes...`
- After the two posts add:

```html
        <p class="post-soon">More posts are brewing. Check back soon, or say hi in the meantime.</p>
```

- Remove the Categories `side-card` entirely; keep the "Did I mention I'm a designer?" card.
- Delete the four placeholder `<article class="post">` blocks (merch, year in review, brand strategy, naming).

- [ ] **Step 3: Create `posts/better-taste.html`**

Full page. Head mirrors blog.html but with `../` paths, its own title/meta (SEO tags come in Task 5; include them now since the file is new, see Task 5 step 1 for the exact block). Body:

```html
<body class="blog">
  <!-- nav: same menu-btn / menu-bar / menu-dock markup as blog.html with ../ prefixed hrefs -->
  <div class="paper">
    <div class="paper-top">
      <a href="../blog.html"><span class="logo-squircle"></span> Back to the blog</a>
    </div>
    <header class="article-head">
      <div class="article-meta"><span>Ideas</span><span>July 2, 2026</span></div>
      <h1 class="article-title split">The future of creative work isn't fewer ideas. It's better taste.</h1>
    </header>
    <div class="article-hero">
      <img src="../images/stock/tommy-pascale-Y09hiNYLRug-unsplash.jpg" alt="A hand reaching into a hazy red light, photographed with a film-like texture" />
    </div>
    <article class="article-body">
      <!-- full post copy, ~8 paragraphs with two h2 subheads; draft written to match site voice, no em dashes -->
    </article>
    <div class="article-foot">
      <p style="font-family: var(--serif); margin-bottom: 22px;">Thanks for reading. Written by Quinn Brewer.</p>
      <a class="contact-btn" href="../contact.html">Work with me</a>
    </div>
    <footer class="paper-foot">&copy; BREWER 2026 &middot; <a href="../blog.html" style="color:inherit;">More from the blog</a></footer>
  </div>
  <script src="../js/main.js?v=5"></script>
</body>
```

Post copy (draft for Quinn to edit; commit message flags it):

> AI can make the first draft nearly free. A hundred logo directions before lunch. Forty taglines while the coffee brews. If your value as a creative person was ever "I can generate options," that value is evaporating fast, and I think that's fine.
>
> Because generating options was never the hard part. Anyone who has run a real brand project knows the hard part comes after the wall of sticky notes: deciding which three of the three hundred ideas deserve to live, and having the spine to kill the rest. That skill has a short, old-fashioned name. Taste.
>
> **Taste is a filter, not a feeling**
>
> People talk about taste like it's a mood, something you either woke up with or didn't. In practice it's closer to a filter you build by hand over years: every project you shipped, every one you regret, every time a client said "this feels off" and you eventually figured out why. Taste is pattern recognition with receipts.
>
> Which means it compounds. The more real work you do, the sharper the filter gets. A tool can hand you a thousand outputs, but it cannot tell you which one will still look right on a truck wrap in four years, or which tagline will make the founder wince at a trade show. That judgment lives in people who have been in the room.
>
> **What I actually do all day**
>
> When I look honestly at my week, very little of it is "making things appear." Most of it is choosing. Choosing which strategy question matters, which reference is a trap, which of two nearly identical layouts respects the content and which one just decorates it. Clients don't hire me for volume. They hire me because I can tell the difference, and I can explain the difference in plain language.
>
> That explaining part matters more than ever. When options are infinite, the person who can say "here's why this one, and here's why not the others" becomes the most useful person in the project. Curation without reasoning is just preference. Curation with reasoning is direction.
>
> So no, I don't think creative careers are ending. I think the entry ramp is moving. The work that survives is the work machines are worst at: caring about the right things, noticing what everyone else scrolled past, and knowing what deserves to exist at all. Build the filter. It travels well.

- [ ] **Step 4: Create `posts/what-birding-taught-me-about-design.html`**

Same shell as Step 3 with meta `Field Notes / September 18, 2025`, hero image `../images/stock/aleksandr-artiushenko-gBqiiFuP8FY-unsplash.jpg` (alt as on the index card). Post copy:

> I got into birding the way most people do: by accident, and then completely. A friend pointed at a brown smudge in a tree, said "hermit thrush," and I needed to know how she knew. Three years later I own two field guides, a pair of binoculars I have opinions about, and a life list I will not be sharing the length of.
>
> Somewhere in year two I noticed the hobby was making me better at my job. Not in a cute metaphorical way. In specific, repeatable ways I now lean on during client work.
>
> **Looking is a skill, not a gift**
>
> Beginning birders stare directly at a bird and see "bird." Experienced birders run a checklist without thinking: size against a sparrow, shape of the bill, behavior, habitat, season. The magic trick is just structured attention.
>
> Design reviews work the same way. When a layout feels wrong, "it feels wrong" is where amateurs stop. The practiced move is to run the checklist: hierarchy, spacing rhythm, alignment, contrast, type color. The problem is always findable if you know what to look at, in what order. Nobody is born seeing kerning. You practice until you can't not see it.
>
> **Being wrong fast is the whole game**
>
> Birders misidentify constantly. You call it a Cooper's hawk, someone with more field hours says "check the tail," and you look again and they're right. The culture is built around cheerful correction, because the alternative is a life list full of lies.
>
> I try to bring that energy to critique. My first read on a design problem is a hypothesis, not a verdict. Clients often know their audience the way locals know their birds, and when their gut disagrees with my draft, that's field data. Look again. Update the ID.
>
> **Habitat first**
>
> The fastest way to identify a bird is to know what's even possible in that habitat and season before you lift the binoculars. Context does most of the work.
>
> Same with brands. A logo is never right or wrong in a vacuum. It's right or wrong on a job-site sign, in an app store icon grid, on a podcast thumbnail at 64 pixels. I start every identity project by listing the habitats before sketching a single mark, and the work gets easier every time.
>
> Anyway. Most of birding is looking carefully, being wrong, and looking again. Conveniently, that's also most of design, plus fewer mosquitoes and considerably more PDFs.

- [ ] **Step 5: Verify in browser**

Serve locally; check `/blog.html` (two clickable posts, no categories card, no console errors) and both post pages (masthead nav works, back link works, images load, `.split` headline animates, footer fine). Verify no page references the removed inline styles.

- [ ] **Step 6: Commit**

```bash
git add blog.html css/blog.css posts/
git commit -m "Rework blog: real linked posts on an article template, styles moved to blog.css

Post copy is a first draft for Quinn to edit."
```

---

### Task 5: SEO basics site-wide

**Files:**
- Modify: `<head>` of `index.html`, `about.html`, `work.html`, `contact.html`, `blog.html`, `privacy.html`, `testimonial.html`, all `projects/*.html`, both `posts/*.html`
- Create: `robots.txt`, `sitemap.xml`, `404.html`

**Interfaces:**
- Produces: per-page `<meta name="description">`, `<link rel="canonical">`, OG + Twitter tags; `BASE = https://brewer-fawn.vercel.app`.

- [ ] **Step 1: Insert the SEO block into every indexable page**

Template inserted after the viewport meta (values per page from the table below; og:image defaults to `BASE/images/quinn-headshot.jpg`, blog posts use their hero JPG):

```html
  <meta name="description" content="{DESC}" />
  <link rel="canonical" href="{URL}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="{TITLE}" />
  <meta property="og:description" content="{DESC}" />
  <meta property="og:url" content="{URL}" />
  <meta property="og:image" content="{IMAGE}" />
  <meta name="twitter:card" content="summary_large_image" />
```

(Blog posts use `og:type` `article`.) Descriptions:

| Page | Description |
|---|---|
| index.html | Brewer is the independent design practice of Quinn Brewer: brand strategy, identity, web design, and writing for organizations that want work with heart. |
| about.html | Meet Quinn Brewer, an independent designer building powerful brands on strategy, executed with care, and bursting with humanity. |
| work.html | Selected work from Brewer: brand, web, and communications projects for consultancies, nonprofits, and growing organizations. |
| contact.html | Start a project with Brewer. Tell me about your brand, website, or campaign and I will be in touch within a day or two. |
| blog.html | Notes on design, branding, taste, and studio life from independent designer Quinn Brewer. |
| privacy.html | keep existing description; add canonical/OG only |
| posts/better-taste.html | AI makes first drafts nearly free. That makes judgment, curiosity, and knowing what deserves to exist more valuable than ever. |
| posts/what-birding-taught-me-about-design.html | Most of birding is looking carefully, being wrong, and looking again. Conveniently, that is also most of design. |
| projects/ms-consulting.html | Building a marketing engine that makes a consultancy more human, discoverable, and connected. |
| projects/collegiate-church-network.html | Building the communications engine behind email, podcast, annual-report, video, and donor-development work. |
| projects/the-forgotten-initiative.html | Leading communications across podcasting, video, campaign strategy, fundraising, and audience activation for a complex mission. |
| projects/atlas-ivy.html | A modular identity built on structures in nature for a warm, deeply technical web engineering studio. |
| projects/foxglove.html | Renaming and rebranding a two-person production company into a film studio ready for bigger crews and bigger projects. |
| projects/homefield.html | Bottling home-team belonging into the brand for a video production studio with crews around the world. |
| projects/nix.html | A sharp new identity for the consultancy companies call after they have tried everything else. |
| projects/rally.html | Branding a pickleball club with none of the country-club energy: no dress code, no gatekeeping, all skill levels. |
| projects/ridgeline.html | A warm, architectural identity for a builder whose homes are considered down to the last hinge. |

- [ ] **Step 2: Noindex the non-public pages**

Add `<meta name="robots" content="noindex" />` to `testimonial.html` and `projects/project-template.html` (labs already have it). No canonical/OG on these.

- [ ] **Step 3: Create `robots.txt`**

```
User-agent: *
Allow: /

Sitemap: https://brewer-fawn.vercel.app/sitemap.xml
```

- [ ] **Step 4: Create `sitemap.xml`**

`urlset` containing exactly: `/`, `/about.html`, `/work.html`, `/contact.html`, `/blog.html`, `/privacy.html`, `/posts/better-taste.html`, `/posts/what-birding-taught-me-about-design.html`, and the nine real project pages (template excluded), each as `<url><loc>BASE/path</loc></url>`.

- [ ] **Step 5: Create `404.html`**

Branded page using the standard head (styles.css?v=5, GA snippet, `noindex`), site logo, and:

```html
  <main class="main"><div class="shell">
    <section class="section" style="min-height: 55vh; display: grid; align-content: center;">
      <h1 class="h-display">Well, this page flew off.</h1>
      <p class="body-copy" style="margin-top: 24px;">Whatever used to live here has migrated. Let's get you somewhere warmer.</p>
      <p style="margin-top: 32px;"><a class="pill-btn maroon" href="/">Back to the homepage</a></p>
    </section>
  </div></main>
```

(Vercel serves root `404.html` automatically for static deployments.)

- [ ] **Step 6: Verify**

- `grep -L 'meta name="description"' *.html projects/*.html posts/*.html` returns only `work-lab.html`, `hero-cut-reveal-lab.html`, `testimonial.html`, `projects/project-template.html`, `404.html`.
- `python3 -c "import xml.dom.minidom,sys; xml.dom.minidom.parse('sitemap.xml')"` exits clean.
- Local server: `/404.html` renders styled; a project page's head shows canonical + OG.

- [ ] **Step 7: Commit**

```bash
git add *.html projects/*.html posts/*.html robots.txt sitemap.xml 404.html
git commit -m "Add SEO basics: meta descriptions, Open Graph, canonicals, sitemap, robots, 404"
```

---

### Task 6: Full local verification + deploy

- [ ] **Step 1: Serve and sweep**

Start the `static-site` launch config. Visit `/`, `/blog.html`, both posts, `/contact.html`, `/privacy.html`, one project page, `/404.html`. Zero console errors; GA `dataLayer` present on each.

- [ ] **Step 2: Push to main**

```bash
git push origin main
```

- [ ] **Step 3: Verify the live deploy**

Wait for Vercel (~1 to 2 min), then confirm `https://brewer-fawn.vercel.app` serves the new head tags and `https://brewer-fawn.vercel.app/sitemap.xml` and `/robots.txt` resolve. Confirm a blog post URL loads live.

---

## Self-Review

- Spec coverage: housekeeping (Tasks 1 to 3), blog rework (Task 4), SEO (Task 5), push live (Task 6). Socials/testimonial replacement intentionally out of scope (needs Quinn's real URLs and quotes).
- Placeholder scan: post copy, descriptions, and file contents are written out; the only "as on blog.html" references point to markup that exists verbatim in the repo.
- Consistency: `css/blog.css?v=5` matches the v5 convention; posts use `../` paths; BASE constant used everywhere.
