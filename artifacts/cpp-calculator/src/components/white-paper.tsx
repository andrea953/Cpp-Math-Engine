import { Children, useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "./ui/button";
import {
  BookOpen,
  Calculator,
  ChevronRight,
  ClipboardList,
  FileText,
  Layers,
  Lightbulb,
  Printer,
  ScrollText,
  ShieldCheck,
  Sigma,
  Target,
  Users,
} from "lucide-react";
import { whitePaperExamples as ex } from "@/cpp/whitePaperExamples";
import { formatMoney } from "@/cpp/format";
import { estimateWhitePaperPageCount } from "./whitePaperPrintEstimator";

const fmt0 = (n: number) => formatMoney(n, false);
const fmt2 = (n: number) => formatMoney(n, true);
const pct1 = (n: number) =>
  `${(n * 100).toLocaleString("en-CA", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;

interface TocItem {
  id: string;
  label: string;
  part?: 1 | 2;
}

const TOC: TocItem[] = [
  { id: "wp-overview", label: "Overview", part: 1 },
  { id: "wp-problem", label: "The problem with public CPP calculators", part: 1 },
  { id: "wp-difference", label: "How the Modern Cents CPP Calculator is different", part: 1 },
  { id: "wp-audience", label: "Who benefits and typical use cases", part: 1 },
  { id: "wp-methodology", label: "Methodology overview", part: 2 },
  { id: "wp-contributory", label: "Contributory period, YMPE & YAMPE", part: 2 },
  { id: "wp-ampe", label: "AMPE and earnings indexing", part: 2 },
  { id: "wp-base", label: "Base CPP", part: 2 },
  { id: "wp-tier1", label: "Tier 1 enhancement (post-2018)", part: 2 },
  { id: "wp-tier2", label: "Tier 2 enhancement (post-2023)", part: 2 },
  { id: "wp-enhancement-accrual", label: "Enhanced CPP accrual (years contributed)", part: 2 },
  { id: "wp-dropouts", label: "Drop-out provisions", part: 2 },
  { id: "wp-adjustments", label: "Early / late take-up adjustments", part: 2 },
  { id: "wp-percent-of-maximum", label: "Percent of the maximum CPP retirement pension", part: 2 },
  { id: "wp-prb", label: "Post-Retirement Benefit (PRB)", part: 2 },
  { id: "wp-survivor", label: "Survivor, children & death benefit", part: 2 },
  { id: "wp-soc", label: "SOC import", part: 2 },
  { id: "wp-references", label: "References & sources", part: 2 },
];

function formatGeneratedDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function usePrintDate(): string {
  const [date, setDate] = useState<string>(() => formatGeneratedDate(new Date()));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const iso = formatGeneratedDate(new Date());
      setDate(iso);
      // Set a CSS custom property on :root so the @page @bottom-right margin
      // box can read it via `var(--print-date)`. The value is a CSS string
      // token, so it must include its own quotes.
      document.documentElement.style.setProperty(
        "--print-date",
        `"Generated ${iso} \u00B7 "`,
      );
    };
    update();
    window.addEventListener("beforeprint", update);
    return () => {
      window.removeEventListener("beforeprint", update);
    };
  }, []);
  return date;
}

/**
 * Chrome/Edge render `@page @top-left` / `@bottom-right` margin boxes for
 * running headers and "Page N of M" footers. Safari and Firefox ignore
 * those margin boxes entirely. To get the same printed output in those
 * browsers, this hook injects absolutely-positioned per-page header and
 * footer DOM elements on `beforeprint`, then removes them on `afterprint`.
 *
 * Because `position: absolute` elements appear on whichever printed page
 * contains their Y coordinate, placing one element at body Y = p * pageH
 * lands it on page p. Page count is estimated by measuring an offscreen
 * clone rendered at the print width and font size, with forced page
 * breaks at `.print-part-heading` accounted for.
 *
 * To stay in lockstep with Chrome's `@page @bottom-right` content
 * (`var(--print-date) "Page " counter(page) " of " counter(pages)`),
 * the injected footers compute a fresh `Generated YYYY-MM-DD \u00B7 `
 * prefix at print time using the same `formatGeneratedDate` helper that
 * `usePrintDate` uses for the Chrome path.
 *
 * Chrome remains on the existing `@page` margin-box rules and is not
 * touched by this hook (the listeners early-return for Chromium).
 */
function useCrossBrowserPrintMargins(): void {
  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;

    const ua = navigator.userAgent;
    const isFirefox = /Firefox\//.test(ua);
    const isSafari = /Safari\//.test(ua) && !/Chrom(e|ium)\//.test(ua);
    if (!isFirefox && !isSafari) return;

    const HEADER_TEXT = "Modern Cents CPP Calculator — Methodology";
    // Letter page geometry, in CSS pixels at 96 DPI:
    //   page outer:    11in   = 1056 px
    //   @page margin:  0.7in top + 0.8in bottom  (matches @media print rule)
    //   body content:  9.5in  = 912 px per printed page
    const PAGE_CONTENT_PX = 9.5 * 96;
    // Printable width inside @page margins (8.5in - 0.6in - 0.6in)
    const PRINT_WIDTH_PX = 7.3 * 96;

    let injected: HTMLElement[] = [];
    let active = false;

    function cleanup(): void {
      for (const node of injected) node.remove();
      injected = [];
      if (active) {
        document.body.classList.remove("cross-browser-print-active");
        active = false;
      }
    }

    function estimatePageCount(rootEl: HTMLElement): number {
      // Geometry constants live next to this hook so the snapshot guard
      // in `whitePaperPrintEstimator.test.ts` can see them; the actual
      // estimator logic is in `./whitePaperPrintEstimator` so the
      // cross-browser e2e test can call exactly the same function.
      return estimateWhitePaperPageCount(rootEl, {
        pageContentPx: PAGE_CONTENT_PX,
        printWidthPx: PRINT_WIDTH_PX,
      });
    }

    function injectMargins(totalPages: number, datePrefix: string): void {
      // Per-page footer (every page) and header (skip cover = page 1).
      // Absolute positioning relative to the document root: a div at
      // body Y = p * PAGE_CONTENT_PX sits at the bottom of page p's
      // content area, so it prints on page p.
      for (let p = 1; p <= totalPages; p++) {
        const footer = document.createElement("div");
        footer.className = "cross-browser-print-footer";
        footer.setAttribute("data-page", String(p));
        footer.textContent = `${datePrefix}Page ${p} of ${totalPages}`;
        Object.assign(footer.style, {
          position: "absolute",
          left: "0",
          right: "0",
          top: `${p * PAGE_CONTENT_PX - 18}px`,
          paddingRight: "0.6in",
          textAlign: "right",
          fontFamily: "Inter, sans-serif",
          fontSize: "9pt",
          color: "#555",
          background: "#fff",
          zIndex: "100",
        } as CSSStyleDeclaration);
        document.body.appendChild(footer);
        injected.push(footer);

        if (p > 1) {
          const header = document.createElement("div");
          header.className = "cross-browser-print-header";
          header.setAttribute("data-page", String(p));
          header.textContent = HEADER_TEXT;
          Object.assign(header.style, {
            position: "absolute",
            left: "0",
            right: "0",
            top: `${(p - 1) * PAGE_CONTENT_PX}px`,
            paddingLeft: "0.6in",
            textAlign: "left",
            fontFamily: "Inter, sans-serif",
            fontSize: "9pt",
            fontWeight: "500",
            // Brand-tinted running header to match Chrome's @page @top-left
            // color in src/index.css. Keep the page-number footer neutral
            // grey so the brand accent appears only at the top of the page.
            color: "#5a4dd0",
            background: "#fff",
            zIndex: "100",
          } as CSSStyleDeclaration);
          document.body.appendChild(header);
          injected.push(header);
        }
      }
    }

    function setup(): void {
      cleanup();
      const root = document.querySelector<HTMLElement>(".print-paper");
      if (!root) return;
      const totalPages = estimatePageCount(root);
      if (totalPages < 1) return;
      // Match Chrome's `--print-date` value: "Generated YYYY-MM-DD \u00B7 ".
      const datePrefix = `Generated ${formatGeneratedDate(new Date())} \u00B7 `;
      document.body.classList.add("cross-browser-print-active");
      active = true;
      injectMargins(totalPages, datePrefix);
    }

    window.addEventListener("beforeprint", setup);
    window.addEventListener("afterprint", cleanup);

    // Safari historically did not always fire `beforeprint` reliably;
    // a `matchMedia('print')` change listener is the standard fallback.
    const mq = window.matchMedia("print");
    const mqHandler = (e: MediaQueryListEvent | MediaQueryList): void => {
      if (e.matches) setup();
      else cleanup();
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", mqHandler as (e: MediaQueryListEvent) => void);
    } else if (typeof (mq as { addListener?: unknown }).addListener === "function") {
      (mq as unknown as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(
        mqHandler as (e: MediaQueryListEvent) => void,
      );
    }

    return () => {
      window.removeEventListener("beforeprint", setup);
      window.removeEventListener("afterprint", cleanup);
      if (typeof mq.removeEventListener === "function") {
        mq.removeEventListener(
          "change",
          mqHandler as (e: MediaQueryListEvent) => void,
        );
      } else if (
        typeof (mq as { removeListener?: unknown }).removeListener === "function"
      ) {
        (
          mq as unknown as {
            removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
          }
        ).removeListener(mqHandler as (e: MediaQueryListEvent) => void);
      }
      cleanup();
    };
  }, []);
}

function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 1] },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-print-formula
      className="print-formula my-4 overflow-x-auto rounded-lg border border-border/60 bg-slate-50/80 px-4 py-3 font-mono text-[13px] leading-relaxed text-slate-800 shadow-inner"
    >
      {children}
    </div>
  );
}

function Example({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="my-4 rounded-lg border-l-4 border-primary/40 bg-primary/5 px-4 py-3 text-sm text-foreground/90">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80">
        <Lightbulb className="h-3.5 w-3.5" />
        Worked example — {label ?? ex.profile.label}
      </div>
      <div className="space-y-1 leading-relaxed">{children}</div>
    </div>
  );
}

function ExampleLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[12.5px] text-slate-700">
      {children}
    </div>
  );
}

function InlineMath({ children }: { children: React.ReactNode }) {
  return (
    <span className="print-inline-math rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800">
      {children}
    </span>
  );
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary print:text-black print:no-underline"
    >
      {children}
    </a>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  icon,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  icon?: React.ReactNode;
}) {
  return (
    <div id={id} className="print-section-heading scroll-mt-24 space-y-2">
      {eyebrow && (
        <div className="print-eyebrow text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
          {eyebrow}
        </div>
      )}
      <h3 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {icon && <span className="text-primary print:hidden">{icon}</span>}
        {title}
      </h3>
    </div>
  );
}

function PartHeading({
  id,
  number,
  title,
  blurb,
  icon,
}: {
  id: string;
  number: string;
  title: string;
  blurb: string;
  icon: React.ReactNode;
}) {
  return (
    <div id={id} className="print-part-heading scroll-mt-24">
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-primary/15 bg-gradient-to-br from-white/90 to-[hsl(215_85%_97%)]/80 p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(215_85%_92%)] to-[hsl(248_75%_94%)] text-primary shadow-sm print:hidden">
            {icon}
          </div>
          <div className="print-eyebrow text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">
            {number}
          </div>
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{title}</h2>
        <p className="max-w-3xl text-base text-muted-foreground sm:text-lg">{blurb}</p>
      </div>
    </div>
  );
}

/**
 * Sections collapse by default (chevron click expands them). When the user
 * prints the white paper we want every section open so the printed output
 * matches what it has always been. This hook saves each section's open
 * state on `beforeprint`, opens them all, and restores the previous state
 * on `afterprint`.
 *
 * MUST run before `useCrossBrowserPrintMargins` in the component body so
 * that this hook's `beforeprint` listener is registered first and fires
 * first — otherwise the cross-browser page-count estimator measures the
 * collapsed DOM and produces an incorrect "Page N of M" footer.
 *
 * Also subscribes to `matchMedia('print')` like the cross-browser print
 * margins hook, because Safari does not always fire `beforeprint` reliably.
 */
function useExpandSectionsForPrint(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let saved: Array<{ el: HTMLDetailsElement; wasOpen: boolean }> = [];
    const expand = () => {
      // Re-entrant safety: if a previous expand already saved state and
      // restore hasn't happened yet (overlapping events from Safari /
      // matchMedia + beforeprint), don't overwrite the original state.
      if (saved.length > 0) return;
      const nodes = document.querySelectorAll<HTMLDetailsElement>(
        "details.wp-section",
      );
      saved = Array.from(nodes).map((el) => ({ el, wasOpen: el.open }));
      saved.forEach(({ el }) => {
        el.open = true;
      });
    };
    const restore = () => {
      saved.forEach(({ el, wasOpen }) => {
        el.open = wasOpen;
      });
      saved = [];
    };

    window.addEventListener("beforeprint", expand);
    window.addEventListener("afterprint", restore);

    const mq = window.matchMedia("print");
    const mqHandler = (e: MediaQueryListEvent | MediaQueryList): void => {
      if (e.matches) expand();
      else restore();
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", mqHandler as (e: MediaQueryListEvent) => void);
    } else if (typeof (mq as { addListener?: unknown }).addListener === "function") {
      (mq as unknown as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(
        mqHandler as (e: MediaQueryListEvent) => void,
      );
    }

    return () => {
      window.removeEventListener("beforeprint", expand);
      window.removeEventListener("afterprint", restore);
      if (typeof mq.removeEventListener === "function") {
        mq.removeEventListener(
          "change",
          mqHandler as (e: MediaQueryListEvent) => void,
        );
      } else if (
        typeof (mq as { removeListener?: unknown }).removeListener === "function"
      ) {
        (
          mq as unknown as {
            removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
          }
        ).removeListener(mqHandler as (e: MediaQueryListEvent) => void);
      }
      restore();
    };
  }, []);
}

export function WhitePaper() {
  // Order matters: expand sections FIRST so the cross-browser margins
  // hook's page-count estimator measures the fully-expanded DOM.
  useExpandSectionsForPrint();
  useCrossBrowserPrintMargins();
  const activeId = useActiveSection(TOC.map((t) => t.id));
  const generatedOn = usePrintDate();

  const part1 = TOC.filter((t) => t.part === 1);
  const part2 = TOC.filter((t) => t.part === 2);

  return (
    <section className="print-paper relative border-t border-border/40 bg-gradient-to-b from-white/40 via-white/70 to-white/90 py-16 sm:py-24 print:border-0 print:bg-none print:bg-white print:py-0">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 print:max-w-none print:px-0">
        <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-14 print:mb-8 print:text-left">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-white/70 px-3 py-1 text-xs font-semibold text-primary shadow-sm backdrop-blur print:hidden">
            <ScrollText className="h-3.5 w-3.5" />
            White Paper
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Inside the Modern Cents CPP Calculator
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            A reference document for financial advisors covering what the Modern Cents CPP
            Calculator is, how it differs from public CPP calculators, and the full math behind
            every dollar it produces.
          </p>
          <p
            className="mt-6 hidden text-sm font-semibold tracking-wide text-foreground/80 print:block"
            data-testid="text-prepared-on"
          >
            Prepared on {generatedOn}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[260px,1fr] lg:gap-14 print:!block print:gap-0">
          <aside className="lg:sticky lg:top-24 lg:self-start print:hidden">
            <nav
              aria-label="White paper sections"
              className="rounded-2xl border border-border/60 bg-white/80 p-4 shadow-sm backdrop-blur"
            >
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                Contents
              </div>
              <TocList title="Part 1 — Positioning" items={part1} activeId={activeId} />
              <div className="my-3 h-px bg-border/60" />
              <TocList title="Part 2 — Methodology" items={part2} activeId={activeId} />
            </nav>
          </aside>

          <article className="min-w-0 space-y-12">
            <PartHeading
              id="wp-part-1"
              number="Part 1"
              title="Product positioning"
              blurb="What the Modern Cents CPP Calculator is, who it's for, and why advisors need a planner-grade CPP tool."
              icon={<Target className="h-5 w-5" />}
            />

            <Section>
              <SectionHeading
                id="wp-overview"
                eyebrow="What it is"
                title="The Modern Cents CPP Calculator in one paragraph"
                icon={<FileText className="h-5 w-5" />}
              />
              <p>
                The Modern Cents CPP Calculator is a planner-grade Canada Pension Plan calculator
                built for financial advisors. It models a client's CPP retirement pension from
                their actual contributory
                record, computing base CPP, the 2019 first additional (Tier 1) enhancement, and the
                2024 second additional (Tier 2) enhancement; applies the general 17% drop-out, the
                Child Rearing Drop-Out (CRDO), and disability drop-out; runs the early/late take-up
                adjustment from age 60 to 70 with monthly precision; projects Post-Retirement
                Benefits (PRB) for clients still working; and models the survivor's pension,
                children's benefit, and death benefit ($2,500, or up to $5,000 with the 2025
                top-up) — including the combined-benefit cap.
                Every component is exposed as an auditable line item rather than a single headline
                number.
              </p>
            </Section>

            <Section>
              <SectionHeading
                id="wp-problem"
                eyebrow="The problem"
                title="Why public CPP calculators fall short for advisors"
                icon={<ClipboardList className="h-5 w-5" />}
              />
              <p>
                Public CPP calculators were built to give Canadians a rough estimate of their
                retirement income. They generally:
              </p>
              <ul className="ml-5 list-disc space-y-1.5 text-muted-foreground">
                <li>Output a single monthly number with no breakdown of base, Tier 1, or Tier 2.</li>
                <li>
                  Hide the contributory period, indexing, drop-outs, and adjustment factor — leaving
                  no audit trail to defend the result to a client.
                </li>
                <li>
                  Ignore or simplify the 2019 and 2024 enhancements, the Child Rearing Drop-Out, and
                  the disability drop-out.
                </li>
                <li>
                  Provide no way to model survivor's pension, the combined-benefit cap, or the
                  death benefit alongside the contributor's own retirement.
                </li>
                <li>
                  Cannot compare scenarios (start at 60 vs 65 vs 70), show breakeven, or be shared
                  with a client as a documented analysis.
                </li>
              </ul>
              <p>
                For an advisor preparing a retirement plan, those gaps mean the CPP figure on a net
                worth statement can't be defended line by line — and that is exactly the figure
                clients ask the most questions about.
              </p>
              <div className="mt-6 rounded-lg border border-border/60 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground print:border-slate-300 print:bg-white">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80 print:text-black">
                  Sources
                </p>
                <p className="leading-relaxed">
                  The public tools referenced here are Service Canada&apos;s{" "}
                  <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/retirement-income-calculator.html">
                    Canadian Retirement Income Calculator
                  </SourceLink>{" "}
                  and the canada.ca{" "}
                  <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/amount.html">
                    CPP &ldquo;How much you could receive&rdquo; estimate
                  </SourceLink>
                  . The technical claims behind every point above are cited section-by-section in
                  Part 2 and gathered in the References below.
                </p>
              </div>
            </Section>

            <Section>
              <SectionHeading
                id="wp-difference"
                eyebrow="The difference"
                title="How the Modern Cents CPP Calculator is different"
                icon={<ShieldCheck className="h-5 w-5" />}
              />
              <ul className="ml-5 list-disc space-y-2">
                <li>
                  <strong>Audit-ready breakdown.</strong> Every result splits into base CPP, Tier 1
                  enhancement, and Tier 2 enhancement, with the contributory period, AMPE, drop-out
                  counts, accrual factors, and adjustment factor exposed as diagnostics.
                </li>
                <li>
                  <strong>Tiered enhancements modelled correctly.</strong> Tier 1 phases in from
                  2019 (15%) to 2023 (100%) of an 8⅓% replacement on YMPE-band earnings; Tier 2
                  applies a 33⅓% replacement on the YMPE→YAMPE band from 2024 onward.
                </li>
                <li>
                  <strong>Drop-outs handled explicitly.</strong> CRDO and disability periods are
                  removed from the contributory period before the general 17% drop-out is applied.
                </li>
                <li>
                  <strong>Survivor + PRB built in.</strong> Survivor's pension (with the
                  combined-benefit cap), children's benefit, death benefit (up to $5,000), and the
                  Post-Retirement Benefit for clients still working are first-class outputs.
                </li>
                <li>
                  <strong>Scenario comparison and breakeven.</strong> Run multiple start ages
                  side-by-side, see lifetime cumulative benefit projections, and compare scenarios
                  in a single view.
                </li>
                <li>
                  <strong>SOC import.</strong> Paste a Service Canada Statement of Contributions
                  directly to populate the earnings history without retyping years of data.
                </li>
                <li>
                  <strong>Shareable client links.</strong> Issue a public read-only link so a client
                  can review the analysis without needing an account.
                </li>
              </ul>
            </Section>

            <Section>
              <SectionHeading
                id="wp-audience"
                eyebrow="Who it's for"
                title="Audience and typical use cases"
                icon={<Users className="h-5 w-5" />}
              />
              <p>
                The Modern Cents CPP Calculator is built for financial planners, advisors, and retirement specialists
                who need to defend a CPP number to a client, a compliance reviewer, or an estate
                lawyer. Typical use cases include:
              </p>
              <ul className="ml-5 list-disc space-y-1.5 text-muted-foreground">
                <li>
                  Producing a planner-grade CPP figure for a retirement projection or net worth
                  statement.
                </li>
                <li>
                  Comparing a client's after-tax outcomes when starting CPP at 60, 65, and 70 and
                  walking through the breakeven age.
                </li>
                <li>
                  Modelling the impact of CRDO eligibility for a parent who took years out of the
                  workforce.
                </li>
                <li>
                  Estimating a survivor's pension for an estate plan, including the combined-benefit
                  cap that clients almost never anticipate.
                </li>
                <li>
                  Showing a client how continuing to work past their CPP start date generates
                  Post-Retirement Benefits.
                </li>
              </ul>
            </Section>

            <PartHeading
              id="wp-part-2"
              number="Part 2"
              title="Technical methodology"
              blurb="The exact formulas, constants, and rules that the Modern Cents CPP Calculator engine implements."
              icon={<Calculator className="h-5 w-5" />}
            />

            <Section>
              <SectionHeading
                id="wp-methodology"
                eyebrow="Overview"
                title="How a CPP figure is built"
                icon={<Layers className="h-5 w-5" />}
              />
              <p>
                A monthly CPP retirement pension in the Modern Cents CPP Calculator is the sum of three components,
                each computed from the same earnings record but with different rules:
              </p>
              <Formula>
                Total monthly CPP = Base CPP + Tier 1 enhancement + Tier 2 enhancement
              </Formula>
              <Example>
                <ExampleLine>
                  Representative client at 65: {fmt2(ex.total.base)} (Base) +{" "}
                  {fmt2(ex.total.tier1)} (Tier 1) + {fmt2(ex.total.tier2)} (Tier 2)
                </ExampleLine>
                <ExampleLine>
                  = {fmt2(ex.total.monthly)} / month before the take-up adjustment
                </ExampleLine>
              </Example>
              <p>
                Each component is calculated at age 65 in start-year dollars and then multiplied by
                an adjustment factor for the chosen take-up age (60–70). If the client continues
                working after starting CPP, a Post-Retirement Benefit accrues each year and is added
                to the indexed payment stream.
              </p>

              <div className="mt-6 rounded-lg border border-border/60 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground print:border-slate-300 print:bg-white">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80 print:text-black">
                  Sources
                </p>
                <ul className="ml-5 list-disc space-y-1 leading-relaxed">
                  <li>
                    <strong>Three-component benefit formula</strong> — s. 46(1) of the{" "}
                    <SourceLink href="https://laws-lois.justice.gc.ca/eng/acts/c-8/FullText.html">
                      Canada Pension Plan Act (RSC 1985, c. C-8)
                    </SourceLink>
                    : (a) the 25% base, (b) the first additional (Tier 1) and (c) the second
                    additional (Tier 2) components.
                  </li>
                  <li>
                    <strong>Take-up adjustment (60–70)</strong> — CPP Act s. 46(3)–(6); the{" "}
                    <strong>Post-Retirement Benefit</strong> — CPP Act s. 59.1. Each component&apos;s
                    exact statute is cited in its own section below.
                  </li>
                  <li>
                    Plain-language overview:{" "}
                    <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/amount.html">
                      canada.ca — How much you could receive
                    </SourceLink>
                    .
                  </li>
                </ul>
              </div>
            </Section>

            <Section>
              <SectionHeading
                id="wp-contributory"
                eyebrow="Reference values"
                title="Contributory period, YMPE & YAMPE"
                icon={<ScrollText className="h-5 w-5" />}
              />
              <p>
                The <em>contributory period</em> runs month-by-month from the later of age 18 or
                January 1966 (when CPP began) to the month before CPP starts, capped at age 70. The
                engine carries the period at monthly granularity so partial-year work, mid-year
                start dates, and CRDO/disability windows can be removed precisely.
              </p>
              <p>
                Two reference earnings ceilings drive the math:
              </p>
              <ul className="ml-5 list-disc space-y-1.5 text-muted-foreground">
                <li>
                  <strong>YMPE</strong> — the Year's Maximum Pensionable Earnings. The base + Tier 1
                  ceiling. Published values 1966–2026 are stored in the engine; later years are
                  projected at the user's YMPE growth rate (default 3.1%).
                </li>
                <li>
                  <strong>YAMPE</strong> — the Year's Additional Maximum Pensionable Earnings.
                  Introduced in 2024 as the upper ceiling for Tier 2 contributions. Published values
                  for 2024–2026 are stored; later years are projected at the YAMPE growth rate.
                </li>
                <li>
                  <strong>YBE</strong> — the Year's Basic Exemption, a flat <InlineMath>$3,500</InlineMath>{" "}
                  that is subtracted from earnings when computing Tier 1 contributory amounts.
                </li>
              </ul>
              <p>
                The engine also computes <strong>AYMPE</strong> (5-year average YMPE ending in the
                start year) and <strong>AYAMPE</strong> (the equivalent for YAMPE). These are the
                indexes used to translate historical earnings into start-year dollars.
              </p>
              <Formula>
                AYMPE(start) = ( YMPE(start) + YMPE(start−1) + … + YMPE(start−4) ) / 5
              </Formula>
              <Example>
                <ExampleLine>
                  AYMPE({ex.profile.startYear}) = (
                  {ex.aympeYears.map((y) => fmt0(y.ympe)).join(" + ")}
                  ) / 5
                </ExampleLine>
                <ExampleLine>= {fmt0(ex.aympeStart)}</ExampleLine>
                <div className="text-xs text-muted-foreground">
                  Years past 2026 use the user's YMPE growth rate (default 3.1%) to project
                  forward.
                </div>
              </Example>

              <div className="mt-6 rounded-lg border border-border/60 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground print:border-slate-300 print:bg-white">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80 print:text-black">
                  Sources
                </p>
                <ul className="ml-5 list-disc space-y-1 leading-relaxed">
                  <li>
                    <strong>Contributory period</strong> — s. 49 of the{" "}
                    <SourceLink href="https://laws-lois.justice.gc.ca/eng/acts/c-8/FullText.html">
                      Canada Pension Plan Act (RSC 1985, c. C-8)
                    </SourceLink>
                    : January 1, 1966 or age 18 to the month before take-up, no later than age 70.
                  </li>
                  <li>
                    <strong>YAMPE</strong> (Year&apos;s Additional Maximum Pensionable Earnings) — CPP
                    Act s. 17.1. <strong>AYMPE / AYAMPE</strong> are the &quot;Maximum Pensionable
                    Earnings Average&quot; (5-year average) used for indexing — CPP Act s. 42(1).
                  </li>
                  <li>
                    <strong>Published YMPE, YAMPE and YBE values</strong> are the official annual
                    figures from{" "}
                    <SourceLink href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html">
                      canada.ca — CPP contribution rates, maximums and exemptions
                    </SourceLink>
                    .
                  </li>
                </ul>
              </div>
            </Section>

            <Section>
              <SectionHeading
                id="wp-ampe"
                eyebrow="Indexing"
                title="Average Monthly Pensionable Earnings (AMPE)"
                icon={<Sigma className="h-5 w-5" />}
              />
              <p>
                Each month in the contributory period is allocated{" "}
                <InlineMath>annual earnings ÷ 12</InlineMath> and capped at{" "}
                <InlineMath>YMPE(year) ÷ 12</InlineMath>. The capped monthly amount is then indexed
                to start-year dollars using the AYMPE ratio:
              </p>
              <Formula>
                indexed monthly(year) = capped monthly(year) × AYMPE(start) / YMPE(year)
              </Formula>
              <Example>
                <div className="text-xs text-muted-foreground">
                  Take a single month from {ex.ampeIndex.year} (a YMPE-max year). YMPE(
                  {ex.ampeIndex.year}) = {fmt0(ex.ampeIndex.ympe)}, so:
                </div>
                <ExampleLine>
                  capped monthly = {fmt0(ex.ampeIndex.ympe)} / 12 = {fmt2(ex.ampeIndex.cappedMonthly)}
                </ExampleLine>
                <ExampleLine>
                  indexed monthly = {fmt2(ex.ampeIndex.cappedMonthly)} × {fmt0(ex.aympeStart)} /{" "}
                  {fmt0(ex.ampeIndex.ympe)} = {fmt2(ex.ampeIndex.indexedMonthly)}
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  Indexing translates the {ex.ampeIndex.year} earning into {ex.profile.startYear}{" "}
                  dollars. For any YMPE-max year the result equals AYMPE(start) ÷ 12.
                </div>
              </Example>
              <p>
                After CRDO, disability, and the general 17% drop-out are applied (see below), AMPE
                is the simple average of the indexed monthly earnings that remain:
              </p>
              <Formula>
                AMPE = ( Σ indexed monthly earnings of retained months ) / (number of retained
                months)
              </Formula>
              <p>
                AMPE is then capped at <InlineMath>AYMPE(start) ÷ 12</InlineMath> — a maximum
                contributor cannot exceed the program's own ceiling.
              </p>
              <Example>
                <ExampleLine>
                  contributory months = {ex.base.contribMonths.toLocaleString()} (June {ex.profile.birthYear + 18}
                  → May {ex.profile.startYear}); retained after 17% drop-out ={" "}
                  {ex.base.monthsRetained.toLocaleString()}
                </ExampleLine>
                <ExampleLine>AMPE ≈ {fmt2(ex.ampe)} / month</ExampleLine>
                <ExampleLine>AMPE cap = AYMPE / 12 = {fmt2(ex.ampeCap)} / month</ExampleLine>
                <div className="text-xs text-muted-foreground">
                  This client never exceeds the AMPE cap. The 13 zero-earning years from age 18 to
                  30 keep AMPE just below the ceiling even with the drop-out applied.
                </div>
              </Example>

              <div className="mt-6 rounded-lg border border-border/60 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground print:border-slate-300 print:bg-white">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80 print:text-black">
                  Sources
                </p>
                <ul className="ml-5 list-disc space-y-1 leading-relaxed">
                  <li>
                    <strong>Average monthly pensionable earnings &amp; earnings indexing</strong> —
                    s. 48 of the{" "}
                    <SourceLink href="https://laws-lois.justice.gc.ca/eng/acts/c-8/FullText.html">
                      Canada Pension Plan Act (RSC 1985, c. C-8)
                    </SourceLink>
                    . Indexing uses the &quot;Maximum Pensionable Earnings Average&quot; defined in
                    s. 42(1).
                  </li>
                  <li>
                    Plain-language overview of how the calculated amount is built:{" "}
                    <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/amount.html">
                      canada.ca — How much you could receive
                    </SourceLink>
                    .
                  </li>
                </ul>
              </div>
            </Section>

            <Section>
              <SectionHeading
                id="wp-base"
                eyebrow="Component 1"
                title="Base CPP (pre-2019 design)"
                icon={<Calculator className="h-5 w-5" />}
              />
              <p>
                Base CPP replaces 25% of AMPE at age 65. Take-up at any other age multiplies the
                result by the adjustment factor (see below):
              </p>
              <Formula>
                Base monthly = AMPE × 0.25 × adjustment factor(start age)
              </Formula>
              <Example>
                <ExampleLine>
                  Base monthly at 65 = {fmt2(ex.ampe)} × 0.25 × 1.000 ={" "}
                  {fmt2(ex.base.monthlyAt65)}
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  At age 65 the adjustment factor is exactly 1.0; early/late take-up is shown
                  further below.
                </div>
              </Example>
              <p>
                Base CPP applies to the entire contributory period back to 1966 and continues to
                exist alongside the Tier 1 and Tier 2 enhancements — it is not replaced by them.
              </p>

              <div className="mt-6 rounded-lg border border-border/60 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground print:border-slate-300 print:bg-white">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80 print:text-black">
                  Sources
                </p>
                <ul className="ml-5 list-disc space-y-1 leading-relaxed">
                  <li>
                    <strong>25% base replacement rate</strong> — s. 46(1)(a) of the{" "}
                    <SourceLink href="https://laws-lois.justice.gc.ca/eng/acts/c-8/FullText.html">
                      Canada Pension Plan Act (RSC 1985, c. C-8)
                    </SourceLink>
                    : the basic monthly amount is 25% of average monthly pensionable earnings.
                  </li>
                  <li>
                    Plain-language reference:{" "}
                    <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/amount.html">
                      canada.ca — How much you could receive
                    </SourceLink>
                    .
                  </li>
                </ul>
              </div>
            </Section>

            <Section>
              <SectionHeading
                id="wp-tier1"
                eyebrow="Component 2"
                title="Tier 1 enhancement (post-2018)"
                icon={<Calculator className="h-5 w-5" />}
              />
              <p>
                The 2019 first additional contribution adds an additional 8⅓% replacement on
                YMPE-band earnings (above the YBE). Each year between 2019 and 2023 phases in a
                share of the full 8⅓% rate:
              </p>
              <ul className="ml-5 list-disc space-y-1 text-muted-foreground">
                <li>2019 = 15% × 8⅓%</li>
                <li>2020 = 30% × 8⅓%</li>
                <li>2021 = 50% × 8⅓%</li>
                <li>2022 = 75% × 8⅓%</li>
                <li>2023 and later = 100% × 8⅓%</li>
              </ul>
              <p>For each contribution year:</p>
              <Formula>
                tier 1 earnings(year) = min(earnings, YMPE(year)) − YBE
                <br />
                indexed(year) = tier 1 earnings(year) × AYMPE(start) / YMPE(year)
                <br />
                weighted(year) = indexed(year) × phase-in(year)
              </Formula>
              <Example>
                <div className="text-xs text-muted-foreground">
                  Phase-in year {ex.tier1.phaseExample.year} (factor{" "}
                  {pct1(ex.tier1.phaseExample.phaseFactor)} of full rate):
                </div>
                <ExampleLine>
                  tier 1 earnings = min({fmt0(ex.tier1.phaseExample.ympe)},{" "}
                  {fmt0(ex.tier1.phaseExample.ympe)}) − $3,500 ={" "}
                  {fmt0(ex.tier1.phaseExample.tier1Earn)}
                </ExampleLine>
                <ExampleLine>
                  indexed = {fmt0(ex.tier1.phaseExample.tier1Earn)} × {fmt0(ex.aympeStart)} /{" "}
                  {fmt0(ex.tier1.phaseExample.ympe)} = {fmt0(ex.tier1.phaseExample.indexed)}
                </ExampleLine>
                <ExampleLine>
                  weighted = {fmt0(ex.tier1.phaseExample.indexed)} ×{" "}
                  {pct1(ex.tier1.phaseExample.phaseFactor)} ={" "}
                  {fmt0(ex.tier1.phaseExample.weighted)}
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  Fully phased-in year {ex.tier1.fullExample.year} (factor 100%):
                </div>
                <ExampleLine>
                  weighted = ({fmt0(ex.tier1.fullExample.ympe)} − $3,500) × {fmt0(ex.aympeStart)} /{" "}
                  {fmt0(ex.tier1.fullExample.ympe)} × 100% ={" "}
                  {fmt0(ex.tier1.fullExample.weighted)}
                </ExampleLine>
              </Example>
              <p>
                The annual benefit at 65 is the average weighted amount times the full replacement
                rate, multiplied by an accrual factor that reaches 1.0 only after{" "}
                <InlineMath>40</InlineMath> years of contributions:
              </p>
              <Formula>
                accrual = min(1, contribution years / 40)
                <br />
                tier 1 annual at 65 = ( Σ weighted / years ) × 8⅓% × accrual
                <br />
                tier 1 monthly = tier 1 annual at 65 × adjustment factor / 12
              </Formula>
              <Example>
                <ExampleLine>
                  contribution years (2019 → {ex.profile.startYear - 1}) ={" "}
                  {ex.tier1.contributionYears}
                </ExampleLine>
                <ExampleLine>
                  accrual = min(1, {ex.tier1.contributionYears} / {ex.tier1.enhancementFullYears})
                  = {ex.tier1.accrualFactor.toFixed(3)}
                </ExampleLine>
                <ExampleLine>
                  tier 1 monthly at 65 ≈ {fmt2(ex.tier1.monthlyAt65)}
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  This client only has {ex.tier1.contributionYears} years inside the Tier 1 window,
                  so the accrual factor of {ex.tier1.accrualFactor.toFixed(3)} keeps the Tier 1
                  contribution well below its eventual ceiling.
                </div>
              </Example>
              <p>
                Unlike base CPP, the enhancement has no drop-out for zero-earning years. Instead,
                caregiving years covered by a child-rearing (CRDO) claim receive a{" "}
                <strong>drop-in</strong>: the engine credits each such year with an imputed income
                equal to the average pensionable earnings of the five years before the window
                started (CPP Act s. 53.3(1)), and uses the higher of real and imputed earnings in
                the Tier 1 sums. A parallel rule applies to disability years. The worked drop-in
                example lives in the{" "}
                <a href="#wp-dropouts" className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary print:text-black print:no-underline">
                  Drop-out provisions
                </a>{" "}
                section.
              </p>

              <div className="mt-6 rounded-lg border border-border/60 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground print:border-slate-300 print:bg-white">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80 print:text-black">
                  Sources
                </p>
                <ul className="ml-5 list-disc space-y-1 leading-relaxed">
                  <li>
                    <strong>8⅓% first additional replacement rate</strong> — s. 46(1)(b) of the{" "}
                    <SourceLink href="https://laws-lois.justice.gc.ca/eng/acts/c-8/FullText.html">
                      Canada Pension Plan Act (RSC 1985, c. C-8)
                    </SourceLink>
                    ; first additional monthly pensionable earnings are defined in s. 48.1 and the
                    first additional contributory period in s. 49.1.
                  </li>
                  <li>
                    <strong>Phase-in proportions</strong> (2019 × 0.15, 2020 × 0.3, 2021 × 0.5,
                    2022 × 0.75, 2023+ × 1.0) — CPP Act s. 51.
                  </li>
                  <li>
                    Plain-language reference:{" "}
                    <SourceLink href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-enhancement.html">
                      canada.ca — CPP and the CPP enhancement
                    </SourceLink>
                    .
                  </li>
                </ul>
              </div>
            </Section>

            <Section>
              <SectionHeading
                id="wp-tier2"
                eyebrow="Component 3"
                title="Tier 2 enhancement (post-2023)"
                icon={<Calculator className="h-5 w-5" />}
              />
              <p>
                The 2024 second additional contribution applies a 33⅓% replacement to earnings
                between YMPE and YAMPE. There is no phase-in: the rate is fully effective from 2024
                onward.
              </p>
              <Formula>
                tier 2 earnings(year) = min(earnings, YAMPE(year)) − YMPE(year)
                <br />
                indexed(year) = tier 2 earnings(year) × AYAMPE(start) / YAMPE(year)
                <br />
                accrual = min(1, contribution years / 40)
                <br />
                tier 2 annual at 65 = ( Σ indexed / years ) × 33⅓% × accrual
                <br />
                tier 2 monthly = tier 2 annual at 65 × adjustment factor / 12
              </Formula>
              <Example>
                <div className="text-xs text-muted-foreground">
                  Our 35-year YMPE-max client never crosses YMPE, so their Tier 2 = $0. To
                  illustrate the band, take {ex.tier2.yearExample.year} (the first Tier 2 year):
                </div>
                <ExampleLine>
                  tier 2 earnings = min(YAMPE, earnings) − YMPE = {fmt0(ex.tier2.yearExample.yampe)} −{" "}
                  {fmt0(ex.tier2.yearExample.ympe)} = {fmt0(ex.tier2.yearExample.tier2Earn)}
                </ExampleLine>
                <ExampleLine>
                  indexed = {fmt0(ex.tier2.yearExample.tier2Earn)} × {fmt0(ex.ayampeStart)} /{" "}
                  {fmt0(ex.tier2.yearExample.yampe)} = {fmt0(ex.tier2.yearExample.indexed)}
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  If that client instead earned the YAMPE-max every year from 2024 onward (
                  {ex.tier2.altScenarioContributionYears} years, accrual{" "}
                  {ex.tier2.altScenarioAccrualFactor.toFixed(3)}), tier 2 monthly at 65 ≈{" "}
                  {fmt2(ex.tier2.altScenarioMonthlyAt65)}.
                </div>
              </Example>
              <p>
                Tier 2 only contributes to the result when the client has earnings above the YMPE
                ceiling in 2024 or later.
              </p>

              <div className="mt-6 rounded-lg border border-border/60 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground print:border-slate-300 print:bg-white">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80 print:text-black">
                  Sources
                </p>
                <ul className="ml-5 list-disc space-y-1 leading-relaxed">
                  <li>
                    <strong>33⅓% second additional replacement rate</strong> — s. 46(1)(c) of the{" "}
                    <SourceLink href="https://laws-lois.justice.gc.ca/eng/acts/c-8/FullText.html">
                      Canada Pension Plan Act (RSC 1985, c. C-8)
                    </SourceLink>
                    ; second additional monthly pensionable earnings are defined in s. 48.2, applied
                    to the band between YMPE and YAMPE (s. 17.1).
                  </li>
                  <li>
                    Plain-language reference:{" "}
                    <SourceLink href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-enhancement.html">
                      canada.ca — CPP and the CPP enhancement
                    </SourceLink>
                    .
                  </li>
                </ul>
              </div>
            </Section>

            <Section>
              <SectionHeading
                id="wp-enhancement-accrual"
                eyebrow="How the 40-year clock works"
                title="Enhanced CPP accrual (years contributed)"
                icon={<Calculator className="h-5 w-5" />}
              />
              <p>
                Unlike base CPP — which spreads earnings over the entire contributory period and
                forgives the lowest <InlineMath>17%</InlineMath> of years — the Tier 1 and Tier 2
                enhancements credit each calendar year of contributions on a strictly linear
                clock. A contributor needs <InlineMath>40</InlineMath> years inside the
                enhancement window to earn the full enhanced benefit; fewer years scale the
                benefit down proportionally.
              </p>
              <Formula>
                accrual = min(1, contribution years / 40)
                <br />
                enhanced benefit = (average indexed pensionable earnings × replacement rate) ×
                accrual
              </Formula>
              <Example>
                <div className="text-xs text-muted-foreground">
                  Example: 20 years of full Tier 1 contributions.
                </div>
                <ExampleLine>contribution years = 20</ExampleLine>
                <ExampleLine>accrual = min(1, 20 / 40) = 0.500</ExampleLine>
                <ExampleLine>
                  enhanced benefit = (average indexed YMPE-band earnings × 8⅓%) × 0.500
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  The same client with 40 years of identical contributions would land at accrual
                  = 1.000 — exactly twice the monthly Tier 1 amount.
                </div>
              </Example>
              <p>
                Tier 1 and Tier 2 each maintain their own accrual count. Because Tier 1 starts in
                2019 and Tier 2 in 2024, the earliest year either component can reach a full
                <InlineMath>1.0</InlineMath> accrual is 2058 (Tier 1) and 2063 (Tier 2). For any
                client retiring before then, the enhanced benefit is mechanically capped by the
                accrual fraction — regardless of how high their earnings are.
              </p>
              <div className="overflow-x-auto rounded-md border border-border/60 bg-card/40">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Years contributed</th>
                      <th className="px-4 py-2 text-right font-medium">Accrual fraction</th>
                      <th className="px-4 py-2 text-right font-medium">% of full enhanced benefit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 tabular-nums">
                    <tr><td className="px-4 py-2">5</td><td className="px-4 py-2 text-right">5 / 40</td><td className="px-4 py-2 text-right">12.5%</td></tr>
                    <tr><td className="px-4 py-2">10</td><td className="px-4 py-2 text-right">10 / 40</td><td className="px-4 py-2 text-right">25.0%</td></tr>
                    <tr><td className="px-4 py-2">15</td><td className="px-4 py-2 text-right">15 / 40</td><td className="px-4 py-2 text-right">37.5%</td></tr>
                    <tr><td className="px-4 py-2">20</td><td className="px-4 py-2 text-right">20 / 40</td><td className="px-4 py-2 text-right">50.0%</td></tr>
                    <tr><td className="px-4 py-2">25</td><td className="px-4 py-2 text-right">25 / 40</td><td className="px-4 py-2 text-right">62.5%</td></tr>
                    <tr><td className="px-4 py-2">30</td><td className="px-4 py-2 text-right">30 / 40</td><td className="px-4 py-2 text-right">75.0%</td></tr>
                    <tr><td className="px-4 py-2">35</td><td className="px-4 py-2 text-right">35 / 40</td><td className="px-4 py-2 text-right">87.5%</td></tr>
                    <tr><td className="px-4 py-2">40 (or more)</td><td className="px-4 py-2 text-right">40 / 40</td><td className="px-4 py-2 text-right">100.0%</td></tr>
                  </tbody>
                </table>
              </div>
              <p>
                Three caveats make the picture less generous than the table alone suggests:
              </p>
              <ul className="ml-5 list-disc space-y-2 text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">No drop-outs.</span> The general
                  <InlineMath>17%</InlineMath> drop-out, CRDO and disability drop-outs all apply
                  to base CPP only. Every calendar year between the enhancement start year (2019
                  for Tier 1, 2024 for Tier 2) and take-up that the client did not work counts as
                  a zero in the numerator average — even though it still consumes a slot in the
                  <InlineMath>40</InlineMath>-year denominator. A career break or early
                  retirement bites both ways.
                </li>
                <li>
                  <span className="font-medium text-foreground">Phase-in years count, but
                  partially.</span> Tier 1 years 2019 through 2022 are credited toward the
                  accrual count as full years, but their indexed earnings are weighted down by
                  the phase-in factor (15% → 30% → 50% → 75%). A contributor who maxed every year
                  from 2019 onward gets the full year count, but the early years contribute less
                  to the average than later years.
                </li>
                <li>
                  <span className="font-medium text-foreground">Tier 2 only fires above the
                  YMPE.</span> Years where the client earned below the YMPE add nothing to the
                  Tier 2 contribution count — the enhancement formula treats the year as if no
                  Tier 2 contribution was made. This means a moderate earner can build up Tier 1
                  accrual while making no Tier 2 progress at all.
                </li>
              </ul>
              <p>
                In practice, the accrual fraction is the single biggest reason mid-career and
                late-career clients see modest enhanced amounts even when their recent earnings
                are at the YMPE. The clock simply has not finished running.
              </p>

              <div className="mt-6 rounded-lg border border-border/60 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground print:border-slate-300 print:bg-white">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80 print:text-black">
                  Sources
                </p>
                <ul className="ml-5 list-disc space-y-1 leading-relaxed">
                  <li>
                    <strong>40-year (480-month) full-accrual basis</strong> follows from the
                    enhanced pension being built on first/second additional monthly pensionable
                    earnings averaged over the additional contributory period — s. 48.1 and s. 48.2
                    of the{" "}
                    <SourceLink href="https://laws-lois.justice.gc.ca/eng/acts/c-8/FullText.html">
                      Canada Pension Plan Act (RSC 1985, c. C-8)
                    </SourceLink>
                    .
                  </li>
                  <li>
                    The enhancement replaces a share of average career earnings over roughly 40
                    years of contributions:{" "}
                    <SourceLink href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-enhancement.html">
                      canada.ca — CPP and the CPP enhancement
                    </SourceLink>
                    .
                  </li>
                </ul>
              </div>
            </Section>

            <Section>
              <SectionHeading
                id="wp-dropouts"
                eyebrow="Drop-outs"
                title="Drop-out provisions"
                icon={<Layers className="h-5 w-5" />}
              />
              <p>
                Drop-outs remove low- or zero-earning months from the contributory period before AMPE
                is averaged. The order matters: disability and beneficial child-rearing months are
                removed first, then the general drop-out is applied to whatever is left.
              </p>
              <ul className="ml-5 list-disc space-y-2">
                <li>
                  <strong>Child Rearing Drop-Out (CRDO).</strong> Months while a parent was the
                  primary caregiver of a child under age 7 can be excluded from the contributory
                  period — but only when it helps. The user enters the start and end month of each
                  CRDO window; the engine drops a month in that window only if its indexed earnings
                  are below the running average — i.e. only when dropping it raises AMPE. Months
                  where the parent still earned at or above their average are kept, so a CRDO claim
                  never lowers the benefit.
                </li>
                <li>
                  <strong>Disability drop-out.</strong> Months during a CPP disability period are
                  excluded from the contributory period unconditionally. Months that overlap both a
                  CRDO and a disability period are counted once (CRDO takes precedence in the
                  diagnostics).
                </li>
                <li>
                  <strong>Post-65 / late take-up drop-out (a.k.a. "age 65 drop-out").</strong> When
                  take-up is delayed past 65, months between turning 65 and the take-up month are
                  removed from the contributory period if their indexed earnings are below the
                  running mean — i.e. only when dropping them raises AMPE. High-earning post-65
                  months stay (they actively raise AMPE); zero- or low-earning months are removed.
                  This is a separate provision from the 17% drop-out and does not consume the 17%
                  allowance. Without this rule, a client who stops working at 65 and delays CPP to
                  70 would see their age-70 base CPP fall below age-65 base × 1.42.
                </li>
                <li>
                  <strong>General 17% drop-out.</strong> After the special drop-outs above are
                  applied, the engine drops the lowest{" "}
                  <InlineMath>floor(0.17 × remaining months)</InlineMath> indexed monthly amounts —
                  in practice the worst earning years for the contributor.
                </li>
              </ul>
              <p>
                The four rules above govern the <strong>base</strong> CPP only. The{" "}
                <strong>enhanced</strong> CPP (the first and second additional components) has no
                drop-out. Instead it uses <strong>drop-ins</strong> that credit an <em>imputed</em>{" "}
                income for protected periods, using the higher of the real or imputed income for each
                affected year:
              </p>
              <ul className="ml-5 list-disc space-y-2">
                <li>
                  <strong>Child-rearing drop-in.</strong> For the years a parent cared for a child
                  under 7, the imputed income is the average of the parent's pensionable earnings in
                  the five years immediately before the child's birth. The engine derives the birth
                  year from the start of each child-rearing window, so a single CRDO entry drives
                  both the base drop-out and the enhanced drop-in. If the parent had no earnings in
                  the five years before the birth, there is no imputed income and the drop-in has no
                  effect.
                </li>
                <li>
                  <strong>Disability drop-in.</strong> For the years a contributor received a CPP
                  disability pension, the imputed income is 70% of the average pensionable earnings
                  in the six years before disability onset. This protects the enhanced component from
                  the low-income disability years — the base component simply excludes those months
                  instead (see the disability drop-out above). Like the rest of the enhanced
                  component, both drop-ins operate at annual granularity (the engine works from
                  yearly pensionable earnings), so they apply across each calendar year the protected
                  window touches.
                </li>
              </ul>
              <Example>
                <ExampleLine>
                  contributory months = {ex.base.contribMonths.toLocaleString()}; dropped = floor(
                  {pct1(ex.base.dropoutRate)} × {ex.base.contribMonths.toLocaleString()}) ={" "}
                  {ex.base.generalDropoutMonths.toLocaleString()}; retained ={" "}
                  {ex.base.monthsRetained.toLocaleString()}
                </ExampleLine>
                <ExampleLine>
                  base monthly with drop-out = {fmt2(ex.base.monthlyWithDropout)}
                </ExampleLine>
                <ExampleLine>
                  base monthly without drop-out (dilute by zero years) ≈{" "}
                  {fmt2(ex.base.monthlyNoDropout)}
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  The drop-out lifts this client's base CPP by ≈ {fmt2(ex.base.dropoutLift)} / month
                  by removing the worst-earning months (their 1980s zero-earning years before
                  starting work).
                </div>
              </Example>

              <Example
                label={`Parent client, born June ${ex.profile.birthYear}, ${ex.crdoExample.yearsOff} years out of the workforce raising young children`}
              >
                <div className="text-xs text-muted-foreground">
                  Same June {ex.profile.birthYear} birth and start age (65 in {ex.profile.startYear}
                  ), but this parent worked at YMPE-max from {ex.crdoExample.workStartYear} onward
                  except for {ex.crdoExample.gapStartYear}–{ex.crdoExample.gapEndYear} (
                  {ex.crdoExample.monthsOff} months at home with young children, zero pensionable
                  earnings). Both numbers below are produced by running the engine with vs without
                  a CRDO claim covering that window.
                </div>
                <ExampleLine>
                  without CRDO: contributory months ={" "}
                  {ex.crdoExample.contribMonths.toLocaleString()}, general drop-out removes{" "}
                  {ex.crdoExample.generalDropoutMonthsWithout.toLocaleString()}, retained ={" "}
                  {ex.crdoExample.monthsRetainedWithout.toLocaleString()}
                </ExampleLine>
                <ExampleLine>
                  → AMPE ≈ {fmt2(ex.crdoExample.ampeWithout)} / mo, base CPP ≈{" "}
                  {fmt2(ex.crdoExample.baseMonthlyWithout)} / mo, total CPP ≈{" "}
                  {fmt2(ex.crdoExample.totalMonthlyWithout)} / mo
                </ExampleLine>
                <ExampleLine>
                  with CRDO: {ex.crdoExample.crdoMonthsDropped.toLocaleString()} months removed
                  first, then general drop-out removes{" "}
                  {ex.crdoExample.generalDropoutMonthsWith.toLocaleString()}, retained ={" "}
                  {ex.crdoExample.monthsRetainedWith.toLocaleString()}
                </ExampleLine>
                <ExampleLine>
                  → AMPE ≈ {fmt2(ex.crdoExample.ampeWith)} / mo, base CPP ≈{" "}
                  {fmt2(ex.crdoExample.baseMonthlyWith)} / mo, total CPP ≈{" "}
                  {fmt2(ex.crdoExample.totalMonthlyWith)} / mo
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  Claiming the CRDO lifts this parent's base CPP by ≈{" "}
                  {fmt2(ex.crdoExample.baseLift)} / month (≈ {fmt2(ex.crdoExample.totalLift)} / mo
                  on the total) — the parental window is removed before the 17% drop-out is
                  computed, so more low-earning months get caught by the drop-out instead of
                  pulling AMPE down. Their break predates the 2019 enhancement, so the CRDO claim
                  moves only base CPP — the enhancement-era drop-in below shows the Tier 1 side.
                </div>
              </Example>

              <Example
                label={`Parent client, born June ${ex.crdoDropInExample.birthYear}, ${ex.crdoDropInExample.yearsOff} caregiving years inside the enhancement era`}
              >
                <div className="text-xs text-muted-foreground">
                  YMPE-max work from {ex.crdoDropInExample.workStartYear}, except{" "}
                  {ex.crdoDropInExample.gapStartYear}–{ex.crdoDropInExample.gapEndYear} at home
                  with young children (zero pensionable earnings); retires at{" "}
                  {ex.crdoDropInExample.startAge} in {ex.crdoDropInExample.startYear}. Because the
                  caregiving window sits inside the Tier 1 era, the child-rearing{" "}
                  <strong>drop-in</strong> credits each of those years with the average
                  pensionable earnings of the five years before the window.
                </div>
                <ExampleLine>
                  imputed income per caregiving year = avg(
                  {ex.crdoDropInExample.gapStartYear - 5}–{ex.crdoDropInExample.gapStartYear - 1}{" "}
                  earnings) ≈ {fmt0(ex.crdoDropInExample.imputedAnnual)} / yr, dropped into{" "}
                  {ex.crdoDropInExample.dropInYears} years
                </ExampleLine>
                <ExampleLine>
                  tier 1 monthly without claim ≈ {fmt2(ex.crdoDropInExample.tier1MonthlyWithout)}{" "}
                  → with claim ≈ {fmt2(ex.crdoDropInExample.tier1MonthlyWith)} (lift ≈{" "}
                  {fmt2(ex.crdoDropInExample.tier1Lift)} / mo)
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  On top of the base-CPP uplift of ≈ {fmt2(ex.crdoDropInExample.baseLift)} / month
                  from the drop-out, the drop-in adds ≈ {fmt2(ex.crdoDropInExample.tier1Lift)} /
                  month of Tier 1 credit that would otherwise be lost — a total lift of ≈{" "}
                  {fmt2(ex.crdoDropInExample.totalLift)} / month. The per-year imputed amounts are
                  shown in the calculator's diagnostics breakdown.
                </div>
              </Example>

              <Example
                label={`Same client, take-up delayed to age 70 (${ex.lateTakeUpExample.startYear}) with no earnings 65 → 70`}
              >
                <div className="text-xs text-muted-foreground">
                  Same June {ex.profile.birthYear} birth and same {ex.profile.yearsOfMaxEarnings}{" "}
                  years of YMPE-max earnings, but this client stops working at 65 and delays CPP to
                  70. The five years of zero earnings between 65 and take-up would otherwise drag
                  AMPE down through the longer contributory period; the post-65 drop-out removes
                  them so the actuarial 1.42 uplift survives intact.
                </div>
                <ExampleLine>
                  contributory months at 70 ={" "}
                  {ex.lateTakeUpExample.contribMonths.toLocaleString()}; post-65 drop-out removes{" "}
                  {ex.lateTakeUpExample.post65DropoutMonths}; general 17% drop-out then removes{" "}
                  {ex.lateTakeUpExample.generalDropoutMonths.toLocaleString()}; retained ={" "}
                  {ex.lateTakeUpExample.monthsRetained.toLocaleString()}
                </ExampleLine>
                <ExampleLine>
                  AMPE at 70 = {fmt2(ex.lateTakeUpExample.ampe)} / mo (the post-65 zeros are
                  removed, so AMPE reflects only the YMPE-max earning years indexed forward to{" "}
                  {ex.lateTakeUpExample.startYear} dollars)
                </ExampleLine>
                <ExampleLine>
                  base CPP at 70 = AMPE × 25% × {fmt2(ex.lateTakeUpExample.adjustmentFactor)} ={" "}
                  {fmt2(ex.lateTakeUpExample.baseMonthly)} / mo (vs base CPP at 65 ={" "}
                  {fmt2(ex.lateTakeUpExample.baseMonthly65)} / mo — ratio{" "}
                  {(ex.lateTakeUpExample.baseMonthly / ex.lateTakeUpExample.baseMonthly65).toFixed(
                    3,
                  )}
                  , at or above the 1.42 actuarial factor)
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  Without the post-65 drop-out, this client's base CPP at 70 would collapse to ≈{" "}
                  {fmt2(ex.lateTakeUpExample.baseMonthlyWithoutRule)} / mo (a ratio of only{" "}
                  {(
                    ex.lateTakeUpExample.baseMonthlyWithoutRule /
                    ex.lateTakeUpExample.baseMonthly65
                  ).toFixed(3)}{" "}
                  vs age 65) — the five years of post-65 zero earnings would dilute AMPE below
                  AMPE_65 even after the 17% drop-out absorbs as many as it can.
                </div>
              </Example>

              <Example
                label={`Worker client, born June ${ex.profile.birthYear}, ${ex.disabilityExample.yearsOff}-year disability window mid-career`}
              >
                <div className="text-xs text-muted-foreground">
                  Same birth and start age, started YMPE-max work in{" "}
                  {ex.disabilityExample.workStartYear}, then a{" "}
                  {ex.disabilityExample.yearsOff}-year disability window from{" "}
                  {ex.disabilityExample.gapStartYear} to {ex.disabilityExample.gapEndYear} (
                  {ex.disabilityExample.monthsOff} months, zero pensionable earnings). Compared
                  with vs without a disability drop-out claim covering that window.
                </div>
                <ExampleLine>
                  without claim: contributory months ={" "}
                  {ex.disabilityExample.contribMonths.toLocaleString()}, general drop-out removes{" "}
                  {ex.disabilityExample.generalDropoutMonthsWithout.toLocaleString()}, retained ={" "}
                  {ex.disabilityExample.monthsRetainedWithout.toLocaleString()}
                </ExampleLine>
                <ExampleLine>
                  → AMPE ≈ {fmt2(ex.disabilityExample.ampeWithout)} / mo, base CPP ≈{" "}
                  {fmt2(ex.disabilityExample.baseMonthlyWithout)} / mo, total CPP ≈{" "}
                  {fmt2(ex.disabilityExample.totalMonthlyWithout)} / mo
                </ExampleLine>
                <ExampleLine>
                  with claim:{" "}
                  {ex.disabilityExample.disabilityMonthsDropped.toLocaleString()} months removed
                  first, then general drop-out removes{" "}
                  {ex.disabilityExample.generalDropoutMonthsWith.toLocaleString()}, retained ={" "}
                  {ex.disabilityExample.monthsRetainedWith.toLocaleString()}
                </ExampleLine>
                <ExampleLine>
                  → AMPE ≈ {fmt2(ex.disabilityExample.ampeWith)} / mo, base CPP ≈{" "}
                  {fmt2(ex.disabilityExample.baseMonthlyWith)} / mo, total CPP ≈{" "}
                  {fmt2(ex.disabilityExample.totalMonthlyWith)} / mo
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  Claiming the disability drop-out lifts base CPP by ≈{" "}
                  {fmt2(ex.disabilityExample.baseLift)} / month (≈{" "}
                  {fmt2(ex.disabilityExample.totalLift)} / mo on the total) for the same earnings
                  history — a meaningful uplift advisors should make sure clients who qualified for
                  CPP-D apply for.
                </div>
              </Example>

              <div className="mt-6 rounded-lg border border-border/60 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground print:border-slate-300 print:bg-white">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80 print:text-black">
                  Sources
                </p>
                <p className="mb-2 leading-relaxed">
                  All four drop-out rules are codified in the{" "}
                  <SourceLink href="https://laws-lois.justice.gc.ca/eng/acts/c-8/FullText.html">
                    Canada Pension Plan Act (RSC 1985, c. C-8)
                  </SourceLink>{" "}
                  and administered by Service Canada / Employment and Social Development Canada:
                </p>
                <ul className="ml-5 list-disc space-y-1 leading-relaxed">
                  <li>
                    <strong>General drop-out (17%)</strong> — s. 48(4)(a)(i). The statutory rate
                    phased up from 15% (before 2012) to 16% (2012–2013) to 17% (after December
                    2013).
                  </li>
                  <li>
                    <strong>Child Rearing Drop-Out (CRDO)</strong> — s. 48(2)(a), with the
                    contributory-period exclusion in s. 49(d). Plain-language reference:{" "}
                    <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/child-rearing.html">
                      canada.ca — Child-rearing provisions
                    </SourceLink>
                    .
                  </li>
                  <li>
                    <strong>Disability drop-out (base component)</strong> — s. 49(c): months
                    excluded from the contributory period by reason of disability.
                  </li>
                  <li>
                    <strong>Enhanced CPP child-rearing drop-in</strong> — s. 53.3(1) (first
                    additional component) and s. 53.4(1) (second additional component): imputed
                    earnings based on the five years before the child's birth, used when higher than
                    actual earnings (for months after January 1, 2019). Plain-language reference:{" "}
                    <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/child-rearing.html">
                      canada.ca — Child-rearing provisions ("Child rearing drop-in")
                    </SourceLink>
                    .
                  </li>
                  <li>
                    <strong>Enhanced CPP disability drop-in</strong> — s. 53.3/53.4 (additional
                    plan): for months a contributor received a CPP disability pension, the enhanced
                    component credits an imputed income worth 70% of average pensionable earnings in
                    the six years before disability onset, used when higher than actual earnings.
                    Plain-language reference:{" "}
                    <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/amount.html">
                      canada.ca — CPP amount ("Periods of disability")
                    </SourceLink>
                    .
                  </li>
                  <li>
                    <strong>Post-65 / late take-up drop-out</strong> — s. 48(3): deductions where
                    the contributory period ends after age 65.
                  </li>
                  <li>
                    <strong>Contributory period</strong> (the window the drop-outs apply to) — s.
                    49: January 1, 1966 or age 18, ending the month before take-up (no later than
                    age 70).
                  </li>
                </ul>
              </div>
            </Section>

            <Section>
              <SectionHeading
                id="wp-adjustments"
                eyebrow="Take-up age"
                title="Early / late start adjustments (60–70, monthly)"
                icon={<Sigma className="h-5 w-5" />}
              />
              <p>
                CPP can begin as early as age 60 and as late as age 70. The engine applies the
                statutory monthly adjustment factor at monthly precision (so age 64 + 7 months is
                priced precisely, not rounded to 64):
              </p>
              <ul className="ml-5 list-disc space-y-1 text-muted-foreground">
                <li>Before 65: −0.6% per month early (max −36% at age 60).</li>
                <li>At 65: 1.00 (no adjustment).</li>
                <li>After 65: +0.7% per month late (max +42% at age 70).</li>
              </ul>
              <Formula>
                if start &lt; 65: factor = 1 − 0.006 × months early
                <br />
                if start &gt; 65: factor = 1 + 0.007 × months late
              </Formula>
              <Example>
                <ExampleLine>
                  age 60 → factor = 1 − 0.006 × 60 = {ex.adjustment.factor60.toFixed(3)} → total
                  monthly = {fmt2(ex.adjustment.total60)}
                </ExampleLine>
                <ExampleLine>
                  age 65 → factor = {ex.adjustment.factor65.toFixed(3)} → total monthly ={" "}
                  {fmt2(ex.adjustment.total65)}
                </ExampleLine>
                <ExampleLine>
                  age 70 → factor = 1 + 0.007 × 60 = {ex.adjustment.factor70.toFixed(3)} → total
                  monthly = {fmt2(ex.adjustment.total70)}
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  Same client, same earnings record — only the take-up age differs. The factor
                  scales the base, Tier 1, and Tier 2 portions together.
                </div>
              </Example>

              <div className="mt-6 rounded-lg border border-border/60 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground print:border-slate-300 print:bg-white">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80 print:text-black">
                  Sources
                </p>
                <ul className="ml-5 list-disc space-y-1 leading-relaxed">
                  <li>
                    <strong>Actuarial adjustment for early/late take-up</strong> is authorized by
                    s. 46(3)–(6) of the{" "}
                    <SourceLink href="https://laws-lois.justice.gc.ca/eng/acts/c-8/FullText.html">
                      Canada Pension Plan Act (RSC 1985, c. C-8)
                    </SourceLink>
                    ; the specific −0.6%/month (before 65) and +0.7%/month (after 65) factors are
                    prescribed by regulation.
                  </li>
                  <li>
                    Published rates (max −36% at 60, +42% at 70):{" "}
                    <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/when-start.html">
                      canada.ca — When to start your retirement pension
                    </SourceLink>
                    .
                  </li>
                </ul>
              </div>
            </Section>

            <Section>
              <SectionHeading
                id="wp-percent-of-maximum"
                eyebrow="Benchmarking"
                title="Percent of the maximum CPP retirement pension"
                icon={<Target className="h-5 w-5" />}
              />
              <p>
                The result cards show each start age as a percentage of the maximum CPP retirement
                pension a person taking up at that same age in that same year could receive. To make
                the ratio meaningful, both numerator and denominator must be in the same year's
                dollars — so the engine projects the maximum forward to the chosen start year and
                applies the actuarial adjustment for the start age before dividing.
              </p>
              <p>
                The CPP maximum is{" "}
                <strong>wage-indexed (it grows with the YMPE) before take-up</strong>, then
                CPI-indexed once the benefit is in payment. The engine therefore projects the
                published max-at-65 forward using <InlineMath>ympeGrowthRate</InlineMath> (≈ 3.1%
                by default), <em>not</em> <InlineMath>indexingRate</InlineMath> (CPI ≈ 2.1%). This
                matches how Service Canada re-bases the maximum each January using the same wage
                growth that drives YMPE.
              </p>
              <Formula>
                max at 65 (start year) = max at 65 (latest published) × (1 + ympeGrowthRate)^(years
                forward)
                <br />
                max at start age = max at 65 (start year) × adjustment factor(start age)
                <br />
                % of maximum = total monthly ÷ max at start age
              </Formula>
              <Example>
                <div className="text-xs text-muted-foreground">
                  Same {ex.profile.label.toLowerCase()}. Each take-up age has its own start year
                  ({ex.maximum.startYear60}, {ex.maximum.startYear65}, {ex.maximum.startYear70}),
                  so the max-at-65 is re-projected for each age at the default{" "}
                  {pct1(ex.maximum.ympeGrowthRate)} YMPE growth before the actuarial factor is
                  applied.
                </div>
                <ExampleLine>
                  age 60 → max at 65 in {ex.maximum.startYear60} ={" "}
                  {fmt2(ex.maximum.maxAt65InStartYear60)} → ×{" "}
                  {ex.adjustment.factor60.toFixed(3)} = {fmt2(ex.maximum.maxAt60)} / mo →{" "}
                  {fmt2(ex.adjustment.total60)} ÷ {fmt2(ex.maximum.maxAt60)} ={" "}
                  {pct1(ex.maximum.pctOf60)}
                </ExampleLine>
                <ExampleLine>
                  age 65 → max at 65 in {ex.maximum.startYear65} ={" "}
                  {fmt2(ex.maximum.maxAt65InStartYear65)} → × 1.000 ={" "}
                  {fmt2(ex.maximum.maxAt65)} / mo → {fmt2(ex.adjustment.total65)} ÷{" "}
                  {fmt2(ex.maximum.maxAt65)} = {pct1(ex.maximum.pctOf65)}
                </ExampleLine>
                <ExampleLine>
                  age 70 → max at 65 in {ex.maximum.startYear70} ={" "}
                  {fmt2(ex.maximum.maxAt65InStartYear70)} → ×{" "}
                  {ex.adjustment.factor70.toFixed(3)} = {fmt2(ex.maximum.maxAt70)} / mo →{" "}
                  {fmt2(ex.adjustment.total70)} ÷ {fmt2(ex.maximum.maxAt70)} ={" "}
                  {pct1(ex.maximum.pctOf70)}
                </ExampleLine>
              </Example>
              <p className="text-sm text-muted-foreground">
                The worked example above uses Service Canada&apos;s published base-CPP maximum (the
                pre-2019 ceiling for a complete career under the original design). On the result
                cards, the calculator instead compares against the <em>true</em> ceiling — base
                CPP plus the maximum Tier 1 and Tier 2 enhancements a contributor of the same
                birth year could accrue with continuous YMPE/YAMPE earnings. With that
                apples-to-apples denominator, a true max earner lands at exactly{" "}
                <InlineMath>100%</InlineMath>, and any client&apos;s percentage is bounded above by
                their birth year&apos;s enhancement phase-in.
              </p>
              <p>
                Inside each result card, the <strong>Show per-tier breakdown</strong> toggle
                splits that headline % into its three components — Base, Tier 1, and Tier 2 —
                each as a share of the same denominator. The three slices always sum to the
                overall %. This is the same decomposition shown in the reference table below.
              </p>
              <div className="overflow-x-auto rounded-md border border-border/60 bg-card/40">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Take-up year</th>
                      <th className="px-4 py-2 text-left font-medium">Profile</th>
                      <th className="px-4 py-2 text-right font-medium">Base</th>
                      <th className="px-4 py-2 text-right font-medium">Tier 1</th>
                      <th className="px-4 py-2 text-right font-medium">Tier 2</th>
                      <th className="px-4 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    <tr>
                      <td className="px-4 py-2">2026</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        Max earner, age 65 (8 yrs Tier 1, 3 yrs Tier 2)
                      </td>
                      <td className="px-4 py-2 text-right font-mono">95.81%</td>
                      <td className="px-4 py-2 text-right font-mono">3.55%</td>
                      <td className="px-4 py-2 text-right font-mono">0.64%</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold">100.00%</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2">2070</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        Max earner, age 65 (both clocks fully accrued)
                      </td>
                      <td className="px-4 py-2 text-right font-mono">66.25%</td>
                      <td className="px-4 py-2 text-right font-mono">21.47%</td>
                      <td className="px-4 py-2 text-right font-mono">12.28%</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold">100.00%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground">
                Two things to notice. First, today the CPP maximum is still ~96¢ on the dollar
                Base CPP — the enhancement clocks have barely started. Second, by ~2070 the mix
                shifts to roughly two-thirds Base, one-third enhancement; that is the eventual
                structural shape of the maximum once both 40-year clocks finish running.
                Locked in by <code>src/cpp/__tests__/tierBreakdown.test.ts</code>.
              </p>

              <div className="mt-6 rounded-lg border border-border/60 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground print:border-slate-300 print:bg-white">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80 print:text-black">
                  Sources
                </p>
                <p className="leading-relaxed">
                  This benchmark is a derived ratio rather than a single statutory rule. The{" "}
                  <strong>maximum monthly retirement pension</strong> figures are the official annual
                  amounts published by{" "}
                  <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/amount.html">
                    canada.ca — How much you could receive
                  </SourceLink>
                  ; the maximum is wage-indexed (by YMPE growth) before take-up, consistent with the
                  &quot;Maximum Pensionable Earnings Average&quot; in CPP Act s. 42(1) and the
                  benefit formula in s. 46.
                </p>
              </div>
            </Section>

            <Section>
              <SectionHeading
                id="wp-prb"
                eyebrow="Continuing to work"
                title="Post-Retirement Benefit (PRB)"
                icon={<Calculator className="h-5 w-5" />}
              />
              <p>
                A client who continues to make pensionable contributions after starting CPP earns a
                Post-Retirement Benefit each year. The engine adds the PRB on top of the indexed
                payment stream until the client's chosen stop-work age. For each year of continued
                work:
              </p>
              <Formula>
                ratio = min(1, annual earnings / YMPE(year))
                <br />
                annual PRB(year) ≈ (starting CPP at take-up × 12) / 40 × ratio
              </Formula>
              <Example>
                <ExampleLine>
                  Same client starts CPP at 65 ({fmt2(ex.prb.startMonthly)} / month) and keeps
                  working at {fmt0(ex.prb.annualEarnings)} / year through age {ex.prb.stopAge}.
                </ExampleLine>
                <ExampleLine>
                  Year 1 ratio = min(1, {fmt0(ex.prb.annualEarnings)} /{" "}
                  {fmt0(ex.prb.ympeAtStart)}) = {pct1(ex.prb.ratio)}
                </ExampleLine>
                <ExampleLine>
                  Year 1 PRB = ({fmt2(ex.prb.startMonthly)} × 12) / 40 × {pct1(ex.prb.ratio)} ={" "}
                  {fmt0(ex.prb.firstYearAnnual)} / yr ≈ {fmt2(ex.prb.firstYearMonthly)} / month
                </ExampleLine>
                <ExampleLine>
                  After 5 years of accrual the engine reports an extra ≈{" "}
                  {fmt0(ex.prb.annualUpliftAt70)} / yr added to the indexed payment stream at age{" "}
                  {ex.prb.stopAge}.
                </ExampleLine>
              </Example>
              <p>
                The base used is the client's own starting CPP at take-up (base + Tier 1 + Tier 2,
                annualized) — i.e. the engine treats one additional year of contributions as
                accruing roughly 1/40 of the contributor's calculated retirement pension, scaled by
                how close that year's earnings are to the YMPE ceiling. PRB amounts accumulate year
                over year and are themselves indexed forward at the same CPI rate as the rest of
                the benefit stream.
              </p>

              <div className="mt-6 rounded-lg border border-border/60 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground print:border-slate-300 print:bg-white">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80 print:text-black">
                  Sources
                </p>
                <ul className="ml-5 list-disc space-y-1 leading-relaxed">
                  <li>
                    <strong>Post-Retirement Benefit amount</strong> — s. 59.1 of the{" "}
                    <SourceLink href="https://laws-lois.justice.gc.ca/eng/acts/c-8/FullText.html">
                      Canada Pension Plan Act (RSC 1985, c. C-8)
                    </SourceLink>
                    . The statute computes each year&apos;s PRB as 0.00625 × the Maximum Pensionable
                    Earnings Average × the earnings-to-YMPE ratio × the age adjustment; the engine
                    approximates this as ≈ 1/40 of the contributor&apos;s own starting pension scaled
                    by the same earnings ratio.
                  </li>
                  <li>
                    Plain-language reference:{" "}
                    <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-post-retirement.html">
                      canada.ca — Post-Retirement Benefit
                    </SourceLink>
                    .
                  </li>
                </ul>
              </div>
            </Section>

            <Section>
              <SectionHeading
                id="wp-survivor"
                eyebrow="Survivor side"
                title="Survivor pension, combined cap, children's benefit, death benefit"
                icon={<ShieldCheck className="h-5 w-5" />}
              />
              <p>The survivor module models four distinct payouts:</p>
              <ul className="ml-5 list-disc space-y-2">
                <li>
                  <strong>Survivor's pension — base + Tier 1 portion.</strong>{" "}
                  <InlineMath>60%</InlineMath> of the deceased's calculated retirement pension if
                  the survivor is 65 or older; <InlineMath>37.5%</InlineMath> if under 65 (paid with
                  a flat-rate top-up).
                </li>
                <li>
                  <strong>Under-45 reduction.</strong> Survivors aged 35–44 with no dependent
                  children and not disabled have the under-65 base reduced by{" "}
                  <InlineMath>1/120</InlineMath> per month under age 45. Survivors under 35 with no
                  children and not disabled are deferred to age 65.
                </li>
                <li>
                  <strong>Survivor's pension — Tier 2 portion.</strong> A flat{" "}
                  <InlineMath>37.5%</InlineMath> of the deceased's enhanced (Tier 2) amount,
                  regardless of survivor age, with the same under-45 reduction but no combined-cap
                  treatment.
                </li>
                <li>
                  <strong>Combined-benefit cap.</strong> If the survivor is also collecting their
                  own CPP retirement, the sum of (own base + Tier 1) and (survivor base + Tier 1)
                  cannot exceed the maximum CPP retirement pension at 65 for the start year. Any
                  excess is clawed back from the survivor's portion.
                  <Example>
                    <div className="text-xs text-muted-foreground">
                      Same client dies at 65 in {ex.profile.startYear}; surviving spouse is also 65
                      and already collects an identical max retirement pension.
                    </div>
                    <ExampleLine>
                      combined cap (max retirement at 65 in {ex.profile.startYear}) ={" "}
                      {fmt2(ex.survivor.cap)} / mo
                    </ExampleLine>
                    <ExampleLine>
                      survivor pension (base + Tier 1, uncapped) = 60% × {fmt2(ex.survivor.deceasedBaseTier1)} ={" "}
                      {fmt2(ex.survivor.pensionUncapped)} / mo
                    </ExampleLine>
                    <ExampleLine>
                      allowed = max(0, {fmt2(ex.survivor.cap)} −{" "}
                      {fmt2(ex.survivor.survivorOwnBaseTier1)}) ={" "}
                      {fmt2(Math.max(0, ex.survivor.cap - ex.survivor.survivorOwnBaseTier1))} / mo
                    </ExampleLine>
                    <ExampleLine>
                      after cap = {fmt2(ex.survivor.pensionAfterCap)} / mo (clawed back ≈{" "}
                      {fmt2(ex.survivor.capReduction)} / mo)
                    </ExampleLine>
                    <div className="text-xs text-muted-foreground">
                      The Tier 2 portion ({fmt2(ex.survivor.pensionTier2)} / mo) is not subject to
                      the cap, so the survivor still receives a small enhancement on top.
                    </div>
                  </Example>
                </li>
                <li>
                  <strong>Children's benefit.</strong> A flat monthly amount per eligible dependent
                  child, indexed to CPI; the engine carries the published amounts and projects
                  forward.
                </li>
                <li>
                  <strong>Death benefit.</strong> A one-time lump sum of{" "}
                  <InlineMath>$2,500</InlineMath>, fixed since 2019. For deaths on or after
                  January 1, 2025, a <InlineMath>$2,500</InlineMath> top-up (maximum{" "}
                  <InlineMath>$5,000</InlineMath>) applies when the deceased never received a
                  CPP/QPP retirement or disability pension and no surviving spouse or common-law
                  partner is eligible for a survivor&apos;s pension.
                </li>
              </ul>
              <p className="text-sm text-muted-foreground">
                The survivor module reuses the main engine to compute the deceased's calculated
                retirement pension at 65, truncating earnings at the death year so no future
                contributions are projected.
              </p>

              <div className="mt-6 rounded-lg border border-border/60 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground print:border-slate-300 print:bg-white">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80 print:text-black">
                  Sources
                </p>
                <p className="mb-2 leading-relaxed">
                  Survivor-side benefits are codified in the{" "}
                  <SourceLink href="https://laws-lois.justice.gc.ca/eng/acts/c-8/FullText.html">
                    Canada Pension Plan Act (RSC 1985, c. C-8)
                  </SourceLink>
                  :
                </p>
                <ul className="ml-5 list-disc space-y-1 leading-relaxed">
                  <li>
                    <strong>Survivor&apos;s pension</strong> — s. 58: 60% of the deceased&apos;s
                    retirement pension at age 65+, 37.5% plus a flat-rate component under 65, the
                    under-45 reduction, and the combined-benefit cap at the maximum retirement
                    pension. Plain-language:{" "}
                    <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-survivor-pension.html">
                      canada.ca — Survivor&apos;s pension
                    </SourceLink>
                    .
                  </li>
                  <li>
                    <strong>Children&apos;s benefit</strong> (flat monthly amount per eligible child)
                    — s. 59. Plain-language:{" "}
                    <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-childrens-benefit.html">
                      canada.ca — Benefits for children under 25
                    </SourceLink>
                    .
                  </li>
                  <li>
                    <strong>Death benefit</strong> ($2,500 for deaths after December 31, 2018;
                    up to $5,000 with the top-up for eligible deaths on or after January 1, 2025)
                    — s. 57(1)(b). Plain-language:{" "}
                    <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-death-benefit.html">
                      canada.ca — Death benefit
                    </SourceLink>
                    .
                  </li>
                </ul>
              </div>
            </Section>

            <Section>
              <SectionHeading
                id="wp-soc"
                eyebrow="Data ingestion"
                title="SOC import"
                icon={<ClipboardList className="h-5 w-5" />}
              />
              <p>
                The Statement of Contributions parser accepts pasted text from the Service Canada
                SOC web page, tab-separated PDF rows, or a simple{" "}
                <InlineMath>year, earnings</InlineMath> CSV. For each line it:
              </p>
              <ul className="ml-5 list-disc space-y-1.5 text-muted-foreground">
                <li>Strips currency symbols and thousands-separator commas inside numbers.</li>
                <li>
                  Tokenizes on tabs, commas, or runs of whitespace, then identifies the year as the
                  first integer in the valid CPP range (1966 through next year).
                </li>
                <li>
                  Picks the largest non-year, sub-$1,000,000 number on the row as the pensionable
                  earnings figure — the SOC PDF lists several smaller contribution sub-totals on
                  each row and pensionable earnings is always the largest.
                </li>
                <li>
                  De-duplicates by year (keeping the latest occurrence) and counts every line that
                  could not be interpreted as a "skipped" line.
                </li>
                <li>
                  Returns a summary of parsed and skipped line counts; a single warning is raised
                  only when the parser cannot detect any (year, earnings) pair at all, telling the
                  user to fall back to a simple <InlineMath>year, earnings</InlineMath> CSV.
                </li>
              </ul>
              <p>
                The result is a sorted list of <InlineMath>{`{year, pensionableEarnings}`}</InlineMath>{" "}
                records that drops directly into the scenario's earnings history.
              </p>

              <div className="mt-6 rounded-lg border border-border/60 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground print:border-slate-300 print:bg-white">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80 print:text-black">
                  Sources
                </p>
                <p className="leading-relaxed">
                  The input is the contributor&apos;s official{" "}
                  <SourceLink href="https://www.canada.ca/en/employment-social-development/services/my-account.html">
                    Statement of Contributions (via My Service Canada Account)
                  </SourceLink>
                  . The parser is a Modern Cents data-ingestion convenience, not a statutory rule — it
                  only reshapes Service Canada&apos;s published pensionable-earnings figures into the
                  engine&apos;s earnings history; none of the benefit math lives here.
                </p>
              </div>
            </Section>

            <Section>
              <SectionHeading
                id="wp-references"
                eyebrow="Primary sources"
                title="References & sources"
                icon={<FileText className="h-5 w-5" />}
              />
              <p>
                Every figure, rate, and rule in this white paper is drawn from primary Government of
                Canada sources. The exact statute section for each rule is cited in the Sources block
                under the relevant Part 2 section; the documents below are the underlying references,
                gathered in one place.
              </p>
              <ul className="ml-5 list-disc space-y-2">
                <li>
                  <strong>Legislation.</strong>{" "}
                  <SourceLink href="https://laws-lois.justice.gc.ca/eng/acts/c-8/FullText.html">
                    Canada Pension Plan Act (RSC 1985, c. C-8)
                  </SourceLink>{" "}
                  — the governing statute for the contributory period, AMPE indexing, the base 25%
                  replacement, the first and second additional (Tier 1 / Tier 2) components, enhanced
                  accrual, the early/late take-up adjustments, all drop-out and drop-in provisions,
                  the Post-Retirement Benefit, and survivor-side benefits.
                </li>
                <li>
                  <strong>Benefit amounts &amp; adjustments.</strong>{" "}
                  <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/amount.html">
                    canada.ca — CPP: How much you could receive
                  </SourceLink>{" "}
                  (base design, AMPE, the −0.6%/month early and +0.7%/month late adjustment factors,
                  and the percent-of-maximum benchmark).
                </li>
                <li>
                  <strong>Contribution ceilings.</strong>{" "}
                  <SourceLink href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html">
                    CRA — CPP contribution rates, maximums and exemptions
                  </SourceLink>{" "}
                  (YMPE, YAMPE, and the Year&apos;s Basic Exemption used in the constants tables).
                </li>
                <li>
                  <strong>The enhancement.</strong>{" "}
                  <SourceLink href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-enhancement.html">
                    CRA — Canada Pension Plan enhancement
                  </SourceLink>{" "}
                  (the 2019 first additional and 2024 second additional components, replacement
                  rates, and the 40-year accrual basis).
                </li>
                <li>
                  <strong>Child-rearing provisions.</strong>{" "}
                  <SourceLink href="https://www.canada.ca/en/services/benefits/publicpensions/cpp/child-rearing.html">
                    canada.ca — Child-rearing provisions
                  </SourceLink>{" "}
                  (the base child-rearing drop-out and the enhanced child-rearing drop-in).
                </li>
                <li>
                  <strong>Statement of Contributions.</strong>{" "}
                  <SourceLink href="https://www.canada.ca/en/employment-social-development/services/my-account.html">
                    My Service Canada Account
                  </SourceLink>{" "}
                  — the official source of the contributor&apos;s pensionable-earnings history used
                  by the SOC import.
                </li>
              </ul>
            </Section>
          </article>
        </div>
      </div>

      <div className="mx-auto mt-16 w-full max-w-7xl px-4 sm:mt-20 sm:px-6 print:hidden">
        <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-[hsl(215_85%_96%)] via-[hsl(248_75%_97%)] to-[hsl(28_90%_96%)] p-8 text-center shadow-sm sm:p-12">
          <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[hsl(190_80%_85%)] opacity-40 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[hsl(28_90%_85%)] opacity-40 blur-3xl" />
          <div className="relative">
            <h3 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Ready to see it on a real scenario?
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Create an account, paste a Statement of Contributions, and walk through the
              breakdown line by line.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/sign-up">
                <Button size="lg" className="w-full sm:w-auto px-8 shadow-md">
                  Start Calculating
                </Button>
              </Link>
              <Link href="/sign-in">
                <Button size="lg" variant="outline" className="w-full sm:w-auto px-8">
                  Sign In
                </Button>
              </Link>
              <Button
                type="button"
                size="lg"
                variant="ghost"
                onClick={() => {
                  if (typeof window !== "undefined") window.print();
                }}
                className="w-full sm:w-auto px-8"
                data-testid="button-print-white-paper"
              >
                <Printer className="mr-2 h-4 w-4" />
                Print white paper
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function smoothScrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  // If the target heading lives inside a collapsed <details.wp-section>,
  // open it first so the body becomes visible. We scroll on the next frame
  // so the browser has time to lay out the now-expanded section before we
  // compute the final scroll position.
  const details = el.closest<HTMLDetailsElement>("details.wp-section");
  const wasClosed = !!details && !details.open;
  if (details && !details.open) {
    details.open = true;
  }
  const doScroll = () => {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (typeof history !== "undefined" && history.replaceState) {
      history.replaceState(null, "", `#${id}`);
    }
  };
  if (wasClosed && typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(doScroll);
  } else {
    doScroll();
  }
}

function TocList({
  title,
  items,
  activeId,
}: {
  title: string;
  items: TocItem[];
  activeId: string | null;
}) {
  return (
    <div>
      <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80">
        {title}
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  smoothScrollTo(item.id);
                }}
                className={`block rounded-md px-2 py-1.5 text-sm leading-snug transition-colors ${
                  isActive
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  // Each <Section> call site starts with a <SectionHeading> followed by
  // body content. Splitting the first child off lets us put the heading
  // inside the <summary> (the click target) and the rest inside a
  // collapsible body. Defaults to closed.
  const arr = Children.toArray(children);
  const [head, ...body] = arr;
  return (
    <details className="wp-section group rounded-xl print:rounded-none">
      <summary
        className="wp-section-summary -mx-2 flex cursor-pointer list-none items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent/40 print:mx-0 print:rounded-none print:p-0 print:hover:bg-transparent"
      >
        <ChevronRight
          aria-hidden="true"
          className="wp-chevron mt-1.5 h-5 w-5 shrink-0 text-primary transition-transform duration-200 group-open:rotate-90 print:hidden"
        />
        <div className="min-w-0 flex-1">{head}</div>
      </summary>
      <div className="wp-section-body space-y-4 pl-8 pt-4 text-base leading-relaxed text-foreground/90 [&>p]:text-muted-foreground [&>p]:leading-relaxed print:pl-0 print:pt-4">
        {body}
      </div>
    </details>
  );
}
