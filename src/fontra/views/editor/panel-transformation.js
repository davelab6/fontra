import {
  ChangeCollector,
  applyChange,
  consolidateChanges,
  hasChange,
} from "../core/changes.js";
import { EditBehaviorFactory } from "./edit-behavior.js";
import Panel from "./panel.js";
import * as html from "/core/html-utils.js";
import { rectFromPoints, rectSize, unionRect } from "/core/rectangle.js";
import {
  Transform,
  decomposedFromTransform,
  prependTransformToDecomposed,
} from "/core/transform.js";
import { enumerate, parseSelection } from "/core/utils.js";
import { copyComponent } from "/core/var-glyph.js";
import { Form } from "/web-components/ui-form.js";

export default class TransformationPanel extends Panel {
  identifier = "selection-transformation";
  iconPath = "/tabler-icons/shape.svg";

  static styles = `
    .selection-transformation {
      display: flex;
      flex-direction: column;
      gap: 1em;
      justify-content: space-between;
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      padding: 1em;
      white-space: normal;
    }
  `;

  static stylesForm = `
  .ui-form-label {
    overflow-x: unset;
  }

  .origin-radio-buttons {
    display: grid;
    grid-template-columns: auto auto auto;
  }

  .origin-radio-buttons > input[type="radio"] {
    appearance: none;
    background-color: var(--editor-mini-console-background-color-light);
    margin: 2px;
    color: var(--editor-mini-console-background-color-light);
    width: 0.9em;
    height: 0.9em;
    border: 0.15em solid var(--editor-mini-console-background-color-light);
    border-radius: 50%;
    cursor: pointer;
  }

  .origin-radio-buttons > input[type="radio"]:hover {
    background-color: var(--text-input-background-color-dark);
    border: 0.15em solid var(--text-input-background-color-dark);
  }

  .origin-radio-buttons > input[type="radio"]:checked {
    background-color: var(--text-input-background-color-dark);
    border: 0.15em solid var(--text-input-background-color-dark);
  }
`;

  constructor(editorController) {
    super(editorController);
    this.infoForm = new Form();

    this.infoForm.appendStyle(TransformationPanel.stylesForm);
    this.contentElement.appendChild(this.infoForm);
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;

    this.transformParameters = {
      scaleX: 100,
      scaleY: undefined,
      rotation: 0,
      moveX: 0,
      moveY: 0,
      originX: "center",
      originY: "middle",
      originXButton: undefined,
      originYButton: undefined,
      skewX: 0,
      skewY: 0,
    };
  }

  getContentElement() {
    return html.div(
      {
        class: "selection-transformation",
      },
      []
    );
  }

  async update(senderInfo) {
    if (!this.infoForm.contentElement.offsetParent) {
      // If the info form is not visible, do nothing
      return;
    }

    await this.fontController.ensureInitialized;

    const formContents = [];

    formContents.push({ type: "header", label: `Transformations` });

    let radioButtonOrigin = html.createDomElement("div", {
      class: "origin-radio-buttons ui-form-center",
    });

    for (const keyY of ["top", "middle", "bottom"]) {
      for (const keyX of ["left", "center", "right"]) {
        const key = `${keyX}-${keyY}`;
        let radioButton = html.createDomElement("input", {
          "type": "radio",
          "value": key,
          "name": "origin",
          "v-model": "role",
          "class": "ui-form-radio-button",
          "checked":
            keyX === this.transformParameters.originX &&
            keyY === this.transformParameters.originY
              ? "checked"
              : "",
          "onclick": (event) => this._changeOrigin(keyX, keyY),
          "data-tooltip": `Origin ${keyY} ${keyX}`,
          "data-tooltipposition": "bottom",
        });
        radioButtonOrigin.appendChild(radioButton);
      }
    }

    formContents.push({
      type: "single-icon",
      element: radioButtonOrigin,
    });

    formContents.push({ type: "divider" });

    formContents.push({
      type: "edit-number-x-y",
      label: "Origin",
      fieldX: {
        key: "originXButton",
        value: this.transformParameters.originXButton,
      },
      fieldY: {
        key: "originYButton",
        value: this.transformParameters.originYButton,
      },
    });

    formContents.push({ type: "divider" });

    let buttonMove = html.createDomElement("icon-button", {
      "src": "/tabler-icons/arrow-move-right.svg",
      "onclick": (event) =>
        this._transformLayerGlyph(
          new Transform().translate(
            this.transformParameters.moveX,
            this.transformParameters.moveY
          ),
          "move"
        ),
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "Move",
      "data-tooltipposition": "top",
    });

    formContents.push({
      type: "edit-number-x-y",
      label: buttonMove,
      fieldX: {
        key: "moveX",
        value: this.transformParameters.moveX,
      },
      fieldY: {
        key: "moveY",
        value: this.transformParameters.moveY,
      },
    });

    let buttonScale = html.createDomElement("icon-button", {
      "src": "/tabler-icons/resize.svg",
      "onclick": (event) =>
        this._transformLayerGlyph(
          new Transform().scale(
            this.transformParameters.scaleX / 100,
            (this.transformParameters.scaleY
              ? this.transformParameters.scaleY
              : this.transformParameters.scaleX) / 100
          ),
          "scale"
        ),
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "Scale",
      "data-tooltipposition": "top",
    });

    formContents.push({
      type: "edit-number-x-y",
      label: buttonScale,
      fieldX: {
        key: "scaleX",
        id: "selection-transformation-scaleX",
        value: this.transformParameters.scaleX,
      },
      fieldY: {
        key: "scaleY",
        id: "selection-transformation-scaleY",
        value: this.transformParameters.scaleY,
      },
    });

    let buttonRotate = html.createDomElement("icon-button", {
      "src": "/tabler-icons/rotate.svg",
      "onclick": (event) =>
        this._transformLayerGlyph(
          new Transform().rotate((this.transformParameters.rotation * Math.PI) / 180),
          "rotate"
        ),
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "Rotate",
      "data-tooltipposition": "top",
    });

    formContents.push({
      type: "edit-number",
      key: "rotation",
      label: buttonRotate,
      value: this.transformParameters.rotation,
    });

    let buttonSkew = html.createDomElement("icon-button", {
      "src": "/images/skew.svg",
      "onclick": (event) =>
        this._transformLayerGlyph(
          new Transform().skew(
            (this.transformParameters.skewX * Math.PI) / 180,
            (this.transformParameters.skewY * Math.PI) / 180
          ),
          "skew"
        ),
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "Skew",
      "data-tooltipposition": "top",
    });

    formContents.push({
      type: "edit-number-x-y",
      key: '["selectionTransformationSkew"]',
      label: buttonSkew,
      fieldX: {
        key: "skewX",
        id: "selection-transformation-skewX",
        value: this.transformParameters.skewX,
      },
      fieldY: {
        key: "skewY",
        id: "selection-transformation-skewY",
        value: this.transformParameters.skewY,
      },
    });

    formContents.push({ type: "divider" });

    formContents.push({
      type: "icons",
      label: "Flip",
      auxiliaryElements: [
        html.createDomElement("icon-button", {
          "class": "ui-form-icon",
          "src": "/tabler-icons/flip-vertical.svg",
          "data-tooltip": "Flip vertically",
          "data-tooltipposition": "top",
          "onclick": (event) =>
            this._transformLayerGlyph(new Transform().scale(-1, 1), "flip vertically"),
        }),
        html.createDomElement("icon-button", {
          "class": "ui-form-icon",
          "src": "/tabler-icons/flip-horizontal.svg",
          "data-tooltip": "Flip horizontally",
          "data-tooltipposition": "top-right",
          "onclick": (event) =>
            this._transformLayerGlyph(
              new Transform().scale(1, -1),
              "flip horizontally"
            ),
        }),
      ],
    });

    formContents.push({ type: "spacer" });
    formContents.push({ type: "header", label: `Align Objects` });

    let buttonVerticalAlignTop = html.createDomElement("icon-button", {
      "src": "/tabler-icons/vertical-align-left.svg",
      "onclick": (event) => this._alignObjectsLayerGlyph("align left"),
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "Align left",
      "data-tooltipposition": "bottom-left",
    });

    formContents.push({
      type: "icons",
      label: buttonVerticalAlignTop,
      auxiliaryElements: [
        html.createDomElement("icon-button", {
          "src": "/tabler-icons/vertical-align-center.svg",
          "onclick": (event) => this._doSomthing("vertical-align-center"),
          "data-tooltip": "Align center",
          "data-tooltipposition": "bottom",
          "class": "ui-form-icon",
        }),
        html.createDomElement("icon-button", {
          "src": "/tabler-icons/vertical-align-right.svg",
          "onclick": (event) => this._doSomthing("vertical-align-right"),
          "data-tooltip": "Align right",
          "data-tooltipposition": "bottom-right",
          "class": "ui-form-icon",
        }),
      ],
    });

    let buttonHorizontalAlignTop = html.createDomElement("icon-button", {
      "src": "/tabler-icons/horizontal-align-top.svg",
      "onclick": (event) => this._alignObjectsLayerGlyph("align top"),
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "Align top",
      "data-tooltipposition": "bottom-left",
    });

    formContents.push({
      type: "icons",
      label: buttonHorizontalAlignTop,
      auxiliaryElements: [
        html.createDomElement("icon-button", {
          "src": "/tabler-icons/horizontal-align-center.svg",
          "onclick": (event) => this._doSomthing("horizontal-align-middle"),
          "data-tooltip": "Align middle",
          "data-tooltipposition": "bottom",
          "class": "ui-form-icon",
        }),
        html.createDomElement("icon-button", {
          "src": "/tabler-icons/horizontal-align-bottom.svg",
          "onclick": (event) => this._doSomthing("horizontal-align-bottom"),
          "data-tooltip": "Align bottom",
          "data-tooltipposition": "bottom-right",
          "class": "ui-form-icon",
        }),
      ],
    });

    /*  formContents.push({ type: "spacer" });
    formContents.push({ type: "header", label: `Distribute Objects` }); */

    formContents.push({
      type: "icons",
      label: "",
      auxiliaryElements: [
        html.createDomElement("icon-button", {
          "src": "/tabler-icons/layout-distribute-vertical.svg",
          "onclick": (event) => this._doSomthing("layout-distribute-horizontal"),
          "data-tooltip": "Distribute horizontal",
          "data-tooltipposition": "top",
          "class": "ui-form-icon",
        }),
        html.createDomElement("icon-button", {
          "src": "/tabler-icons/layout-distribute-horizontal.svg",
          "onclick": (event) => this._doSomthing("layout-distribute-vertical"),
          "data-tooltip": "Distribute vertical",
          "data-tooltipposition": "top-right",
          "class": "ui-form-icon",
        }),
      ],
    });

    /*     formContents.push({ type: "divider" });

    let buttonDistributeVertical = html.createDomElement("icon-button", {
      "src": "/tabler-icons/layout-distribute-vertical.svg",
      "onclick": (event) => this._doSomthing("layout-distribute-vertical"),
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "distribute vertical",
      "data-tooltipposition": "top-left",
    });

    formContents.push({
      type: "edit-number",
      key: "rotation",
      label: buttonDistributeVertical,
      value: this.transformParameters.rotation,
    });

    let buttonDistributeHorizontal = html.createDomElement("icon-button", {
      "src": "/tabler-icons/layout-distribute-horizontal.svg",
      "onclick": (event) => this._doSomthing("layout-distribute-horizontal"),
      "class": "ui-form-icon ui-form-icon-button",
      "data-tooltip": "distribute horizontal",
      "data-tooltipposition": "top-left",
    });

    formContents.push({
      type: "edit-number",
      key: "rotation",
      label: buttonDistributeHorizontal,
      value: this.transformParameters.rotation,
    }); */

    formContents.push({ type: "spacer" });

    this.infoForm.setFieldDescriptions(formContents);

    this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
      this.transformParameters[fieldItem.key] = value;
      if (fieldItem.key === "originXButton" || fieldItem.key === "originYButton") {
        this.transformParameters[fieldItem.key.replace("Button", "")] = value;

        const iconRadioButtons = this.infoForm.shadowRoot.querySelectorAll(
          ".ui-form-radio-button"
        );
        iconRadioButtons.forEach((radioButton) => {
          radioButton.checked = false;
        });
      }
    };
  }

  _doSomthing(label) {
    console.log("Do something: ", label);
  }

  _getSelectedBounds(layerGlyphController, pointIndices, componentIndices) {
    const selectionRects = [];
    if (pointIndices.length) {
      const selRect = rectFromPoints(
        pointIndices
          .map((i) => layerGlyphController.instance.path.getPoint(i))
          .filter((point) => !!point)
      );
      if (selRect) {
        selectionRects.push(selRect);
      }
    }

    for (const componentIndex of componentIndices) {
      const component = layerGlyphController.components[componentIndex];
      if (!component || !component.controlBounds) {
        continue;
      }
      selectionRects.push(component.controlBounds);
    }

    if (selectionRects.length) {
      const selectionBounds = unionRect(...selectionRects);
      return selectionBounds;
    }
  }

  _getPinPoint(layerGlyphController, pointIndices, componentIndices, originX, originY) {
    let bounds = this._getSelectedBounds(
      layerGlyphController,
      pointIndices,
      componentIndices
    );
    const { width, height } = rectSize(bounds);

    // default from center
    let pinPointX = bounds.xMin + width / 2;
    let pinPointY = bounds.yMin + height / 2;

    if (typeof originX === "number") {
      pinPointX = originX;
    } else if (originX === "left") {
      pinPointX = bounds.xMin;
    } else if (originX === "right") {
      pinPointX = bounds.xMax;
    }

    if (typeof originY === "number") {
      pinPointY = originY;
    } else if (originY === "top") {
      pinPointY = bounds.yMax;
    } else if (originY === "bottom") {
      pinPointY = bounds.yMin;
    }

    return { x: pinPointX, y: pinPointY };
  }

  async _transformLayerGlyph(transformation, undoLabel) {
    let { point: pointIndices, component: componentIndices } = parseSelection(
      this.sceneController.selection
    );

    pointIndices = pointIndices || [];
    componentIndices = componentIndices || [];
    if (!pointIndices.length && !componentIndices.length) {
      return;
    }

    const varGlyphController =
      await this.sceneController.sceneModel.getSelectedVariableGlyphController();

    const editingLayers = this.sceneController.getEditingLayerFromGlyphLayers(
      varGlyphController.layers
    );
    const staticGlyphControllers = {};
    for (const [i, source] of enumerate(varGlyphController.sources)) {
      if (source.layerName in editingLayers) {
        staticGlyphControllers[source.layerName] =
          await this.fontController.getLayerGlyphController(
            varGlyphController.name,
            source.layerName,
            i
          );
      }
    }

    await this.sceneController.editGlyph((sendIncrementalChange, glyph) => {
      const layerInfo = Object.entries(
        this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        const behaviorFactory = new EditBehaviorFactory(
          layerGlyph,
          this.sceneController.selection,
          this.sceneController.experimentalFeatures.scalingEditBehavior
        );
        return {
          layerName,
          changePath: ["layers", layerName, "glyph"],
          layerGlyphController: staticGlyphControllers[layerName],
          editBehavior: behaviorFactory.getBehavior("default", true),
        };
      });

      const editChanges = [];
      const rollbackChanges = [];
      for (const { changePath, editBehavior, layerGlyphController } of layerInfo) {
        const layerGlyph = layerGlyphController.instance;
        const pinPoint = this._getPinPoint(
          layerGlyphController,
          this.transformParameters.originX,
          this.transformParameters.originY
        );

        const t = new Transform()
          .translate(pinPoint.x, pinPoint.y)
          .transform(transformation)
          .translate(-pinPoint.x, -pinPoint.y);

        const pointTransformFunction = t.transformPointObject.bind(t);

        const componentTransformFunction = (component, componentIndex) => {
          component = copyComponent(component);
          component.transformation = prependTransformToDecomposed(
            t,
            component.transformation
          );
          return component;
        };

        const editChange = editBehavior.makeChangeForTransformFunc(
          pointTransformFunction,
          null,
          componentTransformFunction
        );
        applyChange(layerGlyph, editChange);
        editChanges.push(consolidateChanges(editChange, changePath));
        rollbackChanges.push(
          consolidateChanges(editBehavior.rollbackChange, changePath)
        );
      }

      let changes = ChangeCollector.fromChanges(
        consolidateChanges(editChanges),
        consolidateChanges(rollbackChanges)
      );

      return {
        changes: changes,
        undoLabel: undoLabel,
        broadcast: true,
      };
    });
  }

  _changeOrigin(keyX, keyY) {
    this.transformParameters.originX = keyX;
    this.transformParameters.originY = keyY;
    this.transformParameters.originXButton = undefined;
    this.transformParameters.originYButton = undefined;
    this.update();
  }

  async _alignObjectsLayerGlyph(undoLabel) {
    let {
      point: pointIndices,
      component: componentIndices,
      componentOrigin,
      componentTCenter,
    } = parseSelection(this.sceneController.selection);

    pointIndices = pointIndices || [];
    componentIndices = componentIndices || [];
    if (!pointIndices.length && !componentIndices.length) {
      return;
    }

    const varGlyphController =
      await this.sceneController.sceneModel.getSelectedVariableGlyphController();

    const editingLayers = this.sceneController.getEditingLayerFromGlyphLayers(
      varGlyphController.layers
    );
    const staticGlyphControllers = {};
    for (const [i, source] of enumerate(varGlyphController.sources)) {
      if (source.layerName in editingLayers) {
        staticGlyphControllers[source.layerName] =
          await this.fontController.getLayerGlyphController(
            varGlyphController.name,
            source.layerName,
            i
          );
      }
    }

    await this.sceneController.editGlyph((sendIncrementalChange, glyph) => {
      const layerInfo = Object.entries(
        this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        const behaviorFactory = new EditBehaviorFactory(
          layerGlyph,
          this.sceneController.selection,
          this.sceneController.experimentalFeatures.scalingEditBehavior
        );
        return {
          layerName,
          changePath: ["layers", layerName, "glyph"],
          layerGlyphController: staticGlyphControllers[layerName],
          editBehavior: behaviorFactory.getBehavior("default"),
        };
      });

      const editChanges = [];
      const rollbackChanges = [];
      for (const { changePath, editBehavior, layerGlyphController } of layerInfo) {
        const layerGlyph = layerGlyphController.instance;
        // pinPoint might be the alignment point
        /*         const pinPoint = this._getPinPoint(
          layerGlyphController,
          pointIndices,
          componentIndices,
          this.transformParameters.originX,
          this.transformParameters.originY
        ); */

        const alignmentPoint = { x: 0, y: 100 };

        const t = new Transform().translate(alignmentPoint.x, alignmentPoint.y);
        /*           .transform(transformation)
          .translate(-pinPoint.x, -pinPoint.y); */

        const pointTransformFunction = t.transformPointObject.bind(t);
        // TODO: delta for each outline and component is different,
        // depending on the alignment each object has to be moved differently.
        // Not sure if this is possibel with the current implementation
        //delta = {}

        const editChange =
          editBehavior.makeChangeForTransformFunc(pointTransformFunction);

        applyChange(layerGlyph, editChange);
        editChanges.push(consolidateChanges(editChange, changePath));
        rollbackChanges.push(
          consolidateChanges(editBehavior.rollbackChange, changePath)
        );
      }

      let changes = ChangeCollector.fromChanges(
        consolidateChanges(editChanges),
        consolidateChanges(rollbackChanges)
      );

      return {
        changes: changes,
        undoLabel: undoLabel,
        broadcast: true,
      };
    });
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }
}

customElements.define("panel-transformation", TransformationPanel);
