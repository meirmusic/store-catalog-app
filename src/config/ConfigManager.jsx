import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useItems } from '../items/ItemsContext.jsx';

// SPEC.md CFG-04 (stage 2): a centralized view of every existing value in
// each config-driven list, with the ability to add new ones - lists stay
// add-only (see CFG-01), so there's deliberately no delete control here.
function ConfigListSection({ list, label }) {
  const { t } = useI18n();
  const { config, addConfigValue } = useItems();
  const [draft, setDraft] = useState('');
  const values = config[list] || [];

  async function confirmAdd() {
    if (!draft.trim()) return;
    const added = await addConfigValue(list, draft);
    if (added) setDraft('');
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="badges">
        {values.length === 0 ? (
          <span className="badge missing">{t('config.empty')}</span>
        ) : (
          values.map((v) => <span className="badge" key={v}>{v}</span>)
        )}
      </div>
      <div className="inline-add">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), confirmAdd())}
          placeholder={t('config.addPlaceholder')}
        />
        <button type="button" className="btn" onClick={confirmAdd}>{t('actions.addValue')}</button>
      </div>
    </div>
  );
}

export default function ConfigManager({ onClose }) {
  const { t } = useI18n();

  return (
    <div className="overlay" id="config-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 className="serif">{t('config.manageLists')}</h2>
        <p className="sub">{t('config.manageListsHint')}</p>

        <ConfigListSection list="type" label={t('filters.type')} />
        <ConfigListSection list="location" label={t('filters.location')} />
        <ConfigListSection list="physical_status" label={t('fields.status')} />

        <div className="modal-actions">
          <div className="left-actions">
            <button type="button" className="btn primary" onClick={onClose}>{t('actions.close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
