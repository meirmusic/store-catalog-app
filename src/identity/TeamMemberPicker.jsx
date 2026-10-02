import { useItems } from '../items/ItemsContext.jsx';
import { useTeamMember } from './TeamMemberContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import BrandCover from './BrandCover.jsx';

export default function TeamMemberPicker() {
  const { member, setMember } = useTeamMember();
  // The shared team list (SPEC.md section 15): built-in names plus any
  // added in "manage lists", sorted.
  const { config } = useItems();
  const { t } = useI18n();

  if (member) return null;

  return (
    <BrandCover>
      <h2 className="serif" style={{ margin: '0 0 6px', fontSize: '1.3rem' }}>
        {t('teamMember.title')}
      </h2>
      <p style={{ color: 'var(--ink-dim)', fontSize: '.88rem', margin: '0 0 18px' }}>
        {t('teamMember.subtitle')}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        {config.team.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setMember(name)}
            style={{
              padding: '12px 18px',
              borderRadius: 4,
              border: '1px solid var(--line)',
              background: 'var(--stone)',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              minWidth: 96,
            }}
          >
            {name}
          </button>
        ))}
      </div>
    </BrandCover>
  );
}
