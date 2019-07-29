const Cesium = require('cesium/Cesium');

export const calculatePositionFromMatrix = (matrix) => {
  const position = new Cesium.Cartesian3();

  if (matrix) {
    Cesium.Matrix4.getTranslation(matrix, position);
  }

  return position;
};

export const calculateOrientationFromMatrix = (matrix) => {
  const orientation = new Cesium.Quaternion();

  if (matrix) {
    const rotMatrix = new Cesium.Matrix3();

    Cesium.Matrix4.getRotation(matrix, rotMatrix);
    Cesium.Quaternion.fromRotationMatrix(rotMatrix, orientation);
  }

  return orientation;
};
