import { useEffect, useState } from 'react';
import { ASK_KINDS, KIND_LABELS } from './permissions';
import type { SiteDetail, SiteRow } from './permissions';
import { Icon } from './ui/Icon';
import type { IconName } from './ui/iconData';
import { cookieWords } from './siteData';
import type { SiteDataGroup } from './types';
import { Button, Field, IconButton, Input, Segmented } from './ui/controls';

// How many sites of the saved-data list to draw at once.
const MAX_SHOWN = 40;

// A site's little picture, or its first letter when none has been seen (nothing is
// loaded from a site just to draw this list).
function SiteIcon({ icon, name }: { icon?: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  return icon && !broken ? (
    <img
      className="pv-icon"
      src={icon}
      alt=""
      width={20}
      height={20}
      onError={() => setBroken(true)}
    />
  ) : (
    <span className="pv-icon pv-letter" aria-hidden="true">
      {name
        .replace(/^www\./, '')
        .charAt(0)
        .toUpperCase()}
    </span>
  );
}

const KIND_ICONS: Record<(typeof ASK_KINDS)[number], IconName> = {
  camera: 'camera',
  microphone: 'mic',
  location: 'pin',
  notifications: 'bell',
  clipboard: 'paste',
  popups: 'ext-link',
};

// One site's page: the site at the top, then every permission it can ask for, each
// with an Ask / Allow / Block switch.
function SiteDetailView({
  site,
  onBack,
}: {
  site: string;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<SiteDetail | null>(null);
  useEffect(() => {
    const load = () =>
      void window.browserApi.privacySiteDetail(site).then(setDetail);
    load();
    return window.browserApi.onPrivacyChanged(load);
  }, [site]);
  if (detail === null) return null;
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}
    >
      <div className="row-flex" style={{ gap: 'var(--s-2)' }}>
        <IconButton
          icon="arrow-left"
          size="sm"
          label="Back to all sites"
          onClick={onBack}
        />
        <SiteIcon icon={detail.icon} name={detail.host} />
        <span className="grow" style={{ minWidth: 0 }}>
          <span
            className="truncate"
            style={{ display: 'block', fontWeight: 'var(--fw-bold)' }}
          >
            {detail.host}
          </span>
          <span
            className="muted"
            style={{ display: 'block', fontSize: 'var(--fs-xs)' }}
          >
            Permissions for this site
          </span>
        </span>
      </div>
      <div className="pv-list">
        {ASK_KINDS.map((kind) => {
          const answer = detail.answers[kind] ?? 'ask';
          return (
            <div className="pv-row" key={kind}>
              <Icon name={KIND_ICONS[kind]} />
              <span className="grow">{KIND_LABELS[kind]}</span>
              <Segmented
                label={KIND_LABELS[kind]}
                value={answer}
                options={[
                  { value: 'ask', label: 'Ask' },
                  { value: 'allow', label: 'Allow' },
                  { value: 'block', label: 'Block' },
                ]}
                onChange={(next) =>
                  void window.browserApi
                    .privacySetAnswer(site, kind, next === 'ask' ? null : next)
                    .then(setDetail)
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Settings > Privacy and security: the sites you gave or refused permissions
// (camera, location...), the sites that saved data here (clear one at a time, a
// main site with everything under it, or one name), and clearing everything.
export function PrivacySection() {
  const [sites, setSites] = useState<SiteRow[] | null>(null);
  const [data, setData] = useState<SiteDataGroup[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  // A site opened from the permissions list (its own page).
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      void window.browserApi.privacySites().then(setSites);
      void window.browserApi.privacyDataSites().then(setData);
    };
    load();
    return window.browserApi.onPrivacyChanged(load);
  }, []);
  if (sites === null || data === null) return null;
  if (selected !== null) {
    return <SiteDetailView site={selected} onBack={() => setSelected(null)} />;
  }

  const wanted = query.trim().toLowerCase();
  const matching = data.filter(
    (group) =>
      group.site.includes(wanted) ||
      group.hosts.some((row) => row.host.includes(wanted)),
  );
  const reload = () => void window.browserApi.privacyDataSites().then(setData);
  const toggle = (site: string) =>
    setOpen((now) => {
      const next = new Set(now);
      if (!next.delete(site)) next.add(site);
      return next;
    });

  const clearAll = (what: { siteData: boolean; cache: boolean }) =>
    void window.browserApi.privacyClear(what).then((cleared) => {
      if (!cleared) return;
      setNote('Cleared.');
      reload();
    });

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}
    >
      <Field
        label="Site permissions"
        help="What you allowed or blocked for each site. Sites ask before using your camera, microphone, location, notifications or clipboard."
      >
        {sites.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No saved permissions yet.
          </p>
        ) : (
          <div className="pv-list">
            {sites.map((row) => (
              <div
                key={row.site}
                className="pv-row pv-click reveal-host"
                role="button"
                tabIndex={0}
                title={`Permissions for ${row.host}`}
                onClick={() => setSelected(row.site)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(row.site);
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  window.browserApi.showPrivacyMenu(
                    row.site,
                    event.clientX,
                    event.clientY,
                  );
                }}
              >
                <SiteIcon icon={row.icon} name={row.host} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="truncate" style={{ display: 'block' }}>
                    {row.host}
                  </span>
                  <span
                    className="truncate muted"
                    style={{ display: 'block', fontSize: 'var(--fs-xs)' }}
                  >
                    {row.summary.join(' · ')}
                  </span>
                </span>
                <IconButton
                  icon="x"
                  size="sm"
                  className="reveal"
                  label={`Reset permissions for ${row.host}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void window.browserApi
                      .privacyResetSite(row.site)
                      .then(setSites);
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </Field>

      <Field
        label="Cookies and site data"
        help="Sites that saved data here, such as staying signed in. Clearing a site signs you out of it. Your history, bookmarks and permissions stay."
      >
        {data.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No sites have saved data.
          </p>
        ) : (
          <>
            {data.length > 8 && (
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search sites"
                aria-label="Search sites"
                style={{ marginBottom: 'var(--s-2)' }}
              />
            )}
            {matching.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No site matches.
              </p>
            ) : (
              <div className="pv-list">
                {matching.slice(0, MAX_SHOWN).map((group) => {
                  const many = group.hosts.length > 1;
                  // A search that matches only a subsite opens its site.
                  const expanded =
                    many &&
                    (open.has(group.site) ||
                      (wanted !== '' && !group.site.includes(wanted)));
                  return (
                    <div key={group.site}>
                      <div
                        className="pv-row reveal-host"
                        onContextMenu={(event) => {
                          event.preventDefault();
                          window.browserApi.showPrivacyDataMenu(
                            'site',
                            group.site,
                            event.clientX,
                            event.clientY,
                          );
                        }}
                      >
                        {many && (
                          <span
                            className={
                              expanded
                                ? 'pv-caret-slot is-open'
                                : 'pv-caret-slot'
                            }
                          >
                            <IconButton
                              icon={expanded ? 'chev-u' : 'chev-d'}
                              size="sm"
                              aria-expanded={expanded}
                              label={`${expanded ? 'Hide' : 'Show'} the ${group.hosts.length} names under ${group.site}`}
                              onClick={() => toggle(group.site)}
                            />
                          </span>
                        )}
                        <SiteIcon icon={group.icon} name={group.site} />
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span
                            className="truncate"
                            style={{ display: 'block' }}
                          >
                            {group.site}
                          </span>
                          <span
                            className="truncate muted"
                            style={{
                              display: 'block',
                              fontSize: 'var(--fs-xs)',
                            }}
                          >
                            {cookieWords(group.cookies)}
                            {many ? ` · ${group.hosts.length} names` : ''}
                          </span>
                        </span>
                        <IconButton
                          icon="x"
                          size="sm"
                          className="reveal"
                          label={`Clear data for ${group.site}${many ? ' and its subsites' : ''}`}
                          onClick={() =>
                            void window.browserApi
                              .privacyClearSite({ site: group.site })
                              .then((cleared) => cleared && reload())
                          }
                        />
                      </div>
                      {expanded &&
                        group.hosts.map((row) => (
                          <div
                            key={row.host}
                            className="pv-row pv-sub reveal-host"
                            onContextMenu={(event) => {
                              event.preventDefault();
                              window.browserApi.showPrivacyDataMenu(
                                'host',
                                row.host,
                                event.clientX,
                                event.clientY,
                              );
                            }}
                          >
                            <SiteIcon icon={row.icon} name={row.host} />
                            <span className="grow" style={{ minWidth: 0 }}>
                              <span
                                className="truncate"
                                style={{ display: 'block' }}
                              >
                                {row.host}
                              </span>
                              <span
                                className="truncate muted"
                                style={{
                                  display: 'block',
                                  fontSize: 'var(--fs-xs)',
                                }}
                              >
                                {cookieWords(row.cookies)}
                              </span>
                            </span>
                            <IconButton
                              icon="x"
                              size="sm"
                              className="reveal"
                              label={`Clear data for ${row.host}`}
                              onClick={() =>
                                void window.browserApi
                                  .privacyClearSite({ host: row.host })
                                  .then((cleared) => cleared && reload())
                              }
                            />
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            )}
            {matching.length > MAX_SHOWN && (
              <p className="muted" style={{ margin: 'var(--s-2) 0 0' }}>
                Showing {MAX_SHOWN} of {matching.length} sites. Search to find
                one.
              </p>
            )}
          </>
        )}
      </Field>

      <Field
        label="Clear everything"
        help="History, bookmarks, downloads and site permissions are never touched."
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--s-2)',
            alignItems: 'center',
          }}
        >
          <Button
            size="sm"
            icon="trash"
            onClick={() => clearAll({ siteData: true, cache: false })}
          >
            Clear all cookies and site data…
          </Button>
          <Button
            size="sm"
            icon="trash"
            onClick={() => clearAll({ siteData: false, cache: true })}
          >
            Clear saved page files…
          </Button>
          {note !== '' && (
            <span className="muted" role="status">
              {note}
            </span>
          )}
        </div>
      </Field>
    </div>
  );
}
