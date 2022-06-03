import { consolidateChanges } from "../core/changes.js";
import { boolInt, modulo, reversed, sign } from "../core/utils.js";
import * as vector from "../core/vector.js";
import {
  NIL, SEL, UNS, SHA, SMO, OFF, ANY,
  POINT_TYPES,
  buildPointMatchTree,
} from "./edit-behavior-support.js";


export class EditBehaviorFactory {

  constructor(instance, selection) {
    const selectionByType = splitSelectionByType(selection);
    this.contours = unpackContours(instance.path, selectionByType["point"] || []);
    this.components = unpackComponents(instance.components, selectionByType["component"] || []);
    this.behaviors = {};
  }

  getBehavior(behaviorName) {
    let behavior = this.behaviors[behaviorName];
    if (!behavior) {
      let behaviorType = behaviorTypes[behaviorName];
      if (!behaviorType) {
        console.log(`invalid behavior name: "${behaviorName}"`);
        behaviorType = behaviorTypes["default"];
      }
      behavior = new EditBehavior(this.contours, this.components, behaviorType);
      this.behaviors[behaviorName] = behavior;
    }
    return behavior;
  }

}


class EditBehavior {

  constructor(contours, components, behavior) {
    this.constrainDelta = behavior.constrainDelta || (v => v);
    const [pointEditFuncs, participatingPointIndices] = makePointEditFuncs(contours, behavior);
    this.pointEditFuncs = pointEditFuncs;

    this.componentEditFuncs = [];
    for (let componentIndex = 0; componentIndex < components.length; componentIndex++) {
      if (components[componentIndex]) {
        this.componentEditFuncs.push(makeComponentTransformFunc(components[componentIndex], componentIndex));
      }
    }
    this.rollbackChange = makeRollbackChange(contours, participatingPointIndices, components);
  }

  makeChangeForDelta(delta) {
    // For shift-constrain, we need two transform functions:
    // - one with the delta constrained to 0/45/90 degrees
    // - one with the 'free' delta
    // This is because shift-constrain does two fairly distinct things"
    // 1. Move points in only H or V directions
    // 2. Constrain Bézier handles to 0/45/90 degree angles
    // For the latter, we don't want the initial change (before the constraint)
    // to be constrained, but pin the handle angle based on the freely transformed
    // off-curve point.
    return this.makeChangeForTransformFunc(
      makePointTranslateFunction(this.constrainDelta(delta)),
      makePointTranslateFunction(delta),
    );
  }

  makeChangeForTransformFunc(transformFunc, freeTransformFunc) {
    const transform = {
      "constrained": transformFunc,
      "free": freeTransformFunc || transformFunc,
      "constrainDelta": this.constrainDelta,
    };
    const pathChanges = this.pointEditFuncs?.map(
      editFunc => makePointChange(...editFunc(transform))
    );
    const componentChanges = this.componentEditFuncs?.map(
      editFunc => makeComponentOriginChange(...editFunc(transform))
    );
    const changes = [];
    if (pathChanges && pathChanges.length) {
      changes.push(consolidateChanges(pathChanges, ["path"]));
    }
    if (componentChanges && componentChanges.length) {
      changes.push(consolidateChanges(componentChanges, ["components"]));
    }
    return consolidateChanges(changes);
  }

}


function makeRollbackChange(contours, participatingPointIndices, components) {
  const pointRollback = [];
  for (let i = 0; i < contours.length; i++) {
    const contour = contours[i];
    const contourPointIndices = participatingPointIndices[i];
    if (!contour) {
      continue;
    }
    const point = contour.points;
    ;
    pointRollback.push(...contourPointIndices.map(pointIndex => {
      const point = contour.points[pointIndex];
      return makePointChange(pointIndex + contour.startIndex, point.x, point.y);
    }));
  }

  const componentRollback = [];
  for (let componentIndex = 0; componentIndex < components.length; componentIndex++) {
    const component = components[componentIndex];
    if (!component) {
      continue;
    }
    componentRollback.push(makeComponentOriginChange(componentIndex, component.x, component.y))
  }
  const changes = [];
  if (pointRollback.length) {
    changes.push(consolidateChanges(pointRollback, ["path"]));
  }
  if (componentRollback.length) {
    changes.push(consolidateChanges(componentRollback, ["components"]));
  }
  return consolidateChanges(changes);
}


function makeComponentTransformFunc(component, componentIndex) {
  const origin = {
    "x": component.x,
    "y": component.y,
  };
  return transform => {
    const editedOrigin = transform.constrained(origin);
    return [componentIndex, editedOrigin.x, editedOrigin.y];
  }
}


function makePointTranslateFunction(delta) {
  return point => {
    return {"x": point.x + delta.x, "y": point.y + delta.y};
  }
}


function makePointChange(pointIndex, x, y) {
  return {"f": "=xy", "k": pointIndex, "a": [x, y]};
}


function makeComponentOriginChange(componentIndex, x, y) {
  return {
    "p": [componentIndex, "transformation"],
    "c": [{"f": "=", "k": "x", "v": x}, {"f": "=", "k": "y", "v": y}],
  };
}


function splitSelectionByType(selection) {
  const result = {};
  for (const selItem of selection) {
    let [tp, index] = selItem.split("/");
    if (result[tp] === undefined) {
      result[tp] = [];
    }
    result[tp].push(Number(index));
  }
  for (const indices of Object.values(result)) {
    // Ensure indices are sorted
    indices.sort((a, b) => a - b);
  }
  return result;
}


function unpackContours(path, selectedPointIndices) {
  // Return an array with one item per contour. An item is either `undefined`,
  // when no points from this contour are selected, or an object with contour info,
  const contours = new Array(path.contourInfo.length);
  let contourIndex = 0;
  for (const pointIndex of selectedPointIndices) {
    while (path.contourInfo[contourIndex].endPoint < pointIndex) {
      contourIndex++;
    }
    const contourStartIndex = !contourIndex ? 0 : path.contourInfo[contourIndex - 1].endPoint + 1;
    let contour = contours[contourIndex];
    if (contour === undefined) {
      const contourEndIndex = path.contourInfo[contourIndex].endPoint + 1;
      const contourNumPoints = contourEndIndex - contourStartIndex;
      const contourPoints = new Array(contourNumPoints);
      contour = {
        "startIndex": contourStartIndex,
        "points": contourPoints,
        "isClosed": path.contourInfo[contourIndex].isClosed,
      };
      for (let i = 0; i < contourNumPoints; i++) {
        contourPoints[i] = path.getPoint(i + contourStartIndex)
      }
      contours[contourIndex] = contour;
    }
    contour.points[pointIndex - contourStartIndex].selected = true;
  }
  return contours;
}


function unpackComponents(components, selectedComponentIndices) {
  const unpackedComponents = new Array(components.length);
  for (const componentIndex of selectedComponentIndices) {
    unpackedComponents[componentIndex] = {
      "x": components[componentIndex].transformation.x,
      "y": components[componentIndex].transformation.y,
    };
  }
  return unpackedComponents;
}


function makePointEditFuncs(contours, behavior) {
  let contourStartPoint = 0;
  const pointEditFuncs = [];
  const participatingPointIndices = new Array(contours.length);
  for (let contourIndex = 0; contourIndex < contours.length; contourIndex++) {
    const contour = contours[contourIndex];
    if (!contour) {
      continue;
    }
    const [editFuncs, pointIndices] = makeContourPointEditFuncs(contour, behavior);
    pointEditFuncs.push(...editFuncs);
    participatingPointIndices[contourIndex] = pointIndices;
  }
  return [pointEditFuncs, participatingPointIndices];
}


function makeContourPointEditFuncs(contour, behavior) {
  const startIndex = contour.startIndex;
  const originalPoints = contour.points;
  const editPoints = Array.from(originalPoints);  // will be modified
  const numPoints = originalPoints.length;
  const participatingPointIndices = [];
  const editFuncsTransform = [];
  const editFuncsConstrain = [];

  // console.log("------");
  for (let i = 0; i < numPoints; i++) {
    const [match, neighborIndices] = findPointMatch(behavior.matchTree, i, originalPoints, numPoints, contour.isClosed);
    if (match === undefined) {
      continue;
    }
    // console.log(i, match.action, match.ruleIndex);
    const [prevPrev, prev, thePoint, next, nextNext] = match.direction > 0 ? neighborIndices : reversed(neighborIndices);
    participatingPointIndices.push(thePoint);
    const actionFuncionFactory = behavior.actions[match.action];
    if (actionFuncionFactory === undefined) {
      console.log(`Undefined action function: ${match.action}`);
      continue;
    }
    const actionFunc = actionFuncionFactory(
      originalPoints[prevPrev],
      originalPoints[prev],
      originalPoints[thePoint],
      originalPoints[next],
      originalPoints[nextNext],
    );
    if (!match.constrain) {
      // transform
      editFuncsTransform.push(transform => {
        const point = actionFunc(
          transform,
          originalPoints[prevPrev],
          originalPoints[prev],
          originalPoints[thePoint],
          originalPoints[next],
          originalPoints[nextNext],
        );
        editPoints[thePoint] = point;
        return [thePoint + startIndex, point.x, point.y];
      });
    } else {
      // constrain
      editFuncsConstrain.push(transform => {
        const point = actionFunc(
          transform,
          editPoints[prevPrev],
          editPoints[prev],
          editPoints[thePoint],
          editPoints[next],
          editPoints[nextNext],
        );
        return [thePoint + startIndex, point.x, point.y];
      });
    }
  }
  return [editFuncsTransform.concat(editFuncsConstrain), participatingPointIndices];
}


function findPointMatch(matchTree, pointIndex, contourPoints, numPoints, isClosed) {
  let match = matchTree;
  const neighborIndices = new Array();
  for (let neightborOffset = -2; neightborOffset < 3; neightborOffset++) {
    let neighborIndex = pointIndex + neightborOffset;
    if (isClosed) {
      neighborIndex = modulo(neighborIndex, numPoints);
    }
    neighborIndices.push(neighborIndex);
    const point = contourPoints[neighborIndex];
    let pointType;
    if (point === undefined) {
      pointType = DOESNT_EXIST;
    } else {
      const smooth = boolInt(point.smooth);
      const oncurve = boolInt(point.type === 0);
      const selected = boolInt(point.selected);
      pointType = POINT_TYPES[smooth][oncurve][selected];
    }
    match = match[pointType];
    if (match === undefined) {
      // No match
      break;
    }
  }
  return [match, neighborIndices];
}


function constrainHorVerDiag(vector) {
  const constrainedVector = {...vector};
  const ax = Math.abs(vector.x);
  const ay = Math.abs(vector.y);
  let tan;
  if (ax < 0.001) {
    tan = 0;
  } else {
    tan = ay / ax;
  }
  if (0.414 < tan && tan < 2.414) {
    // between 22.5 and 67.5 degrees
    const d = 0.5 * (ax + ay);
    constrainedVector.x = d * sign(constrainedVector.x);
    constrainedVector.y = d * sign(constrainedVector.y);
  } else if (ax > ay) {
    constrainedVector.y = 0;
  } else {
    constrainedVector.x = 0;
  }
  return constrainedVector;
}


const actionFactories = {

  "DontMove": (prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrev, prev, thePoint, next, nextNext) => {
      return thePoint;
    };
  },

  "Move": (prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrev, prev, thePoint, next, nextNext) => {
      return transform.constrained(thePoint);
    };
  },

  "RotateNext": (prevPrev, prev, thePoint, next, nextNext) => {
    const handle = vector.subVectors(thePoint, prev);
    const handleLength = Math.hypot(handle.x, handle.y);
    return (transform, prevPrev, prev, thePoint, next, nextNext) => {
      const delta = vector.subVectors(prev, prevPrev);
      const angle = Math.atan2(delta.y, delta.x);
      const handlePoint = {
        "x": prev.x + handleLength * Math.cos(angle),
        "y": prev.y + handleLength * Math.sin(angle),
      }
      return handlePoint;
    };
  },

  "ConstrainPrevAngle": (prevPrev, prev, thePoint, next, nextNext) => {
    const pt1 = prevPrev;
    const pt2 = prev;
    const perpVector = vector.rotateVector90CW(vector.subVectors(pt2, pt1));
    return (transform, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transform.free(thePoint);
      const [intersection, t1, t2] = vector.intersect(pt1, pt2, point, vector.addVectors(point, perpVector));
      return intersection;
    };
  },

  "ConstrainMiddle": (prevPrev, prev, thePoint, next, nextNext) => {
    const pt1 = prev;
    const pt2 = next;
    const perpVector = vector.rotateVector90CW(vector.subVectors(pt2, pt1));
    return (transform, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transform.free(thePoint);
      const [intersection, t1, t2] = vector.intersect(pt1, pt2, point, vector.addVectors(point, perpVector));
      return intersection;
    };
  },

  "ConstrainMiddleTwo": (prevPrev, prev, thePoint, next, nextNext) => {
    const pt1 = prevPrev;
    const pt2 = next;
    const perpVector = vector.rotateVector90CW(vector.subVectors(pt2, pt1));
    return (transform, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transform.free(thePoint);
      const [intersection, t1, t2] = vector.intersect(pt1, pt2, point, vector.addVectors(point, perpVector));
      return intersection;
    };
  },

  "TangentIntersect": (prevPrev, prev, thePoint, next, nextNext) => {
    const nextHandle = vector.subVectors(thePoint, next);
    return (transform, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transform.free(thePoint);
      const [intersection, t1, t2] = vector.intersect(
        prevPrev,
        prev,
        next,
        vector.addVectors(next, nextHandle),
      );
      if (!intersection) {
        // TODO: fallback to midPoint?
      }
      return intersection;
    };
  },

  "HandleIntersect": (prevPrev, prev, thePoint, next, nextNext) => {
    const handlePrev = vector.subVectors(thePoint, prev);
    const handleNext = vector.subVectors(thePoint, next);
    return (transform, prevPrev, prev, thePoint, next, nextNext) => {
      const [intersection, t1, t2] = vector.intersect(
        prev,
        vector.addVectors(prev, handlePrev),
        next,
        vector.addVectors(next, handleNext),
      );
      if (!intersection) {
        // TODO: fallback to midPoint?
      }
      return intersection;
    };
  },

  "ConstrainHandle": (prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrev, prev, thePoint, next, nextNext) => {
      const newPoint = transform.free(thePoint);
      const handleVector = transform.constrainDelta(vector.subVectors(newPoint, prev));
      return vector.addVectors(prev, handleVector);
    };
  },

  "ConstrainHandleIntersect": (prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrev, prev, thePoint, next, nextNext) => {
      const newPoint = transform.free(thePoint);
      const handlePrev = transform.constrainDelta(vector.subVectors(newPoint, prev));
      const handleNext = transform.constrainDelta(vector.subVectors(newPoint, next));

      const [intersection, t1, t2] = vector.intersect(
        prev,
        vector.addVectors(prev, handlePrev),
        next,
        vector.addVectors(next, handleNext));
      if (!intersection) {
        return newPoint;
      }
      return intersection;
    };
  },

  "ConstrainHandleIntersectPrev": (prevPrev, prev, thePoint, next, nextNext) => {
    const tangentPrev = vector.subVectors(prev, prevPrev);
    return (transform, prevPrev, prev, thePoint, next, nextNext) => {
      const newPoint = transform.free(thePoint);
      const handleNext = transform.constrainDelta(vector.subVectors(newPoint, next));

      const [intersection, t1, t2] = vector.intersect(
        prev,
        vector.addVectors(prev, tangentPrev),
        next,
        vector.addVectors(next, handleNext));
      if (!intersection) {
        return newPoint;
      }
      return intersection;
    };
  },

  "Interpolate": (prevPrev, prev, thePoint, next, nextNext) => {
    const lenPrevNext = vector.vectorLength(vector.subVectors(next, prev));
    const lenPrev = vector.vectorLength(vector.subVectors(thePoint, prev));
    let t = lenPrevNext > 0.0001 ? lenPrev / lenPrevNext : 0;
    return (transform, prevPrev, prev, thePoint, next, nextNext) => {
      const prevNext = vector.subVectors(next, prev);
      return vector.addVectors(prev, vector.mulVector(prevNext, t));
    };
  },

  "InterpolatePrevPrevNext": (prevPrev, prev, thePoint, next, nextNext) => {
    const lenPrevPrevNext = vector.vectorLength(vector.subVectors(next, prevPrev));
    const lenPrevPrev = vector.vectorLength(vector.subVectors(thePoint, prevPrev));
    let t = lenPrevPrevNext > 0.0001 ? lenPrevPrev / lenPrevPrevNext : 0;
    return (transform, prevPrev, prev, thePoint, next, nextNext) => {
      const prevPrevNext = vector.subVectors(next, prevPrev);
      return vector.addVectors(prevPrev, vector.mulVector(prevPrevNext, t));
    };
  },

  "ConstrainAroundPrevPrev": (prevPrev, prev, thePoint, next, nextNext) => {
    return (transform, prevPrev, prev, thePoint, next, nextNext) => {
      const newPoint = transform.free(thePoint);
      const handleVector = transform.constrainDelta(vector.subVectors(newPoint, prevPrev));
      return vector.addVectors(prevPrev, handleVector);
    };
  },

}


const defaultRules = [
  //   prevPrev    prev        the point   next        nextNext    Constrain   Action

  // Default rule: if no other rules apply, just move the selected point
  [    ANY|NIL,    ANY|NIL,    ANY|SEL,    ANY|NIL,    ANY|NIL,    false,      "Move"],

  // Off-curve point next to a smooth point next to a selected point
  [    ANY|SEL,    SMO|UNS,    OFF,        OFF|SHA|NIL,ANY|NIL,    true,       "RotateNext"],

  // Selected tangent point: its neighboring off-curve point should move
  [    SHA|SMO,    SMO|SEL,    OFF|UNS,    OFF|SHA|NIL,ANY|NIL,    true,       "RotateNext"],

  // Selected tangent point, selected handle: constrain both on original angle
  [    SHA|SMO|UNS,SMO|SEL,    OFF|SEL,    OFF|SHA|NIL,ANY|NIL,    true,       "ConstrainPrevAngle"],
  [    ANY,        SHA|SMO|UNS,SMO|SEL,    OFF|SEL,    OFF|SHA|NIL,true,       "ConstrainMiddle"],

  // Free off-curve point, move with on-curve neighbor
  [    ANY|NIL,    SHA|SEL,    OFF,        OFF|SHA|NIL,ANY|NIL,    false,      "Move"],
  [    OFF,        SMO|SEL,    OFF,        OFF|SHA|NIL,ANY|NIL,    false,      "Move"],

  // An unselected off-curve between two on-curve points
  [    ANY,        SMO|SHA|SEL,OFF|UNS,    SMO|SHA,    ANY|NIL,    true,       "HandleIntersect"],
  [    ANY|SEL,    SMO|UNS,    OFF|UNS,    SMO,        ANY|NIL,    true,       "TangentIntersect"],
  [    SMO|SHA,    SMO|SEL,    OFF|UNS,    SMO|SHA,    ANY|NIL,    true,       "TangentIntersect"],
  [    SMO|SHA,    SMO|UNS,    OFF|SEL,    SMO|SEL,    ANY|NIL,    true,       "HandleIntersect"],

  // Tangent bcp constraint
  [    SMO|SHA,    SMO|UNS,    OFF|SEL,    ANY|UNS|NIL,ANY|NIL,    false,      "ConstrainPrevAngle"],
  [    SMO|SHA,    SMO|UNS,    OFF|SEL,    SHA|OFF,    ANY|NIL,    false,      "ConstrainPrevAngle"],

  // Two selected points with an unselected smooth point between them
  [    ANY|SEL,    SMO|UNS,    ANY|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainPrevAngle"],
  [    ANY|SEL,    SMO|UNS,    ANY|SEL,    SMO|UNS,    ANY|SEL,    false,      "DontMove"],
  [    ANY|SEL,    SMO|UNS,    ANY|SEL,    SMO|UNS,    SMO|UNS,    false,      "DontMove"],

  // Selected tangent with selected handle: constrain at original tangent line
  [    SMO|SHA|UNS,SMO|SEL,    OFF|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainPrevAngle"],
  [    ANY,        SHA|SMO|UNS,SMO|SEL,    OFF|SEL,    ANY|NIL,    true,       "ConstrainMiddle"],

  // Selected tangent, selected off-curve, selected smooth
  [    SMO|SHA|UNS,SMO|SEL,    OFF|SEL,    SMO|SEL,    ANY|NIL,    true,       "HandleIntersect"],

  // Selected single off-curve, locked between two unselected smooth points
  [    SHA|SMO|UNS,SMO|UNS,    OFF|SEL,    SMO|UNS,    OFF|SEL,    false,      "DontMove"],
];


const constrainRules = defaultRules.concat([
  // Selected free off curve: constrain to 0, 45 or 90 degrees
  [    OFF|UNS,    SMO|UNS,    OFF|SEL,    OFF|NIL,    ANY|NIL,    false,      "ConstrainHandle"],
  [    ANY|NIL,    SHA|UNS,    OFF|SEL,    OFF|NIL,    ANY|NIL,    false,      "ConstrainHandle"],
  [    OFF|UNS,    SMO|UNS,    OFF|SEL,    SMO|UNS,    OFF|UNS,    false,      "ConstrainHandleIntersect"],
  [    ANY|NIL,    SHA|UNS,    OFF|SEL,    SHA|UNS,    ANY|NIL,    false,      "ConstrainHandleIntersect"],
  [    OFF|UNS,    SMO|UNS,    OFF|SEL,    SHA|UNS,    ANY|NIL,    false,      "ConstrainHandleIntersect"],
  [    SHA|SMO|UNS,SMO|UNS,    OFF|SEL,    SMO|UNS,    OFF|UNS,    false,      "ConstrainHandleIntersectPrev"],
]);


const alternateRules = [
  //   prevPrev    prev        the point   next        nextNext    Constrain   Action

  // Default rule: if no other rules apply, just move the selected point
  [    ANY|NIL,    ANY|NIL,    ANY|SEL,    ANY|NIL,    ANY|NIL,    false,      "Move"],

  // Selected smooth before unselected off-curve
  [    ANY|NIL,    ANY|UNS,    SMO|SEL,    OFF,        ANY|NIL,    false,      "ConstrainMiddle"],
  [    OFF,        SMO|SEL,    SMO|SEL,    OFF|UNS,    ANY|NIL,    false,      "ConstrainMiddleTwo"],
  [    OFF|UNS,    SMO|SEL,    SMO|SEL,    OFF|SEL,    ANY|NIL,    false,      "ConstrainMiddleTwo"],
  [    SMO|SEL,    SMO|SEL,    OFF|SEL,    ANY|NIL,    ANY|NIL,    true,       "RotateNext"],
  [    SMO|SEL,    SMO|UNS,    OFF|SEL,    ANY|NIL,    ANY|NIL,    true,       "ConstrainPrevAngle"],
  [    SMO|UNS,    SMO|SEL,    OFF|SEL,    ANY|NIL,    ANY|NIL,    true,       "ConstrainPrevAngle"],

  // Unselected smooth between sharp and off-curve, one of them selected
  [    ANY|NIL,    SHA|OFF|UNS,SMO|UNS,    OFF|SEL,    ANY|NIL,    true,       "Interpolate"],
  [    ANY|NIL,    SHA|OFF|SEL,SMO|UNS,    OFF|UNS,    ANY|NIL,    true,       "Interpolate"],

  // Two unselected smooth points between two off-curves, one of them selected
  [    OFF|UNS,    SMO|UNS,    SMO|UNS,    OFF|SEL,    ANY|NIL,    true,       "InterpolatePrevPrevNext"],
  [    OFF|SEL,    SMO|UNS,    SMO|UNS,    OFF|UNS,    ANY|NIL,    true,       "InterpolatePrevPrevNext"],

  // An unselected smooth point between two selected off-curves
  [    ANY|NIL,    OFF|SEL,    SMO|UNS,    OFF|SEL,    ANY|NIL,    true,       "Move"],

  // Two unselected smooth points between two selected off-curves
  [    OFF|SEL,    SMO|UNS,    SMO|UNS,    OFF|SEL,    ANY|NIL,    true,       "Move"],

]


const alternateConstrainRules = alternateRules.concat([

  [    ANY|UNS,    SMO|UNS,    SHA|OFF|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainAroundPrevPrev"],

]);


const behaviorTypes = {

  "default": {
    "matchTree": buildPointMatchTree(defaultRules),
    "actions": actionFactories,
  },

  "constrain": {
    "matchTree": buildPointMatchTree(constrainRules),
    "actions": actionFactories,
    "constrainDelta": constrainHorVerDiag,
  },

  "alternate": {
    "matchTree": buildPointMatchTree(alternateRules),
    "actions": actionFactories,
  },

  "alternate-constrain": {
    "matchTree": buildPointMatchTree(alternateConstrainRules),
    "actions": actionFactories,
    "constrainDelta": constrainHorVerDiag,
  },

}
