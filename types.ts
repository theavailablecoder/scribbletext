
export interface RecognitionResult {
  text: string;
  error?: string;
}

export interface DrawingState {
  isDrawing: boolean;
  lastX: number;
  lastY: number;
}
