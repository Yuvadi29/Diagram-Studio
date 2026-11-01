"use client";
import { Excalidraw, MainMenu, WelcomeScreen } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export interface CanvasInitialData {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

/**
 * The actual Excalidraw editor (official React component). Loaded with
 * next/dynamic + ssr:false because Excalidraw requires the browser.
 */
export default function ExcalidrawCanvas({
  initialData,
  theme,
  onApi,
  onChange,
}: {
  initialData: CanvasInitialData;
  theme: "dark" | "light";
  onApi: (api: ExcalidrawImperativeAPI) => void;
  onChange: (elements: readonly unknown[], appState: { selectedElementIds?: Record<string, boolean> }) => void;
}) {
  return (
    <div className="excalidraw-host absolute inset-0">
      <Excalidraw
        excalidrawAPI={onApi}
        theme={theme}
        initialData={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          elements: initialData.elements as any,
          appState: { viewBackgroundColor: (initialData.appState?.viewBackgroundColor as string) ?? "#ffffff", currentItemFontFamily: 5 },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          files: (initialData.files ?? {}) as any,
          scrollToContent: true,
        }}
        onChange={(elements, appState) => onChange(elements, appState as unknown as { selectedElementIds?: Record<string, boolean> })}
        UIOptions={{
          canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, toggleTheme: false },
        }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Heading>Describe a diagram in the AI panel, or start drawing.</WelcomeScreen.Center.Heading>
          </WelcomeScreen.Center>
          <WelcomeScreen.Hints.ToolbarHint />
        </WelcomeScreen>
      </Excalidraw>
    </div>
  );
}
