import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { MdCheck } from "react-icons/md";
import { MdCrop } from "react-icons/md";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Card } from "../ui/card";
import styles from "./SourceSelector.module.css";

interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string | null;
  display_id: string;
  appIcon: string | null;
}

type SelectorMode = 'window' | 'region' | 'all';

export function SourceSelector() {
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<DesktopSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  
  // Get mode from URL params
  const mode: SelectorMode = (() => {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    if (modeParam === 'window' || modeParam === 'region') return modeParam;
    return 'all';
  })();

  useEffect(() => {
    async function fetchSources() {
      setLoading(true);
      try {
        // Only fetch window sources if mode is 'window'
        const types: ('screen' | 'window')[] = mode === 'window' ? ['window'] : ['screen', 'window'];
        const rawSources = await window.electronAPI.getSources({
          types,
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: true
        });
        setSources(
          rawSources.map(source => ({
            id: source.id,
            name:
              source.id.startsWith('window:') && source.name.includes(' — ')
                ? source.name.split(' — ')[1] || source.name
                : source.name,
            thumbnail: source.thumbnail,
            display_id: source.display_id,
            appIcon: source.appIcon
          }))
        );
      } catch (error) {
        console.error('Error loading sources:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchSources();
  }, [mode]);

  const screenSources = sources.filter(s => s.id.startsWith('screen:'));
  const windowSources = sources.filter(s => s.id.startsWith('window:'));

  const handleSourceSelect = (source: DesktopSource) => {
    setSelectedSource(source);
    setSelectedRegion(null); // Clear region when selecting a source
    // Close region indicator when selecting a non-region source
    window.electronAPI?.closeRegionIndicator?.();
  };
  
  const handleRegionSelect = async () => {
    // Open region selector and wait for result
    const region = await window.electronAPI.openRegionSelector?.();
    if (region) {
      setSelectedRegion(region);
      // Create a virtual source for the region
      setSelectedSource({
        id: `region:${region.x},${region.y},${region.width},${region.height}`,
        name: `区域 ${region.width}×${region.height}`,
        thumbnail: null,
        display_id: '',
        appIcon: null
      });
      // Show green region indicator overlay immediately after selection
      window.electronAPI?.showRegionIndicator?.(region);
    }
  };
  
  const handleShare = async () => {
    if (selectedSource) await window.electronAPI.selectSource(selectedSource);
  };

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${styles.glassContainer}`} style={{ minHeight: '100vh' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-600 mx-auto mb-2" />
          <p className="text-xs text-zinc-300">Loading sources...</p>
        </div>
      </div>
    );
  }

  // Window-only mode: show only windows without tabs
  if (mode === 'window') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${styles.glassContainer}`}>
        <div className="flex-1 flex flex-col w-full max-w-xl" style={{ padding: 0 }}>
          <div className="text-center mb-3 text-zinc-300 text-sm font-medium">选择窗口</div>
          <div className="h-72 flex flex-col justify-stretch">
            <div className="grid grid-cols-2 gap-2 h-full overflow-y-auto pr-1 relative">
              {windowSources.map(source => (
                <Card
                  key={source.id}
                  className={`${styles.sourceCard} ${selectedSource?.id === source.id ? styles.selected : ''} cursor-pointer h-fit p-2 scale-95`}
                  style={{ margin: 8, width: '90%', maxWidth: 220 }}
                  onClick={() => handleSourceSelect(source)}
                >
                  <div className="p-1">
                    <div className="relative mb-1">
                      <img
                        src={source.thumbnail || ''}
                        alt={source.name}
                        className="w-full aspect-video object-cover rounded border border-gray-700"
                      />
                      {selectedSource?.id === source.id && (
                        <div className="absolute -top-1 -right-1">
                          <div className="w-4 h-4 bg-[#34B27B] rounded-full flex items-center justify-center shadow-md">
                            <MdCheck className={styles.icon} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {source.appIcon && (
                        <img
                          src={source.appIcon}
                          alt="App icon"
                          className={styles.icon + " flex-shrink-0"}
                        />
                      )}
                      <div className={styles.name + " truncate"}>{source.name}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-zinc-800 p-2 w-full max-w-xl">
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => window.close()} className="px-4 py-1 text-xs bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700">取消</Button>
            <Button onClick={handleShare} disabled={!selectedSource} className="px-4 py-1 text-xs bg-[#34B27B] text-white hover:bg-[#34B27B]/80 disabled:opacity-50 disabled:bg-zinc-700">确定</Button>
          </div>
        </div>
      </div>
    );
  }

  // Default mode with tabs (for 'region' and 'all')
  return (
    <div className={`min-h-screen flex flex-col items-center justify-center ${styles.glassContainer}`}>
      <div className="flex-1 flex flex-col w-full max-w-xl" style={{ padding: 0 }}>
        <Tabs defaultValue="screens">
          <TabsList className="grid grid-cols-2 mb-3 bg-zinc-900/40 rounded-full">
            <TabsTrigger value="screens" className="data-[state=active]:bg-[#34B27B] data-[state=active]:text-white text-zinc-200 rounded-full text-xs py-1">屏幕</TabsTrigger>
            <TabsTrigger value="windows" className="data-[state=active]:bg-[#34B27B] data-[state=active]:text-white text-zinc-200 rounded-full text-xs py-1">窗口</TabsTrigger>
          </TabsList>
            <div className="h-72 flex flex-col justify-stretch">
            <TabsContent value="screens" className="h-full">
              <div className="grid grid-cols-2 gap-2 h-full overflow-y-auto pr-1 relative">
                {/* Region selection card */}
                <Card
                  className={`${styles.sourceCard} ${selectedSource?.id.startsWith('region:') ? styles.selected : ''} cursor-pointer h-fit p-2 scale-95`}
                  style={{ margin: 8, width: '90%', maxWidth: 220 }}
                  onClick={handleRegionSelect}
                >
                  <div className="p-1">
                    <div className="relative mb-1">
                      <div className="w-full aspect-video bg-zinc-800 rounded border border-dashed border-zinc-600 flex items-center justify-center">
                        <MdCrop className="w-8 h-8 text-zinc-400" />
                      </div>
                      {selectedSource?.id.startsWith('region:') && (
                        <div className="absolute -top-1 -right-1">
                          <div className="w-4 h-4 bg-[#34B27B] rounded-full flex items-center justify-center shadow-md">
                            <MdCheck className={styles.icon} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className={styles.name + " truncate"}>
                      {selectedRegion ? `区域 ${selectedRegion.width}×${selectedRegion.height}` : '选择区域'}
                    </div>
                  </div>
                </Card>
                
                {screenSources.map(source => (
                  <Card
                    key={source.id}
                    className={`${styles.sourceCard} ${selectedSource?.id === source.id ? styles.selected : ''} cursor-pointer h-fit p-2 scale-95`}
                    style={{ margin: 8, width: '90%', maxWidth: 220 }}
                    onClick={() => handleSourceSelect(source)}
                  >
                    <div className="p-1">
                      <div className="relative mb-1">
                        <img
                          src={source.thumbnail || ''}
                          alt={source.name}
                          className="w-full aspect-video object-cover rounded border border-zinc-800"
                        />
                        {selectedSource?.id === source.id && (
                          <div className="absolute -top-1 -right-1">
                            <div className="w-4 h-4 bg-[#34B27B] rounded-full flex items-center justify-center shadow-md">
                              <MdCheck className={styles.icon} />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className={styles.name + " truncate"}>{source.name}</div>
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="windows" className="h-full">
              <div className="grid grid-cols-2 gap-2 h-full overflow-y-auto pr-1 relative">
                {windowSources.map(source => (
                  <Card
                    key={source.id}
                    className={`${styles.sourceCard} ${selectedSource?.id === source.id ? styles.selected : ''} cursor-pointer h-fit p-2 scale-95`}
                    style={{ margin: 8, width: '90%', maxWidth: 220 }}
                    onClick={() => handleSourceSelect(source)}
                  >
                    <div className="p-1">
                      <div className="relative mb-1">
                        <img
                          src={source.thumbnail || ''}
                          alt={source.name}
                          className="w-full aspect-video object-cover rounded border border-gray-700"
                        />
                        {selectedSource?.id === source.id && (
                          <div className="absolute -top-1 -right-1">
                            <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center shadow-md">
                              <MdCheck className={styles.icon} />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {source.appIcon && (
                          <img
                            src={source.appIcon}
                            alt="App icon"
                            className={styles.icon + " flex-shrink-0"}
                          />
                        )}
                        <div className={styles.name + " truncate"}>{source.name}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
      <div className="border-t border-zinc-800 p-2 w-full max-w-xl">
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => window.close()} className="px-4 py-1 text-xs bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700">取消</Button>
          <Button onClick={handleShare} disabled={!selectedSource} className="px-4 py-1 text-xs bg-[#34B27B] text-white hover:bg-[#34B27B]/80 disabled:opacity-50 disabled:bg-zinc-700">确定</Button>
        </div>
      </div>
    </div>
  );
}
