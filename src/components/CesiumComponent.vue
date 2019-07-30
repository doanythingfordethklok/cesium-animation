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
import { calculatePositionFromMatrix, calculateDirectionFromMatrix, calculateOrientationFromMatrix } from "../lib/calc";

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
      this.createCone();

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
        this.viewer.entities.values.forEach(v => (v.show = false));
        this.tracking_items.debug_axis.show = false;
      } else {
        this.tracking_items.selected_node = e.target.value;
        this.viewer.entities.values.forEach(v => (v.show = true));
        this.tracking_items.debug_axis.show = true;
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

    createCone() {
      const { viewer, tracking_items } = this;

      const getPosition = translation => () => {
        return calculatePositionFromMatrix(tracking_items.current_transform, translation);
      };

      const getOrientation = () => {
        return calculateOrientationFromMatrix(tracking_items.current_transform);
      };

      const CONE_LENGTH = 50;
      viewer.entities.add({
        name: "cone",
        position: new Cesium.CallbackProperty(getPosition(new Cesium.Cartesian3(0, 0, CONE_LENGTH / 2)), false),
        orientation: new Cesium.CallbackProperty(getOrientation, false),
        show: false,
        cylinder: {
          length: CONE_LENGTH,
          topRadius: 20.0,
          bottomRadius: 0,
          material: Cesium.Color.PINK.withAlpha(0.3),
          outline: true,
          outlineColor: Cesium.Color.RED.withAlpha(0.5)
        }
      });

      const LINE_LENGTH = 500;
      viewer.entities.add({
        name: "boresight",
        position: new Cesium.CallbackProperty(getPosition(new Cesium.Cartesian3(0, 0, LINE_LENGTH / 2)), false),
        orientation: new Cesium.CallbackProperty(getOrientation, false),
        show: false,
        cylinder: {
          length: LINE_LENGTH,
          topRadius: 1,
          bottomRadius: 1,
          material: Cesium.Color.ORANGE,
          outline: true,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.5)
        }
      });
    },

    updateBoreSight() {
      const { tracking_items, viewer } = this;
      const boresight = this.viewer.entities.values.find(v => v.name == "boresight");

      if (boresight && tracking_items.selected_node !== null) {
        const ray = calculateDirectionFromMatrix(tracking_items.current_transform, new Cesium.Cartesian3(0, 0, 1));
        const intersection = viewer.scene.globe.pick(ray, viewer.scene);

        console.log(intersection);
        if (intersection === undefined) {
          console.log("no intersection");
          boresight.cylinder.material = Cesium.Color.ORANGE;
        } else {
          console.log("intersection");
          boresight.cylinder.material = Cesium.Color.PURPLE;
        }
      }
    },

    updateTransform() {
      const { tracking_items, viewer, animation_player, entity } = this;

      // updateTransform() can be called any time the main entity is updated (onNodeSelect, animation, etc)
      // it will calculate the world transform and store it so that the code can use it in the CallbackProperty.

      if (tracking_items.selected_node !== null) {
        tracking_items.current_transform = calcNodeWorldSpaceTransform(
          animation_player.animation_set,
          entity,
          tracking_items.selected_node
        );
      }

      if (tracking_items.debug_axis) {
        tracking_items.debug_axis.modelMatrix = tracking_items.current_transform;
      }

      this.updateBoreSight();
    }
  }
};
</script>
