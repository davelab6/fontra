import { EditorController } from "./editor";

export class BaseTool {
  editor: EditorController;
  canvasController: any;
  sceneController: any;
  sceneModel: any;
  sceneSettingsController: any;
  sceneSettings: any;

  constructor(editor: EditorController) {
    this.editor = editor;
    this.canvasController = editor.canvasController;
    this.sceneController = editor.sceneController;
    this.sceneModel = this.sceneController.sceneModel;
    this.sceneSettingsController = editor.sceneSettingsController;
    this.sceneSettings = editor.sceneSettings;
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = "default";
  }

  activate() {
    this.setCursor();
  }

  deactivate() {
    //
  }

  handleKeyDown(_event: KeyboardEvent) {
    //
  }
}

const MINIMUM_DRAG_DISTANCE = 2;

export async function shouldInitiateDrag(
  eventStream: MouseEvent[],
  initialEvent: MouseEvent
) {
  // drop events until the pointer moved a minimal distance
  const initialX = initialEvent.pageX;
  const initialY = initialEvent.pageY;

  for await (const event of eventStream) {
    const x = event.pageX;
    const y = event.pageY;
    if (
      Math.abs(initialX - x) > MINIMUM_DRAG_DISTANCE ||
      Math.abs(initialY - y) > MINIMUM_DRAG_DISTANCE
    ) {
      return true;
    }
  }
  return false;
}
