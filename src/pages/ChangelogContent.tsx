import { useState, useEffect } from 'react';
import { GitCommit, GitPullRequest, ExternalLink, Filter } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

/* ─── Types ─── */
interface GitHubPR {
  id: number;
  number: number;
  title: string;
  body: string | null;
  merged_at: string | null;
  html_url: string;
  user: { login: string; avatar_url: string } | null;
  labels: { name: string }[];
}

interface ChangelogEntry {
  id: number;
  version: string;
  title: string;
  description: string;
  date: string;
  url: string;
  categories: string[];
}

const GITHUB_OWNER = 'Nexus-Team-Project';
const GITHUB_REPO = 'nexus-website';

/* ─── Category Detection ─── */
const CATEGORY_MAP: Record<string, { keywords: string[]; color: string }> = {
  'Feature':     { keywords: ['feature', 'add', 'new', 'introduce'],        color: 'bg-purple-100 text-purple-700' },
  'Fix':         { keywords: ['fix', 'bug', 'patch', 'resolve', 'hotfix'],  color: 'bg-red-100 text-red-700' },
  'Improvement': { keywords: ['improve', 'update', 'enhance', 'refactor', 'optimize'], color: 'bg-blue-100 text-blue-700' },
  'Docs':        { keywords: ['doc', 'readme', 'guide'],                    color: 'bg-emerald-100 text-emerald-700' },
  'Security':    { keywords: ['security', 'vulnerability', 'cve'],          color: 'bg-amber-100 text-amber-700' },
  'Breaking':    { keywords: ['breaking', 'deprecat', 'remove'],            color: 'bg-rose-100 text-rose-700' },
};

function detectCategories(text: string): string[] {
  const lower = text.toLowerCase();
  const cats = Object.entries(CATEGORY_MAP)
    .filter(([, { keywords }]) => keywords.some((kw) => lower.includes(kw)))
    .map(([name]) => name);
  return cats.length > 0 ? cats : ['Update'];
}

/* ─── Parse Markdown to simplified HTML ─── */
function parseMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-slate-800 mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold text-slate-800 mt-5 mb-2">$2</h2>')
    .replace(/^\* (.+)$/gm, '<li class="text-slate-600 text-sm leading-relaxed">$1</li>')
    .replace(/^- (.+)$/gm, '<li class="text-slate-600 text-sm leading-relaxed">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (m) => `<ul class="list-disc ps-5 mb-3 space-y-1">${m}</ul>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 text-[#0D9488] px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/\n{2,}/g, '<br/>')
    .trim();
}

/* ─── Main Component ─── */
export default function ChangelogContent() {
  const { language, direction } = useLanguage();
  const isRTL = direction === 'rtl';

  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  useEffect(() => {
    document.title =
      language === 'he'
        ? 'שינויים ועדכונים | Nexus'
        : 'Changelog | Nexus – Loyalty & Payments Infrastructure';
  }, [language]);

  useEffect(() => {
    async function fetchMergedPRs() {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100`,
        );

        if (res.status === 403) {
          // Rate limited — fall back to commits endpoint (lower cost)
          console.warn('GitHub rate limited on pulls, falling back to commits');
          const commitRes = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?per_page=50&sha=main`,
          );
          if (!commitRes.ok) throw new Error(`GitHub API responded ${commitRes.status}`);
          const commits = await commitRes.json();
          const parsed: ChangelogEntry[] = commits
            .filter((c: any) => {
              const msg = (c.commit?.message || '').toLowerCase();
              return !msg.startsWith('merge pull request') && !msg.startsWith('merge branch');
            })
            .map((c: any, idx: number) => {
              const lines = (c.commit?.message || '').split('\n');
              return {
                id: idx + 1,
                version: (c.sha || '').substring(0, 7),
                title: lines[0] || 'Update',
                description: lines.slice(1).join('\n').trim(),
                date: c.commit?.author?.date || new Date().toISOString(),
                url: c.html_url || '',
                categories: detectCategories(c.commit?.message || ''),
              };
            });
          setEntries(parsed);
          return;
        }

        if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
        const data: GitHubPR[] = await res.json();

        const parsed: ChangelogEntry[] = data
          .filter((pr) => pr.merged_at !== null)
          .map((pr) => ({
            id: pr.id,
            version: `#${pr.number}`,
            title: pr.title,
            description: pr.body || '',
            date: pr.merged_at!,
            url: pr.html_url,
            categories: detectCategories(`${pr.title} ${pr.body ?? ''}`),
          }));

        setEntries(parsed);
      } catch (err) {
        console.error('Failed to fetch changelog:', err);
        setError(
          language === 'he'
            ? 'לא ניתן לטעון את השינויים כרגע. נסו שוב מאוחר יותר.'
            : 'Unable to load changelog. Please try again later.',
        );
      } finally {
        setLoading(false);
      }
    }
    fetchMergedPRs();
  }, [language]);

  /* Group entries by month */
  const allCategories = Array.from(new Set(entries.flatMap((e) => e.categories))).sort();

  const filtered = activeFilter
    ? entries.filter((e) => e.categories.includes(activeFilter))
    : entries;

  const grouped = filtered.reduce<Record<string, ChangelogEntry[]>>((acc, entry) => {
    const d = new Date(entry.date);
    const key = d.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', {
      year: 'numeric',
      month: 'long',
    });
    (acc[key] ||= []).push(entry);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-white" dir={direction}>
      <Navbar variant="dark" />

      {/* ─── Header ─── */}
      <section className="relative overflow-hidden pt-32 pb-20">
        <div
          className="absolute inset-0 bg-slate-50"
          style={{
            clipPath: isRTL
              ? 'polygon(0 0, 100% 0, 100% 100%, 0 calc(100% - 60px))'
              : 'polygon(0 0, 100% 0, 100% calc(100% - 60px), 0 100%)',
          }}
        />
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            {language === 'he' ? 'יומן שינויים' : 'Changelog'}
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl">
            {language === 'he'
              ? 'עדכונים ושיפורים לפלטפורמת Nexus. כל השינויים נשאבים אוטומטית מ-GitHub.'
              : 'Additions and updates to the Nexus platform. All changes are automatically pulled from GitHub.'}
          </p>
        </div>
      </section>

      {/* ─── Content ─── */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Timeline */}
          <div className="flex-1 min-w-0">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-3 border-slate-200 border-t-[#0D9488] rounded-full animate-spin" />
              </div>
            )}

            {error && (
              <div className="text-center py-20">
                <p className="text-slate-500 text-lg">{error}</p>
              </div>
            )}

            {!loading && !error && filtered.length === 0 && (
              <div className="text-center py-20">
                <p className="text-slate-500 text-lg">
                  {language === 'he' ? 'אין עדכונים עדיין.' : 'No updates yet.'}
                </p>
              </div>
            )}

            {!loading &&
              !error &&
              Object.entries(grouped).map(([month, monthEntries]) => (
                <div key={month} className="mb-12">
                  {/* Month header */}
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6 sticky top-0 bg-white py-2 z-10">
                    {month}
                  </h2>

                  <div className="space-y-0">
                    {monthEntries.map((entry, idx) => (
                      <div
                        key={entry.id}
                        className={`relative flex gap-6 ${idx < monthEntries.length - 1 ? 'pb-10' : ''}`}
                      >
                        {/* Timeline line & dot */}
                        <div className="flex flex-col items-center shrink-0 w-8">
                          <div className="w-3 h-3 rounded-full bg-[#0D9488] ring-4 ring-[#0D9488]/10 mt-1.5" />
                          {idx < monthEntries.length - 1 && (
                            <div className="flex-1 w-px bg-slate-200 mt-2" />
                          )}
                        </div>

                        {/* Entry content */}
                        <div className="flex-1 min-w-0 pb-2">
                          {/* Date & version */}
                          <div className="flex flex-wrap items-center gap-3 mb-2">
                            <time className="text-sm text-slate-400 font-medium">
                              {new Date(entry.date).toLocaleDateString(
                                language === 'he' ? 'he-IL' : 'en-US',
                                { year: 'numeric', month: 'short', day: 'numeric' },
                              )}
                            </time>
                            <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                              <GitPullRequest className="w-3 h-3" />
                              {entry.version}
                            </span>
                          </div>

                          {/* Category badges */}
                          <div className="flex flex-wrap gap-2 mb-3">
                            {entry.categories.map((cat) => (
                              <span
                                key={cat}
                                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  CATEGORY_MAP[cat]?.color ?? 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {cat}
                              </span>
                            ))}
                          </div>

                          {/* Title */}
                          <h3 className="text-lg font-semibold text-slate-900 mb-2">
                            {entry.title}
                          </h3>

                          {/* Description */}
                          {entry.description && (
                            <div
                              className="prose prose-sm prose-slate max-w-none text-slate-600"
                              dangerouslySetInnerHTML={{
                                __html: parseMarkdown(entry.description),
                              }}
                            />
                          )}

                          {/* Link to GitHub release */}
                          <a
                            href={entry.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-3 text-sm text-[#0D9488] hover:text-[#4b44cc] font-medium transition-colors"
                          >
                            <GitCommit className="w-3.5 h-3.5" />
                            {language === 'he' ? 'צפה ב-GitHub' : 'View on GitHub'}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>

          {/* ─── Filter Sidebar ─── */}
          <aside className="lg:w-64 shrink-0">
            <div className="sticky top-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-4">
                <Filter className="w-4 h-4" />
                {language === 'he' ? 'סינון' : 'Filter'}
              </h3>
              <div className="space-y-1.5">
                <button
                  onClick={() => setActiveFilter(null)}
                  className={`block w-full text-start px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                    activeFilter === null
                      ? 'bg-[#0D9488]/10 text-[#0D9488] font-medium'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {language === 'he' ? 'הכל' : 'All'}
                </button>
                {allCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveFilter(activeFilter === cat ? null : cat)}
                    className={`flex items-center justify-between w-full text-start px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                      activeFilter === cat
                        ? 'bg-[#0D9488]/10 text-[#0D9488] font-medium'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          CATEGORY_MAP[cat]?.color.split(' ')[0] ?? 'bg-slate-300'
                        }`}
                      />
                      {cat}
                    </span>
                    <span className="text-xs text-slate-400">
                      {entries.filter((e) => e.categories.includes(cat)).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <Footer />
    </div>
  );
}
