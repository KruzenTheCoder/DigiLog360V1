// Ambient stub so the voice-note module typechecks before `npm install`.
declare module 'expo-av' {
  export namespace Audio {
    export const RecordingOptionsPresets: {
      HIGH_QUALITY: unknown;
      LOW_QUALITY: unknown;
    };
    export function setAudioModeAsync(opts: unknown): Promise<void>;
    export function requestPermissionsAsync(): Promise<{ granted: boolean }>;
    export class Recording {
      static createAsync(
        options?: unknown,
        onRecordingStatusUpdate?: (status: unknown) => void,
        progressUpdateIntervalMillis?: number,
      ): Promise<{ recording: Recording }>;
      prepareToRecordAsync(options?: unknown): Promise<void>;
      startAsync(): Promise<void>;
      stopAndUnloadAsync(): Promise<void>;
      getURI(): string | null;
    }
    export interface PlaybackStatus {
      isLoaded: boolean;
      isPlaying?: boolean;
      didJustFinish?: boolean;
      positionMillis?: number;
      durationMillis?: number;
    }
    export class Sound {
      static createAsync(
        source: { uri: string },
        initialStatus?: unknown,
        onPlaybackStatusUpdate?: (status: PlaybackStatus) => void,
      ): Promise<{ sound: Sound }>;
      playAsync(): Promise<void>;
      pauseAsync(): Promise<void>;
      stopAsync(): Promise<void>;
      replayAsync(): Promise<void>;
      unloadAsync(): Promise<void>;
      setOnPlaybackStatusUpdate(cb: (status: PlaybackStatus) => void): void;
    }
  }
}
