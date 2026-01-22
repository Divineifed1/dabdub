import ConnectivityStatus from "@/components/ConnectivityStatus";
import InstallPrompt from "@/components/InstallPrompt";

export default function OfflinePage() {
  return (
    <main
      className="min-h-screen text-[var(--text)]"
      style={{
        background:
          "radial-gradient(circle at top, #1d2948 0%, #0b1020 55%, #070a15 100%)",
      }}
    >
      <ConnectivityStatus />
      <InstallPrompt />
      <main className="offline-page">
        <div className="offline-card">
          <p className="eyebrow">DabDub Offline</p>
          <h1>No signal, still settling.</h1>
          <p>
            DabDub keeps merchant dashboards, payment requests, and QR-based
            flows available offline. Your queued crypto-to-fiat settlement
            actions will sync automatically once connectivity returns.
          </p>
          <p className="status">
            Multi-chain payments stay tracked, and background sync resumes
            confirmations when you are back online.
          </p>
          <button className="primary">Return to cached content</button>
        </div>
      </main>
    </main>
  );
}
