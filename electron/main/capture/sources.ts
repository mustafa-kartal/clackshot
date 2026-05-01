// desktopCapturer üzerinden ekran ve pencere kaynaklarını listeler.
// Renderer asla doğrudan desktopCapturer'a erişmez — main process üzerinden
// IPC ile alır (güvenlik ve kontekst izolasyonu için).
import { desktopCapturer, screen } from 'electron';
import type { SourceInfo } from '../../../src/shared/types';

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

  return sources.map<SourceInfo>((s) => {
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
