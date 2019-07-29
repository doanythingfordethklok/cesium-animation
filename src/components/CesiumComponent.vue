<template>
  <div style="background-color:lightblue; width:100%; height:100%;">
    <div id="toolbar">
      <table>
        <tbody>
          <tr>
            <td>
              <input type="file" id="gltf_file" name="gltf_file" accept="*" />
            </td>
            <td v-if="animation_player.animation_set">
              <div style="display:inline;">
                <select @change="onAnimationSelect($event)">
                  <option disabled value="">Please select one</option>
                  <option v-for="animation in animation_player.animation_set.animations">{{ animation.name }}</option>
                </select>
              </div>
              <button v-on:click="play">
                Play
              </button>
              <button v-on:click="pause">
                Pause
              </button>
              <button v-on:click="stop">
                Stop
              </button>
            </td>
            <td v-show="animation_player.animation_set">
              Animation Percent
              <input type="range" min="0" max="100" step="1" data-bind="value: pixelRange, valueUpdate: 'input'" />
              <input type="text" size="3" data-bind="value: pixelRange" />
            </td>
          </tr>
          <tr>
            <td>
              <div v-if="animation_player.animation_set">
                Display Transform
                <select @change="onNodeSelect($event)">
                  <option disabled value="">Please select one</option>
                  <option>None</option>
                  <option v-for="node in animation_player.animation_set.nodes">{{ node.name }}</option>
                </select>
              </div>
            </td>
            <!-- DEBUG TOOLS
                <td>
                  Rotation Axis
                  <select @change="onAxisSelect($event)">
                    <option>X</option>
                    <option>Y</option>
                    <option>Z</option>
                  </select>
                </td>
                <td>
                  Rotation Percent
                  <input type="range" min="-3.14" max="3.14" step=".1" data-bind="value: rotationRange, valueUpdate: 'input'">
                  <input type="text" size="3" data-bind="value: rotationRange">
                </td>
                 -->
          </tr>
        </tbody>
      </table>
    </div>
    <div id="cesiumContainer" style="width:100%; height:100%;" />
  </div>
</template>

<script>
import "cesium/Widgets/widgets.css";
var Cesium = require("cesium/Cesium");
import {
  AnimationParser,
  AnimationPlayer,
  Animation,
  AnimationTrack,
  AnimationKey,
  LOOP_TYPE
} from "../cesium_model_animation_player";
import { calcNodeWorldSpaceTransform } from "../lib/transform";
import { calculatePositionFromMatrix, calculateOrientationFromMatrix } from "../lib/calc";

export default {
  data() {
    return {
      viewer: {},
      entity: {},
      viewModel: {},
      animation_player: {},
      tracking_items: {
        current_transform: new Cesium.Matrix4(), // the most recent result of calcWorldSpaceTransform
        debug_axis: null,
        cone: null,
        selected_node: null // the node which is selected. If null, nothing is shown.
      },
      axis: Cesium.Cartesian3.UNIT_X
    };
  },
  props: ["onMouseOver", "onEntitySelected"],
  created() {},

  mounted() {
    const self = this;
    // add event handler for loading file
    document.getElementById("gltf_file").addEventListener("change", this.loadFile, false);

    this.viewer = new Cesium.Viewer("cesiumContainer");
    this.viewModel = {
      pixelRange: 0,
      rotationRange: 0
    };
    Cesium.knockout.track(this.viewModel);

    var toolbar = document.getElementById("toolbar");
    Cesium.knockout.applyBindings(this.viewModel, toolbar);

    const that = this;
    Cesium.knockout.getObservable(self.viewModel, "pixelRange").subscribe(function(newValue) {
      that.animation_player.stop();
      that.animation_player.setPercent(newValue / 100.0);
      that.updateTransform();
    });
  },
  methods: {
    async loadFile(e) {
      const that = this;
      var gltf_file = e.target.files[0];
      var file_temp_url = URL.createObjectURL(e.target.files[0]);

      AnimationParser.parseAnimationSetFromUri(file_temp_url);

      this.viewer.entities.removeAll();
      this.viewer.scene.primitives.removeAll();

      var position = Cesium.Cartesian3.fromDegrees(-123.0744619, 44.0503706, 0);
      var entity = this.viewer.entities.add({
        //Use our computed positions
        position: position,
        //Load the Cesium plane model to represent the entity
        model: {
          uri: file_temp_url,
          runAnimations: false
        }
      });

      this.viewer.trackedEntity = entity;
      this.entity = entity;

      let entityMatrix = new Cesium.Matrix4();
      let entityRotation = new Cesium.Matrix3();
      let entityQuat = new Cesium.Quaternion();
      Cesium.Transforms.eastNorthUpToFixedFrame(position, Cesium.Ellipsoid.WGS84, entityMatrix);
      Cesium.Matrix4.getRotation(entityMatrix, entityRotation);
      Cesium.Quaternion.fromRotationMatrix(entityRotation, entityQuat);
      entity.orientation = entityQuat;

      let animation_set = await AnimationParser.parseAnimationSetFromUri(file_temp_url);
      let player = new AnimationPlayer(animation_set, this.entity, 60);
      player.loop_type = LOOP_TYPE.LOOP;
      player.speed = 2;

      this.animation_player = player;

      // initilized geometry for debug axis and cone only once, then re-use it.
      this.tracking_items.debug_axis = this.createDebugAxis();
      this.tracking_items.cone = this.createCone();

      // register hooks for the animation so that attached geometry can use it
      player.addUpdateHook(() => that.updateTransform());
    },

    play() {
      this.animation_player.play();
    },
    pause() {
      this.animation_player.pause();
    },
    stop() {
      this.animation_player.stop();
    },
    onAxisSelect(event) {
      if (event.target.value == "X") this.axis = Cesium.Cartesian3.UNIT_X;
      else if (event.target.value == "Y") this.axis = Cesium.Cartesian3.UNIT_Y;
      else if (event.target.value == "Z") this.axis = Cesium.Cartesian3.UNIT_Z;
    },
    onAnimationSelect(event) {
      this.animation_player.setAnimation(event.target.value);
    },

    onNodeSelect(e) {
      if (e.target.value === "None") {
        this.tracking_items.selected_node = null;
        this.tracking_items.debug_axis.show = false;
        this.tracking_items.cone.show = false;
      } else {
        this.tracking_items.selected_node = e.target.value;
        this.tracking_items.debug_axis.show = true;
        this.tracking_items.cone.show = true;
      }

      this.updateTransform();
    },

    createDebugAxis() {
      return this.viewer.scene.primitives.add(
        new Cesium.DebugModelMatrixPrimitive({
          modelMatrix: new Cesium.Matrix4(),
          length: 125.0,
          width: 5.0,
          show: false
        })
      );
    },

    createCone(matrix) {
      const that = this;
      const getPosition = () => {
        return calculatePositionFromMatrix(that.tracking_items.current_transform);
      };

      const getOrientation = () => {
        return calculateOrientationFromMatrix(that.tracking_items.current_transform);
      };

      return this.viewer.entities.add({
        name: "cone",
        position: new Cesium.CallbackProperty(getPosition, false),
        orientation: new Cesium.CallbackProperty(getOrientation, false),
        show: false,
        cylinder: {
          length: 50.0,
          topRadius: 20.0,
          bottomRadius: 0,
          material: Cesium.Color.PINK,
          outline: true,
          outlineColor: Cesium.Color.RED
        }
      });
    },

    updateTransform() {
      // updateTransform() can be called any time the main entity is updated (onNodeSelect, animation, etc)
      // it will calculate the world transform and store it so that the code can use it in the CallbackProperty.

      if (this.tracking_items.selected_node !== null) {
        this.tracking_items.current_transform = calcNodeWorldSpaceTransform(
          this.animation_player.animation_set,
          this.entity,
          this.tracking_items.selected_node
        );
      }

      if (this.tracking_items.debug_axis) {
        this.tracking_items.debug_axis.modelMatrix = this.tracking_items.current_transform;
      }
    }
  }
};
</script>
