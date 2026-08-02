import type { CanvasStoreInstance } from './store/store.types.js';
import { stickyShapeUtil } from './shapes/sticky/sticky-shape-util.js';
import { textShapeUtil } from './shapes/text/text-shape-util.js';
import { drawShapeUtil } from './shapes/draw/draw-shape-util.js';
import { imageShapeUtil } from './shapes/image/image-shape-util.js';
import { createConnectorShapeUtil } from './shapes/connector/connector-shape-util.js';
import { createHandTool } from './tools/hand-tool.js';
import { createDrawTool } from './tools/draw-tool.js';
import { createTextTool } from './tools/text-tool.js';
import { createStickyTool } from './tools/sticky-tool.js';
import { createConnectorTool } from './tools/connector-tool.js';
import { createPlaceTool } from './tools/place-tool.js';

/**
 * Register the whiteboard base set on a canvas instance (#118): the
 * sticky/text/draw/image shape modules plus the instance-scoped connector
 * family, and the hand/draw/text/sticky/connector/place tools (select is
 * pre-registered by `createCanvasStore`). This reproduces the enterprise
 * canvas's static registry/TOOLS map as one explicit call — hosts wanting
 * a different set register modules/tools individually instead.
 */
export function registerWhiteboard(instance: CanvasStoreInstance): void {
  instance.shapeUtils.register(stickyShapeUtil);
  instance.shapeUtils.register(textShapeUtil);
  instance.shapeUtils.register(drawShapeUtil);
  instance.shapeUtils.register(imageShapeUtil);
  instance.shapeUtils.register(createConnectorShapeUtil(instance));

  instance.tools.register(createHandTool());
  instance.tools.register(createDrawTool());
  instance.tools.register(createTextTool(instance));
  instance.tools.register(createStickyTool(instance));
  instance.tools.register(createConnectorTool(instance));
  instance.tools.register(createPlaceTool(instance));
}
