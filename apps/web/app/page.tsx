export const dynamic = 'force-static';

export default function Home() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
        background: 'radial-gradient(120% 120% at 50% 0%, #1b2a4a 0%, #0b1220 60%)',
        color: '#f4f6fb',
      }}
    >
      <div style={{ fontSize: 44 }}>⚓</div>
      <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>Anchor</h1>
      <p style={{ fontSize: 18, fontWeight: 600, margin: 0, maxWidth: 420 }}>
        Der Trip, der endlich stattfindet.
      </p>
      <p style={{ fontSize: 15, opacity: 0.7, margin: 0, maxWidth: 440, lineHeight: 1.5 }}>
        Anchor hält deine Crew zusammen: Termin finden, verbindlich zusagen, Unterkunft küren,
        Kosten fair teilen.
      </p>
      <p style={{ fontSize: 13, opacity: 0.5, marginTop: 8 }}>
        Du brauchst einen Einladungslink deiner Gruppe, um loszulegen.
      </p>
    </main>
  );
}
