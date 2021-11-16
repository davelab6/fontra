import VarArray from "./var-array.js"
import { VariationError } from "./errors.js"


export default class VarPath {

  // point types
  static ON_CURVE = 0x00;
  static OFF_CURVE_QUAD = 0x01;
  static OFF_CURVE_CUBIC = 0x02;
  static SMOOTH_FLAG = 0x08;
  static POINT_TYPE_MASK = 0x07;

  constructor(coordinates, pointTypes, contours) {
    if (coordinates === undefined) {
      this.coordinates = new VarArray();
      this.pointTypes = [];
      this.contours = [];
    } else {
      this.coordinates = coordinates;
      this.pointTypes = pointTypes;
      this.contours = contours;
    }
  }

  *iterPoints() {
    for (let i = 0; i < this.pointTypes.length; i++) {
      yield {
        x: this.coordinates[i * 2],
        y: this.coordinates[i * 2 + 1],
        type: this.pointTypes[i] & VarPath.POINT_TYPE_MASK,
        smooth: !!(this.pointTypes[i] & VarPath.SMOOTH_FLAG),
      };
    }
  }

  *iterHandles() {
    let startPoint = 0;
    for (const contour of this.contours) {
      const endPoint = contour.endPoint;
      let prevIndex = contour.isClosed ? endPoint : startPoint;
      for (let nextIndex = startPoint + (contour.isClosed ? 0 : 1); nextIndex <= endPoint; nextIndex++) {
        const prevType = this.pointTypes[prevIndex] & VarPath.POINT_TYPE_MASK;
        const nextType = this.pointTypes[nextIndex] & VarPath.POINT_TYPE_MASK;
        if (prevType != nextType) {
          yield [
            {x: this.coordinates[prevIndex * 2], y: this.coordinates[prevIndex * 2 + 1]},
            {x: this.coordinates[nextIndex * 2], y: this.coordinates[nextIndex * 2 + 1]},
          ];
        }
        prevIndex = nextIndex;
      }
      startPoint = endPoint + 1;
    }
  }

  copy() {
    return new this.constructor(
      this.coordinates.copy(),
      this.pointTypes.slice(),
      this.contours.map(item => { return {...item} }),
    );
  }

  beginPath() {
    if (this.contours.length) {
      this.contours.push({endPoint: this.contours[this.contours.length - 1].endPoint, isClosed: false});
    } else {
      this.contours.push({endPoint: -1, isClosed: false});
    }
  }

  addPoint(x, y, pointType) {
    this.contours[this.contours.length - 1].endPoint += 1;
    this.coordinates.push(x, y);
    this.pointTypes.push(pointType);
  }

  moveTo(x, y) {
    this.beginPath();
    this.addPoint(x, y, VarPath.ON_CURVE);
  }

  lineTo(x, y) {
    this.addPoint(x, y, VarPath.ON_CURVE);
  }

  curveTo(x1, y1, x2, y2, x3, y3) {
    this.addPoint(x1, y1, VarPath.OFF_CURVE_CUBIC);
    this.addPoint(x2, y2, VarPath.OFF_CURVE_CUBIC);
    this.addPoint(x3, y3, VarPath.ON_CURVE);
  }

  qCurveTo( /* var args */ ) {
    const numArgs = arguments.length
    if (numArgs % 2) {
      throw new Error("number of arguments to qCurveTo must be even");
    }
    for (let i = 0; i < numArgs - 2; i += 2) {
      this.addPoint(arguments[i], arguments[i + 1], VarPath.OFF_CURVE_QUAD);
    }
    const i = numArgs - 2;
    this.addPoint(arguments[i], arguments[i + 1], VarPath.ON_CURVE);
  }

  closePath() {
    this.contours[this.contours.length - 1].isClosed = true;
  }

  addItemwise(other) {
    let otherCoordinates;
    if (other instanceof VarPath) {
      this._ensureCompatibility(other);
      otherCoordinates = other.coordinates;
    } else {
      otherCoordinates = other;
    }
    return new this.constructor(this.coordinates.addItemwise(otherCoordinates), this.pointTypes, this.contours);
  }

  subItemwise(other) {
    let otherCoordinates;
    if (other instanceof VarPath) {
      this._ensureCompatibility(other);
      otherCoordinates = other.coordinates;
    } else {
      otherCoordinates = other;
    }
    return new this.constructor(this.coordinates.subItemwise(otherCoordinates), this.pointTypes, this.contours);
  }

  _ensureCompatibility(other) {
    if (!arrayEquals(this.pointTypes, other.pointTypes) || !arrayEquals(this.contours, other.contours)) {
      throw new VariationError("paths are not compatible");
    }
  }

  mulScalar(scalar) {
    return new this.constructor(this.coordinates.mulScalar(scalar), this.pointTypes, this.contours);
  }

  drawToPath(path) {
    let startPoint = 0
    for (const contour of this.contours) {
      const endPoint = contour.endPoint;
      const numPoints = contour.endPoint + 1 - startPoint;

      const coordinates = this.coordinates;
      const pointTypes = this.pointTypes;
      var firstOnCurve = null;

      // Determine the index of the first on-curve point, if any
      for (let i = 0; i < numPoints; i++) {
        if ((pointTypes[i] & VarPath.POINT_TYPE_MASK) === VarPath.ON_CURVE) {
          firstOnCurve = i;
          break;
        }
      }

      if (firstOnCurve !== null) {
        drawContourToPath(path, coordinates, pointTypes, startPoint, numPoints, firstOnCurve, contour.isClosed);
      } else {
        // draw quad blob
        // create copy of contour points, and insert implied on-curve at front
        const blobCoordinates = coordinates.slice(startPoint * 2, (endPoint + 1) * 2);
        const blobPointTypes = pointTypes.slice(startPoint, endPoint + 1);
        const xMid = (blobCoordinates[0] + blobCoordinates[endPoint * 2]) / 2;
        const yMid = (blobCoordinates[1] + blobCoordinates[endPoint * 2 + 1]) / 2;
        blobCoordinates.unshift(xMid, yMid);
        blobPointTypes.unshift(VarPath.ON_CURVE);
        drawContourToPath(path, blobCoordinates, blobPointTypes, 0, numPoints + 1, 0, true);
      }

      startPoint = endPoint + 1;
    }
  }
}


function drawContourToPath(path, coordinates, pointTypes, startPoint, numPoints, firstOnCurve, isClosed) {
  let currentSegment = [];
  let segmentFunc = drawLineSegment;
  const lastIndex = isClosed ? numPoints : numPoints - 1 - firstOnCurve;
  for (let i = 0; i <= lastIndex; i++) {
    const index = isClosed ? (startPoint + (firstOnCurve + i) % numPoints) : (startPoint + firstOnCurve + i);
    const pointType = pointTypes[index] & VarPath.POINT_TYPE_MASK;
    const x = coordinates[index * 2];
    const y = coordinates[index * 2 + 1];
    if (i === 0) {
      path.moveTo(x, y);
    } else {
      currentSegment.push(x, y);
      switch (pointType) {
        case VarPath.ON_CURVE:
          segmentFunc(path, currentSegment)
          currentSegment = [];
          segmentFunc = drawLineSegment;
          break;
        case VarPath.OFF_CURVE_QUAD:
          segmentFunc = drawQuadSegment;
          break;
        case VarPath.OFF_CURVE_CUBIC:
          segmentFunc = drawCubicSegment;
          break;
        default:
          throw new Error("illegal point type");
      }
    }
  }
  if (isClosed) {
    path.closePath();
  }
}


function drawLineSegment(path, segment) {
  path.lineTo(...segment);
}


function drawQuadSegment(path, segment) {
  let [x1, y1] = [segment[0], segment[1]]
  const lastIndex = segment.length - 2;
  for (let i = 2; i < lastIndex; i += 2) {
    const [x2, y2] = [segment[i], segment[i + 1]];
    const xMid = (x1 + x2) / 2;
    const yMid = (y1 + y2) / 2;
    path.bezierQuadTo(x1, y1, xMid, yMid);
    [x1, y1] = [x2, y2];
  }
  path.bezierQuadTo(x1, y1, segment[lastIndex], segment[lastIndex + 1]);
}


function drawCubicSegment(path, segment) {
  if (segment.length === 6) {
    path.bezierCurveTo(...segment);
  } else if (segment.length >= 2) {
    // TODO warn or error
    path.lineTo(...segment.slice(-2));
  }
}


function arrayEquals(a, b) {
  // Oh well
  return JSON.stringify(a) === JSON.stringify(b);
}
