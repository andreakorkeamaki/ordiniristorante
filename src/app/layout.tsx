import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ConnectionProvider } from "@/components/connection-provider";
import { LegacyServiceWorkerCleanup } from "@/components/legacy-service-worker-cleanup";
import { OfflineBanner } from "@/components/offline-banner";
import { RecoveryRedirect } from "@/components/recovery-redirect";

export const metadata: Metadata = {
  title: {
    default: "La Sagretta",
    template: "%s · La Sagretta",
  },
  description: "Menu e gestione comande in tempo reale per La Sagretta.",
  applicationName: "La Sagretta",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "La Sagretta",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#8e211d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        <LegacyServiceWorkerCleanup />
        <RecoveryRedirect />
        <ConnectionProvider>
          <OfflineBanner />
          {children}
        </ConnectionProvider>
      </body>
    </html>
  );
}
