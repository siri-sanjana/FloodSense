'use client';

import React from 'react';
import { Download, FileText, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CitationClause } from '../lib/types';
import { normalizeBrokenSpacing } from '../lib/normalize-broken-spacing';

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
}

function remarkCitations() {
  return (tree: MarkdownNode) => {
    const transform = (node: MarkdownNode) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          transform(child);
          return [child];
        }
        const parts = child.value.split(/(\[\[[A-Za-z0-9.-]+\]\])/g).filter(Boolean);
        return parts.map((part): MarkdownNode => {
          const citation = part.match(/^\[\[([A-Za-z0-9.-]+)\]\]$/);
          return citation
            ? {
                type: 'link',
                url: `#citation:${citation[1]}`,
                children: [{ type: 'text', value: `[${citation[1]}]` }],
              }
            : { type: 'text', value: part };
        });
      });
    };
    transform(tree);
  };
}

interface SitrepStreamProps {
  content: string;
  citations?: CitationClause[];
  proactiveNotes?: string[];
  onCitationClick?: (citation: CitationClause) => void;
  onExportPDF?: () => void;
  onExportDOCX?: () => void;
}

export const SitrepStream: React.FC<SitrepStreamProps> = ({
  content,
  citations = [],
  proactiveNotes = [],
  onCitationClick,
  onExportPDF,
  onExportDOCX,
}) => {
  return (
    <div className="w-full bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-4 h-4 rounded bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-700">
            <Check className="w-3 h-3 stroke-[2.5]" />
          </div>
          <span className="font-mono text-xs uppercase tracking-wider text-slate-900 font-semibold">
            Field SITREP Analyst
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            &mdash; Verified Inundation Assessment
          </span>
        </div>

        {/* Export action buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onExportPDF}
            className="flex items-center space-x-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-mono text-slate-700 transition-colors shadow-2xs"
          >
            <Download className="w-3 h-3 text-cyan-600" />
            <span>PDF</span>
          </button>
          <button
            onClick={onExportDOCX}
            className="flex items-center space-x-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-mono text-slate-700 transition-colors shadow-2xs"
          >
            <FileText className="w-3 h-3 text-slate-500" />
            <span>DOCX</span>
          </button>
        </div>
      </div>

      {/* Main text content */}
      <div className="sitrep-content max-w-none text-sm text-slate-700 leading-relaxed font-sans">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkCitations]}
          components={{
            h1: ({ children }) => <h1 className="mb-3 mt-5 text-xl font-bold text-slate-950 first:mt-0">{children}</h1>,
            h2: ({ children }) => <h2 className="mb-2 mt-5 border-b border-slate-200 pb-1 text-lg font-bold text-slate-900">{children}</h2>,
            h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-bold text-slate-900">{children}</h3>,
            h4: ({ children }) => <h4 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-cyan-800">{children}</h4>,
            p: ({ children }) => <p className="my-2 whitespace-pre-wrap leading-6">{children}</p>,
            ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
            ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
            li: ({ children }) => <li className="pl-1 leading-6">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="my-4 rounded-r-lg border-l-4 border-cyan-600 bg-cyan-50 px-4 py-2 text-slate-800">
                <div className="mb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-800">Executive summary</div>
                {children}
              </blockquote>
            ),
            strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
            hr: () => <hr className="my-4 border-slate-200" />,
            table: ({ children }) => (
              <div className="my-3 overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">{children}</table>
              </div>
            ),
            th: ({ children }) => <th className="border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-900">{children}</th>,
            td: ({ children }) => <td className="border border-slate-200 px-3 py-2 align-top">{children}</td>,
            a: ({ children, href }) => {
              const citationId = href?.startsWith('#citation:') ? href.slice('#citation:'.length) : null;
              const citation = citationId ? citations.find((item) => item.id === citationId) : null;
              if (citationId) {
                return (
                  <button
                    type="button"
                    onClick={() => citation && onCitationClick?.(citation)}
                    title={`Inspect protocol: ${citation?.document || citationId}`}
                    className="mx-0.5 inline-flex rounded border border-cyan-200 bg-cyan-50 px-1.5 py-0.5 font-mono text-[10px] text-cyan-800 hover:bg-cyan-100"
                  >
                    {children}
                  </button>
                );
              }
              return <a href={href} className="text-cyan-800 underline underline-offset-2">{children}</a>;
            },
          }}
        >
          {normalizeBrokenSpacing(content)}
        </ReactMarkdown>
      </div>

      {/* Advisory Footnotes */}
      {proactiveNotes.length > 0 && (
        <div className="pt-3 mt-4 border-t border-slate-200 space-y-1.5 font-mono text-[11px]">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            Advisory Footnotes
          </div>
          {proactiveNotes.map((note, nIdx) => (
            <div key={nIdx} className="flex items-start space-x-2 text-slate-600">
              <span className="text-cyan-600">&bull;</span>
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
