// Ambient stub so OCR features typecheck before `npm install` pulls in
// tesseract.js. Real types take over once installed.
declare module 'tesseract.js' {
  interface RecognizeResult { data: { text: string } }
  export function recognize(
    image: string | Blob | File,
    lang?: string,
    options?: { logger?: (m: { status: string; progress?: number }) => void },
  ): Promise<RecognizeResult>;
}
