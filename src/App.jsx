function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h1 className="serif" style={{ fontSize: '1.8rem', margin: 0 }}>
        קטלוג הגלריה
      </h1>
      <p style={{ color: 'var(--ink-dim)', margin: 0 }}>
        השלד של האפליקציה מוכן - המסכים האמיתיים בבנייה.
      </p>
    </div>
  )
}

export default App
