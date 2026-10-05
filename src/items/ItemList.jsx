import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useItems } from './ItemsContext.jsx';
import { useToast } from '../toast/ToastContext.jsx';
import ItemCard from './ItemCard.jsx';
import ItemRow from './ItemRow.jsx';
import { SORT_OPTIONS, sortItems } from './sortItems.js';
import { useDevicePreference } from '../hooks/useDevicePreference.js';
import { inventoryValue, availableValue, formatMoney } from './inventoryValue.js';
import ItemForm from './ItemForm.jsx';
import DeleteConfirm from './DeleteConfirm.jsx';
import ShareDialog from './ShareDialog.jsx';
import { downloadItemsCsv } from './exportCsv.js';
import { getDraft, clearDraft } from './drafts.js';
import { formatWhen } from './formatWhen.js';

const UNDO_WINDOW_MS = 8000;

function matchesSearch(item, q) {
  // Stray spaces (common when pasting, or from a phone keyboard) must not
  // turn a real match into "nothing found" (SPEC.md section 12).
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    (item.name != null && String(item.name).toLowerCase().includes(needle)) ||
    (item.sku && String(item.sku).toLowerCase().includes(needle)) ||
    (item.notes && String(item.notes).toLowerCase().includes(needle)) ||
    // SPEC.md section 1: serial-number search is exact-match only (unlike
    // the others, which are partial) - see TEST_PLAN.md SRCH-02.
    (item.serial_number && String(item.serial_number).trim().toLowerCase() === needle)
  );
}

export default function ItemList() {
  const { t } = useI18n();
  const { items, itemsLoaded, config, softDeleteItem, restoreItem } = useItems();
  const { showToast, showErrorToast } = useToast();

  function exportList() {
    try {
      downloadItemsCsv(filtered, t);
    } catch (err) {
      showErrorToast(t('errors.exportFailed'), 'export', err);
    }
  }

  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [missingSerial, setMissingSerial] = useState(false);
  const [missingSku, setMissingSku] = useState(false);
  const [missingPrice, setMissingPrice] = useState(false);

  const [editingItem, setEditingItem] = useState(undefined); // undefined = closed, null = new, object = edit
  const [template, setTemplate] = useState(null); // SPEC.md 19.3: values for a duplicated new item
  const [restore, setRestore] = useState(null); // SPEC.md 26.2: a draft's changes, put back
  const [draft, setDraft] = useState(null); // an interrupted form's draft, offered once at start
  const [formKey, setFormKey] = useState(0); // a fresh form each time one opens
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [shareTarget, setShareTarget] = useState(null); // SPEC.md 23.2

  // SPEC.md 19.1/19.4/19.6
  const [sortBy, setSortBy] = useDevicePreference('gallery_sort', 'name', SORT_OPTIONS);
  const [view, setView] = useDevicePreference('gallery_view', 'cards', ['cards', 'list']);
  const [filtersOpen, setFiltersOpen] = useState(false);

  function openForm(item, nextTemplate = null, nextRestore = null) {
    setTemplate(nextTemplate);
    setRestore(nextRestore);
    setEditingItem(item);
    setFormKey((k) => k + 1);
  }

  // SPEC.md 26.2: a form interrupted last time (app closed, phone off, crash).
  useEffect(() => {
    getDraft().then((d) => d && setDraft(d)).catch(() => {});
  }, []);

  function restoreDraft() {
    const d = draft;
    setDraft(null);
    const current = d.row_id ? items.find((it) => it.row_id === d.row_id && !it.is_deleted) : null;
    if (current) {
      openForm(current, null, d.changes);
      return;
    }
    // A new item - or one deleted meanwhile, which comes back as a new item
    // with the draft's details, but not its SKU and serial (like duplicating).
    const { sku, serial, ...rest } = d.changes;
    openForm(null, null, d.row_id ? rest : d.changes);
  }

  function discardDraft() {
    setDraft(null);
    clearDraft().catch(() => {});
  }

  const [statsExpanded, setStatsExpanded] = useState(() => {
    try {
      return localStorage.getItem('gallery_stats_expanded') === '1';
    } catch {
      return false;
    }
  });
  function toggleStats() {
    setStatsExpanded((prev) => {
      const next = !prev;
      try { localStorage.setItem('gallery_stats_expanded', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  // Does an item pass the current search and filters? (Also asked about an
  // item just saved, before the list has caught up - SPEC.md 26.5.)
  const passesFilters = (it) =>
    matchesSearch(it, search) &&
    (availability === 'all' || it.availability_status === availability) &&
    (locationFilter === 'all' || it.location === locationFilter) &&
    (typeFilter === 'all' || it.type === typeFilter) &&
    (statusFilter === 'all' || it.physical_status === statusFilter) &&
    (!missingSerial || !it.serial_number) &&
    (!missingSku || !it.sku) &&
    (!missingPrice || it.price == null || it.price === '');

  const filtered = useMemo(() => {
    const list = items.filter(passesFilters);
    return sortItems(list, sortBy); // the export follows the same order
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, availability, locationFilter, typeFilter, statusFilter, missingSerial, missingSku, missingPrice, sortBy]);

  // SPEC.md 26.5: the artwork just saved is highlighted for a moment, and
  // scrolled to if it's out of view.
  const [justSaved, setJustSaved] = useState(null);
  useEffect(() => {
    if (!justSaved) return undefined;
    const el = document.querySelector(`[data-row-id="${CSS.escape(justSaved)}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    const id = setTimeout(() => setJustSaved(null), 2600);
    return () => clearTimeout(id);
    // the list may still be catching up with the save - look again when it does
  }, [justSaved, filtered]);

  // How many filters (not the search) are on - shown on the "סינון" button.
  const activeFilterCount = [
    availability !== 'all', locationFilter !== 'all', typeFilter !== 'all', statusFilter !== 'all',
    missingSerial, missingSku, missingPrice,
  ].filter(Boolean).length;
  const filtersActive = search.trim() !== '' || activeFilterCount > 0;

  function clearFilters() {
    setSearch('');
    setAvailability('all');
    setLocationFilter('all');
    setTypeFilter('all');
    setStatusFilter('all');
    setMissingSerial(false);
    setMissingSku(false);
    setMissingPrice(false);
  }

  const stats = useMemo(() => {
    const tiles = [[t('stats.total'), items.length]];
    (config.type || []).forEach((typeName) => {
      tiles.push([typeName, items.filter((it) => it.type === typeName).length]);
    });
    return tiles;
  }, [items, config, t]);
  const value = useMemo(() => inventoryValue(items), [items]); // SPEC.md 20.2

  return (
    <div>
      {draft && editingItem === undefined && (
        <div className="draft-banner" role="status">
          <span>
            {t('draft.found').replace('{name}', draft.name || t('draft.newItem'))}
            {' · '}{formatWhen(draft.saved_at, t)}
          </span>
          <span className="draft-actions">
            <button type="button" className="btn primary" onClick={restoreDraft}>{t('draft.restore')}</button>
            <button type="button" className="btn" onClick={discardDraft}>{t('draft.discard')}</button>
          </span>
        </div>
      )}
      {/* SPEC.md 22.2: no totals until the catalog has loaded from the device. */}
      {itemsLoaded && <div className="stats-bar">
        <button
          type="button"
          className={`stats-toggle${statsExpanded ? ' expanded' : ''}`}
          onClick={toggleStats}
          aria-expanded={statsExpanded}
        >
          <span className="chevron">▾</span>
          {stats[0][0]}: {stats[0][1]}
          <span className="stats-value"> · {t('stats.availableValue')}: {formatMoney(value.total)}</span>
        </button>

        {/* SPEC.md 19.11: collapsed = the total only; details on demand. */}
        {statsExpanded && (
          <div className="stats">
            {stats.map(([label, count]) => (
              <div className="stat" key={label}>
                <b>{count}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}
        {statsExpanded && (
          <div className="value-breakdown">
            {[['stats.valueByType', value.byType], ['stats.valueByLocation', value.byLocation]].map(([title, rows]) => (
              <div className="value-group" key={title}>
                <div className="value-title">{t(title)}</div>
                {rows.map(([name, entry]) => (
                  <div className="value-row" key={name}>
                    <span>{name} <span className="value-count">({entry.count})</span></span>
                    <b>{formatMoney(entry.value)}</b>
                  </div>
                ))}
              </div>
            ))}
            {value.unpriced > 0 && (
              <p className="value-note">{t('stats.unpricedNote').replace('{n}', value.unpriced)}</p>
            )}
          </div>
        )}
      </div>}

      <div className="toolbar">
        <div className="search-box">
          <input
            type="text"
            placeholder={t('search.placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="toolbar-row">
          <button
            type="button"
            className={`btn filters-toggle${activeFilterCount ? ' has-active' : ''}`}
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
          >
            {t('filters.button')}{activeFilterCount ? ` · ${activeFilterCount}` : ''}
            <span className="chevron">{filtersOpen ? '▴' : '▾'}</span>
          </button>
          <label className="sort-select">
            <span className="visually-hidden">{t('sort.label')}</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label={t('sort.label')}>
              {SORT_OPTIONS.map((option) => (
                <option key={option} value={option}>{t('sort.label')}: {t(`sort.${option}`)}</option>
              ))}
            </select>
          </label>
          <div className="view-toggle" role="group" aria-label={t('view.label')}>
            <button type="button" className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')} title={t('view.cards')} aria-label={t('view.cards')} aria-pressed={view === 'cards'}>▦</button>
            <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} title={t('view.list')} aria-label={t('view.list')} aria-pressed={view === 'list'}>☰</button>
          </div>
          <span className="toolbar-spacer" />
          <button className="btn primary" onClick={() => openForm(null)}>{t('actions.newItem')}</button>
          <button className="btn" onClick={exportList}>{t('actions.exportExcel')}</button>
        </div>
        {filtersOpen && (
          <div className="filters-panel">
            <div className="toolbar-controls">
              <div className="filter-group">
                <span className="filter-label">{t('filters.location')}</span>
                <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
                  <option value="all">{t('filters.all')}</option>
                  {config.location.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <span className="filter-label">{t('filters.type')}</span>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">{t('filters.all')}</option>
                  {config.type.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <span className="filter-label">{t('filters.status')}</span>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">{t('filters.all')}</option>
                  {config.physical_status.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <span className="filter-label">{t('filters.availability')}</span>
                <select value={availability} onChange={(e) => setAvailability(e.target.value)}>
                  <option value="all">{t('filters.all')}</option>
                  <option value="available">{t('filters.available')}</option>
                  <option value="sold">{t('filters.sold')}</option>
                </select>
              </div>
            </div>
            <div className="filters-row">
              <label className={`toggle-pill${missingSerial ? ' active' : ''}`}>
                <input type="checkbox" checked={missingSerial} onChange={(e) => setMissingSerial(e.target.checked)} />
                {t('filters.missingSerial')}
              </label>
              <label className={`toggle-pill${missingSku ? ' active' : ''}`}>
                <input type="checkbox" checked={missingSku} onChange={(e) => setMissingSku(e.target.checked)} />
                {t('filters.missingSku')}
              </label>
              <label className={`toggle-pill${missingPrice ? ' active' : ''}`}>
                <input type="checkbox" checked={missingPrice} onChange={(e) => setMissingPrice(e.target.checked)} />
                {t('filters.missingPrice')}
              </label>
            </div>
          </div>
        )}
      </div>

      {filtersActive && (
        <div className="results-line" role="status">
          <span>
            {t('list.showing')} {filtered.length} {t('list.of')} {items.length}
            {' · '}{t('stats.availableValue')}: {formatMoney(availableValue(filtered))}
          </span>
          <button type="button" className="btn clear-filters" onClick={clearFilters}>{t('filters.clear')}</button>
        </div>
      )}

      {!itemsLoaded ? (
        <div className="loading-state" role="status">{t('list.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p>{t('list.empty')}</p>
          {filtersActive && (
            <button type="button" className="btn clear-filters" onClick={clearFilters}>{t('filters.clear')}</button>
          )}
        </div>
      ) : (
        // SPEC.md 19.2: in "recently updated" order, each item also shows who and when.
        view === 'list' ? (
          <div className="item-rows">
            {filtered.map((item) => (
              <ItemRow key={item.row_id} item={item} highlight={justSaved === item.row_id} showModified={sortBy === 'recent'} onClick={() => openForm(item)} onShare={setShareTarget} />
            ))}
          </div>
        ) : (
          <div className="grid">
            {filtered.map((item) => (
              <ItemCard key={item.row_id} item={item} highlight={justSaved === item.row_id} showModified={sortBy === 'recent'} onClick={() => openForm(item)} onShare={setShareTarget} />
            ))}
          </div>
        )
      )}

      {editingItem !== undefined && (
        <ItemForm
          key={formKey}
          item={editingItem}
          template={template}
          restore={restore}
          onDuplicate={(values) => openForm(null, values)}
          onClose={() => setEditingItem(undefined)}
          onRequestDelete={(item) => setDeleteTarget(item)}
          isHiddenByFilters={(saved) => !passesFilters(saved)}
          onSaved={(rowId) => {
            setEditingItem(undefined);
            setJustSaved(rowId);
          }}
        />
      )}

      {shareTarget && <ShareDialog item={shareTarget} onClose={() => setShareTarget(null)} />}

      {deleteTarget && (
        <DeleteConfirm
          item={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            const deleted = deleteTarget;
            setDeleteTarget(null);
            let undo;
            try {
              undo = await softDeleteItem(deleted.row_id);
            } catch (err) {
              showErrorToast(t('errors.deleteFailed'), 'delete', err);
              return; // the edit form stays open - nothing was deleted
            }
            setEditingItem(undefined);
            clearDraft().catch(() => {}); // SPEC.md 26.2: nothing left to restore
            // SPEC.md section 11: a mistaken delete can be undone right here.
            showToast(t('toast.itemDeleted'), {
              duration: UNDO_WINDOW_MS,
              action: {
                label: t('actions.undo'),
                onClick: async () => {
                  try {
                    if (undo) await restoreItem(undo);
                    showToast(t('toast.itemRestored'));
                  } catch (err) {
                    showErrorToast(t('errors.restoreFailed'), 'undo-delete', err);
                  }
                },
              },
            });
          }}
        />
      )}
    </div>
  );
}
