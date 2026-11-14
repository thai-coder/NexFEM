import { Icon } from "@nexfem/ui";
import { useState } from "react";
import { runCommand } from "../../commands/app.ts";
import { useT } from "../../i18n/index.ts";
import { openExternal } from "../../services/external.ts";
import { basename, confirmDiscardAsync, openPath, openProject, openSample, recentFiles } from "../../services/files.ts";
import { load, save } from "../../stores/persist.ts";

export const SHOW_START_KEY = "showStartPage";

/** Mặc định hiện Start Page khi khởi động, trừ khi chạy tự động (kiểm thử). */
export function showStartAtStartup(): boolean {
  return load<boolean>(SHOW_START_KEY, typeof navigator === "undefined" || !navigator.webdriver);
}

const REPO = "https://github.com/thai-coder/nexfem";
type Tab = "news" | "resources" | "releases";

function focusViewport() {
  window.dispatchEvent(new Event("nexfem:focus-viewport"));
}

function Logo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <linearGradient id="start-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f7fe8" />
          <stop offset="1" stopColor="#1747a6" />
        </linearGradient>
      </defs>
      <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#start-logo-g)" />
      <path d="M300 760V264l424 496V264" fill="none" stroke="#fff" strokeWidth="88" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M232 760h560" stroke="#ffd400" strokeWidth="40" strokeLinecap="round" />
    </svg>
  );
}

export function StartPage() {
  const T = useT();
  const S = T.start;
  const [tab, setTab] = useState<Tab>("news");
  const [show, setShow] = useState(showStartAtStartup);
  const recent = recentFiles();
  const tabs: [Tab, string][] = [
    ["news", S.tabNews],
    ["resources", S.tabResources],
    ["releases", S.tabReleases],
  ];
  return (
    <div className="start-page" data-testid="start-page">
      <div className="start-main">
        <header className="start-head">
          <Logo size={44} />
          <div>
            <h1>{S.title}</h1>
            <p>{S.subtitle}</p>
          </div>
        </header>
        <div className="start-cols">
          <section className="start-actions">
            <button className="start-action" data-testid="start-new" onClick={() => runCommand("file.new")}>
              <Icon name="new" size={20} /> {S.newModel}
            </button>
            <button
              className="start-action"
              data-testid="start-open"
              onClick={async () => {
                if (await openProject()) focusViewport();
              }}
            >
              <Icon name="open" size={20} /> {S.openModel}
            </button>
            <button
              className="start-action"
              data-testid="start-sample"
              onClick={async () => {
                if (await openSample()) focusViewport();
              }}
            >
              <Icon name="view3d" size={20} /> {S.sample}
            </button>
          </section>
          <section className="start-recent">
            <h3>{S.recent}</h3>
            {recent.length === 0 && <p className="muted">{S.noRecent}</p>}
            {recent.map((r) => (
              <button
                key={r.path}
                className="define-item"
                title={r.path}
                onClick={async () => {
                  if (!(await confirmDiscardAsync())) return;
                  if (await openPath(r.path)) focusViewport();
                }}
              >
                <Icon name="folder" size={14} />
                <span>{basename(r.path)}</span>
              </button>
            ))}
          </section>
        </div>
        <label className="start-check">
          <input
            type="checkbox"
            checked={show}
            data-testid="start-show"
            onChange={(e) => {
              setShow(e.target.checked);
              save(SHOW_START_KEY, e.target.checked);
            }}
          />
          {S.showAtStartup}
        </label>
      </div>
      <aside className="start-side">
        <div className="seg-tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="start-tabbody">
          {tab === "news" && (
            <ul>
              {S.news.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {tab === "resources" && (
            <>
              <h4>{S.resources}</h4>
              <button className="link" onClick={() => void openExternal(REPO)}>
                {S.repo}
              </button>
              <button className="link" onClick={() => void openExternal(`${REPO}/tree/main/docs`)}>
                {S.docs}
              </button>
            </>
          )}
          {tab === "releases" && (
            <>
              <p>
                {S.version}: <b>{__APP_VERSION__}</b>
              </p>
              <button className="link" onClick={() => void openExternal(`${REPO}/releases`)}>
                {S.releases}
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
