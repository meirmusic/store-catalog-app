import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useItems } from './ItemsContext.jsx';
import ItemCard from './ItemCard.jsx';
import ItemForm from './ItemForm.jsx';
import DeleteConfirm from './DeleteConfirm.jsx';

function matchesSearch(item, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    (item.name && item.name.toLowerCase().includes(needle)) ||
    (item.sku && String(item.sku).toLowerCase().includes(needle)) ||
    (item.serial_number && String(item.serial_number).toLowerCase().includes(needle))
  );
}

export default function ItemList() {
  const { t } = useI18n();
  const { items, config, softDeleteItem } = useItems();

  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [missingSerial, setMissingSerial] = useState(false);
  const [missingSku, setMissingSku] = useState(false);
  const [missingPrice, setMissingPrice] = useState(false);

  const [editingItem, setEditingItem] = useState(undefined); // undefined = closed, null = new, object = edit
  const [deleteTarget, setDeleteTarget] = useState(null);

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
    return items
      .filter((it) => matchesSearch(it, search))
      .filter((it) => availability === 'all' || it.availability_status === availability)
      .filter((it) => locationFilter === 'all' || it.location === locationFilter)
      .filter((it) => typeFilter === 'all' || it.type === typeFilter)
      .filter((it) => statusFilter === 'all' || it.physical_status === statusFilter)
      .filter((it) => !missingSerial || !it.serial_number)
      .filter((it) => !missingSku || !it.sku)
      .filter((it) => !missingPrice || it.price == null || it.price === '')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
  }, [items, search, availability, locationFilter, typeFilter, statusFilter, missingSerial, missingSku, missingPrice]);

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

        {statsExpanded ? (
          <div className="stats">
            {stats.map(([label, count]) => (
              <div className="stat" key={label}>
                <b>{count}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
        ) : (
          stats.length > 1 && (
            <div className="stats-compact">
              {stats.slice(1).map(([label, count], i) => (
                <span key={label}>
                  {i > 0 && <span className="sep">·</span>} <b>{count}</b> {label}
                </span>
              ))}
            </div>
          )
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
          <button className="btn primary" onClick={() => setEditingItem(null)}>{t('actions.newItem')}</button>
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
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">{t('list.empty')}</div>
      ) : (
        <div className="grid">
          {filtered.map((item) => (
            <ItemCard key={item.row_id} item={item} onClick={() => setEditingItem(item)} />
          ))}
        </div>
      )}

      {editingItem !== undefined && (
        <ItemForm
          item={editingItem}
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
            await softDeleteItem(deleteTarget.row_id);
            setDeleteTarget(null);
            setEditingItem(undefined);
          }}
        />
      )}
    </div>
  );
}
