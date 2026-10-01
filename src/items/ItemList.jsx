import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useItems } from './ItemsContext.jsx';
import { useToast } from '../toast/ToastContext.jsx';
import ItemCard from './ItemCard.jsx';
import ItemRow from './ItemRow.jsx';
import { SORT_OPTIONS, sortItems } from './sortItems.js';
import { useDevicePreference } from '../hooks/useDevicePreference.js';
import ItemForm from './ItemForm.jsx';
import DeleteConfirm from './DeleteConfirm.jsx';
import { downloadItemsCsv } from './exportCsv.js';

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
  const { items, config, softDeleteItem, restoreItem } = useItems();
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
  const [formKey, setFormKey] = useState(0); // a fresh form each time one opens
  const [deleteTarget, setDeleteTarget] = useState(null);

  // SPEC.md 19.1/19.4/19.6
  const [sortBy, setSortBy] = useDevicePreference('gallery_sort', 'name', SORT_OPTIONS);
  const [view, setView] = useDevicePreference('gallery_view', 'cards', ['cards', 'list']);
  const [filtersOpen, setFiltersOpen] = useState(false);

  function openForm(item, nextTemplate = null) {
    setTemplate(nextTemplate);
    setEditingItem(item);
    setFormKey((k) => k + 1);
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

  const filtered = useMemo(() => {
    const list = items
      .filter((it) => matchesSearch(it, search))
      .filter((it) => availability === 'all' || it.availability_status === availability)
      .filter((it) => locationFilter === 'all' || it.location === locationFilter)
      .filter((it) => typeFilter === 'all' || it.type === typeFilter)
      .filter((it) => statusFilter === 'all' || it.physical_status === statusFilter)
      .filter((it) => !missingSerial || !it.serial_number)
      .filter((it) => !missingSku || !it.sku)
      .filter((it) => !missingPrice || it.price == null || it.price === '');
    return sortItems(list, sortBy); // the export follows the same order
  }, [items, search, availability, locationFilter, typeFilter, statusFilter, missingSerial, missingSku, missingPrice, sortBy]);

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

  return (
    <div>
      <div className="stats-bar">
        <button
          type="button"
          className={`stats-toggle${statsExpanded ? ' expanded' : ''}`}
          onClick={toggleStats}
          aria-expanded={statsExpanded}
        >
          <span className="chevron">▾</span>
          {stats[0][0]}: {stats[0][1]}
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
      </div>

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
          <span>{t('list.showing')} {filtered.length} {t('list.of')} {items.length}</span>
          <button type="button" className="btn clear-filters" onClick={clearFilters}>{t('filters.clear')}</button>
        </div>
      )}

      {filtered.length === 0 ? (
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
              <ItemRow key={item.row_id} item={item} showModified={sortBy === 'recent'} onClick={() => openForm(item)} />
            ))}
          </div>
        ) : (
          <div className="grid">
            {filtered.map((item) => (
              <ItemCard key={item.row_id} item={item} showModified={sortBy === 'recent'} onClick={() => openForm(item)} />
            ))}
          </div>
        )
      )}

      {editingItem !== undefined && (
        <ItemForm
          key={formKey}
          item={editingItem}
          template={template}
          onDuplicate={(values) => openForm(null, values)}
          onClose={() => setEditingItem(undefined)}
          onRequestDelete={(item) => setDeleteTarget(item)}
          onSaved={() => setEditingItem(undefined)}
        />
      )}

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
