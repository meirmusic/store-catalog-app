// SPEC.md 25.3: the screens before the catalog (sign-in, forgot password,
// "who's working") look like the 2025 catalog's cover - black, the logo in
// white and the tagline - with the form below.
export default function BrandCover({ children }) {
  return (
    <div className="brand-cover">
      <div className="brand-cover-inner">
        <div className="brand-cover-head">
          <img src="./logo-white.png" alt="Yossi Bitton Fine Art" className="brand-cover-logo" />
          <p className="brand-cover-tagline" lang="en" dir="ltr">Art that speaks to your soul</p>
        </div>
        <div className="brand-cover-panel">{children}</div>
      </div>
    </div>
  );
}
