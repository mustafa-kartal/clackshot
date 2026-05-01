// desktopCapturer üzerinden ekran ve pencere kaynaklarını listeler.
// Renderer asla doğrudan desktopCapturer'a erişmez — main process üzerinden
// IPC ile alır (güvenlik ve kontekst izolasyonu için).
import { BrowserWindow, desktopCapturer, screen } from 'electron';
import type { SourceInfo } from '../../../src/shared/types';

// Kendi BrowserWindow'larımızın desktopCapturer source ID'lerini topla.
// Bu sayede overlay, editor widget, facecam gibi pencereler kayıt listesinde görünmez.
function getOwnWindowSourceIds(): Set<string> {
  const ids = new Set<string>();
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      ids.add(win.getMediaSourceId());
    } catch {
      // Pencere destroy edilmişse hata verebilir, yoksay.
    }
  }
  return ids;
}

export async function listSources(
  types: Array<'screen' | 'window'> = ['screen', 'window'],
): Promise<SourceInfo[]> {
  // Liste için küçük thumbnail yeterli; gerçek capture ayrıca yapılacak.
  const sources = await desktopCapturer.getSources({
    types,
    thumbnailSize: { width: 320, height: 200 },
    fetchWindowIcons: false,
  });

  const displays = screen.getAllDisplays();
  const ownIds = getOwnWindowSourceIds();

  return sources
    .filter((s) => !ownIds.has(s.id))
    .map<SourceInfo>((s) => {
      const isScreen = s.id.startsWith('screen:');
      // display_id ekran kaynaklarında dolu olur; window'larda boş.
      const numericDisplayId = isScreen
        ? Number(s.display_id) ||
          displays.find((d) => String(d.id) === s.display_id)?.id
        : undefined;

      return {
        id: s.id,
        name: s.name,
        type: isScreen ? 'screen' : 'window',
        thumbnailDataUrl: s.thumbnail.toDataURL(),
        displayId: numericDisplayId,
      };
    });
}
