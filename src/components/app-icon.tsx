/**
 * App-Symbol (für ImageResponse): dunkle Kachel, Ziellinien-Karomuster,
 * rotes „Live“-Licht und kursives „LT“ (Live Timing) im F1-Stil.
 */
export function AppIconArt({ size }: { size: number }) {
  const u = size / 100;
  const checks = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 10; c++) {
      if ((r + c) % 2 === 0) {
        checks.push(
          <div
            key={`${r}-${c}`}
            style={{
              position: "absolute",
              left: c * 10 * u,
              bottom: r * 5 * u,
              width: 10 * u,
              height: 5 * u,
              background: "#f5f5f7",
              opacity: 0.9,
            }}
          />,
        );
      }
    }
  }
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #1d1d24 0%, #08080b 70%)",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 7 * u, background: "#e10600" }} />
      <div
        style={{
          position: "absolute",
          right: 12 * u,
          top: 17 * u,
          width: 9 * u,
          height: 9 * u,
          borderRadius: 999,
          background: "#e10600",
          boxShadow: `0 0 ${6 * u}px #e10600`,
        }}
      />
      <div
        style={{
          display: "flex",
          fontSize: 46 * u,
          fontWeight: 900,
          fontStyle: "italic",
          letterSpacing: -2 * u,
          color: "#f5f5f7",
          marginTop: -4 * u,
          transform: "skewX(-8deg)",
        }}
      >
        LT
      </div>
      {checks}
    </div>
  );
}
