import type { ReactNode } from 'react';

export const PAGE_HEADER_CHROME =
  'sticky top-0 z-20 -mx-4 px-4 py-3 sm:-mx-6 sm:px-6 bg-background-light dark:bg-background-dark border-b border-slate-200 dark:border-slate-800';

type PageHeaderProps = {
  icon?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  titleExtra?: ReactNode;
  showTitleOnMobile?: boolean;
};

export default function PageHeader({
  icon,
  title,
  subtitle,
  actions,
  titleExtra,
  showTitleOnMobile = false,
}: PageHeaderProps) {
  const titleWrap = showTitleOnMobile
    ? 'flex items-center gap-3 min-w-0'
    : 'hidden sm:flex items-center gap-3 min-w-0';

  return (
    <div data-page-header className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${PAGE_HEADER_CHROME}`}>
      <div className={titleWrap}>
        {icon ? (
          <span className="material-symbols-outlined text-[28px] text-primary dark:text-blue-400 flex-shrink-0">{icon}</span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
            {title}
            {titleExtra}
          </h2>
          {subtitle ? (
            typeof subtitle === 'string' ? (
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">{subtitle}</p>
            ) : (
              <div className="text-slate-500 dark:text-slate-400 text-xs font-medium">{subtitle}</div>
            )
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-3 flex-wrap justify-end">{actions}</div> : null}
    </div>
  );
}
